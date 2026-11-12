process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/securenews_test_article_service';

const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const Category = require('../models/Category');
const Article = require('../models/Article');
const AuditLog = require('../models/AuditLog');
const articleService = require('../services/articleService');

const meta = { ip: '127.0.0.1', userAgent: 'test' };
const asUser = (u) => ({ id: u.id, role: u.role });
const rejectsWith = (promise, status) => assert.rejects(promise, (err) => err.status === status);

describe('Dịch vụ bài viết', () => {
  let editor;
  let otherEditor;
  let admin;
  let category;

  const valid = (extra = {}) => ({
    title: 'Cách nhận biết email lừa đảo',
    summary: 'Tóm tắt ngắn',
    content: '<p>Nội dung bài viết</p>',
    category: category.id,
    ...extra,
  });

  before(async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Category.deleteMany({}), Article.deleteMany({}), AuditLog.deleteMany({})]);
    [editor, otherEditor, admin] = await User.create([
      { fullName: 'Editor 1', email: 'e1@test.vn', passwordHash: 'x', role: 'editor' },
      { fullName: 'Editor 2', email: 'e2@test.vn', passwordHash: 'x', role: 'editor' },
      { fullName: 'Admin', email: 'admin@test.vn', passwordHash: 'x', role: 'admin' },
    ]);
    category = await Category.create({ name: 'An toàn thông tin', slug: 'an-toan-thong-tin' });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('tạo bản nháp: trạng thái draft, có slug, ghi nhật ký', async () => {
    const a = await articleService.createDraft(asUser(editor), valid(), meta);
    assert.equal(a.status, 'draft');
    assert.match(a.slug, /^cach-nhan-biet-email-lua-dao-[a-f0-9]{6}$/);
    assert.equal(String(a.author), editor.id);
    assert.equal(await AuditLog.countDocuments({ action: 'ARTICLE_CREATE' }), 1);
  });

  test('nội dung bị lọc mã độc (XSS)', async () => {
    const dirty =
      '<p>Xin chào</p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">bấm</a>';
    const a = await articleService.createDraft(asUser(editor), valid({ content: dirty }), meta);
    assert.ok(a.content.includes('Xin chào'));
    assert.ok(!a.content.includes('<script'));
    assert.ok(!a.content.includes('onerror'));
    assert.ok(!a.content.includes('javascript:'));
  });

  test('tiêu đề quá ngắn bị từ chối 400', async () => {
    await rejectsWith(articleService.createDraft(asUser(editor), valid({ title: 'abc' }), meta), 400);
  });

  test('danh mục không tồn tại bị từ chối 400', async () => {
    const fake = new mongoose.Types.ObjectId().toString();
    await rejectsWith(articleService.createDraft(asUser(editor), valid({ category: fake }), meta), 400);
  });

  test('không nhận trường status do client gửi lên', async () => {
    const a = await articleService.createDraft(asUser(editor), valid({ status: 'published' }), meta);
    assert.equal(a.status, 'draft');
  });

  test('người khác sửa bài bị 403 và ghi ACCESS_DENIED', async () => {
    const a = await articleService.createDraft(asUser(editor), valid(), meta);
    await rejectsWith(articleService.updateDraft(a.id, asUser(otherEditor), valid({ title: 'Tiêu đề mới hơn' }), meta), 403);
    assert.equal(await AuditLog.countDocuments({ action: 'ACCESS_DENIED' }), 1);
  });

  test('gửi duyệt: draft chuyển sang pending', async () => {
    const a = await articleService.createDraft(asUser(editor), valid(), meta);
    const s = await articleService.submit(a.id, asUser(editor), meta);
    assert.equal(s.status, 'pending');
    assert.ok(s.submittedAt);
    assert.equal(await AuditLog.countDocuments({ action: 'ARTICLE_SUBMIT' }), 1);
  });

  test('bài đang chờ duyệt không sửa được (409)', async () => {
    const a = await articleService.createDraft(asUser(editor), valid(), meta);
    await articleService.submit(a.id, asUser(editor), meta);
    await rejectsWith(articleService.updateDraft(a.id, asUser(editor), valid({ title: 'Tiêu đề mới hơn' }), meta), 409);
  });

  test('admin duyệt: pending chuyển sang published', async () => {
    const a = await articleService.createDraft(asUser(editor), valid(), meta);
    await articleService.submit(a.id, asUser(editor), meta);
    const p = await articleService.approve(a.id, asUser(admin), meta);
    assert.equal(p.status, 'published');
    assert.ok(p.publishedAt);
    assert.equal(String(p.approvedBy), admin.id);
    assert.equal(await AuditLog.countDocuments({ action: 'ARTICLE_APPROVE' }), 1);
  });

  test('duyệt lần hai trả 409', async () => {
    const a = await articleService.createDraft(asUser(editor), valid(), meta);
    await articleService.submit(a.id, asUser(editor), meta);
    await articleService.approve(a.id, asUser(admin), meta);
    await rejectsWith(articleService.approve(a.id, asUser(admin), meta), 409);
  });

  test('không duyệt được bài còn là bản nháp (409)', async () => {
    const a = await articleService.createDraft(asUser(editor), valid(), meta);
    await rejectsWith(articleService.approve(a.id, asUser(admin), meta), 409);
  });

  test('từ chối cần lý do hợp lệ (400)', async () => {
    const a = await articleService.createDraft(asUser(editor), valid(), meta);
    await articleService.submit(a.id, asUser(editor), meta);
    await rejectsWith(articleService.reject(a.id, asUser(admin), 'x', meta), 400);
  });

  test('bị từ chối: tác giả sửa và gửi lại được', async () => {
    const a = await articleService.createDraft(asUser(editor), valid(), meta);
    await articleService.submit(a.id, asUser(editor), meta);
    const r = await articleService.reject(a.id, asUser(admin), 'Cần bổ sung nguồn tham khảo', meta);
    assert.equal(r.status, 'rejected');
    assert.equal(r.rejectReason, 'Cần bổ sung nguồn tham khảo');

    await articleService.updateDraft(a.id, asUser(editor), valid({ title: 'Tiêu đề đã chỉnh sửa' }), meta);
    const again = await articleService.submit(a.id, asUser(editor), meta);
    assert.equal(again.status, 'pending');
    assert.equal(again.rejectReason, undefined);
  });

  test('listMine chỉ trả bài của chính mình', async () => {
    await articleService.createDraft(asUser(editor), valid(), meta);
    await articleService.createDraft(asUser(otherEditor), valid({ title: 'Bài của người khác' }), meta);
    const { items, meta: m } = await articleService.listMine(asUser(editor));
    assert.equal(items.length, 1);
    assert.equal(m.total, 1);
  });
});
