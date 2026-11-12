process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/securenews_test_review';

const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const app = require('../app');
const User = require('../models/User');
const Category = require('../models/Category');
const Article = require('../models/Article');
const AuditLog = require('../models/AuditLog');

const PASSWORD = 'MatKhau12345';
const tokenFrom = (html) => /name="_csrf" value="([a-f0-9]+)"/.exec(html)[1];

async function loginAs(email) {
  const agent = request.agent(app);
  const page = await agent.get('/auth/login');
  await agent
    .post('/auth/login')
    .type('form')
    .send({ _csrf: tokenFrom(page.text), email, password: PASSWORD });
  return agent;
}

const csrfOf = async (agent) => tokenFrom((await agent.get('/')).text);

describe('Admin duyệt bài', () => {
  let editor;
  let admin;
  let category;

  const makeArticle = (extra = {}) =>
    Article.create({
      title: 'Bài viết mẫu',
      slug: `bai-viet-mau-${Math.random().toString(16).slice(2, 8)}`,
      content: '<p>Nội dung</p>',
      category: category._id,
      author: editor._id,
      status: 'pending',
      submittedAt: new Date(),
      ...extra,
    });

  before(async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Category.deleteMany({}), Article.deleteMany({}), AuditLog.deleteMany({})]);
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    [editor, admin] = await User.create([
      { fullName: 'Editor', email: 'editor@test.vn', passwordHash, role: 'editor' },
      { fullName: 'Admin', email: 'admin@test.vn', passwordHash, role: 'admin' },
    ]);
    category = await Category.create({ name: 'An toàn thông tin', slug: 'an-toan-thong-tin' });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('danh sách chỉ hiện bài chờ duyệt, không hiện bản nháp', async () => {
    await makeArticle({ title: 'Bài đang chờ duyệt' });
    await makeArticle({ title: 'Bài còn là nháp', status: 'draft' });
    const agent = await loginAs('admin@test.vn');
    const res = await agent.get('/admin/review');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Bài đang chờ duyệt'));
    assert.ok(!res.text.includes('Bài còn là nháp'));
  });

  test('biên tập viên vào /admin/review bị 403', async () => {
    const agent = await loginAs('editor@test.vn');
    const res = await agent.get('/admin/review');
    assert.equal(res.status, 403);
  });

  test('admin duyệt bài: published, có người duyệt và nhật ký', async () => {
    const a = await makeArticle();
    const agent = await loginAs('admin@test.vn');
    const res = await agent.post(`/admin/review/${a.id}/approve`).set('x-csrf-token', await csrfOf(agent));
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/admin/review');
    const saved = await Article.findById(a.id);
    assert.equal(saved.status, 'published');
    assert.ok(saved.publishedAt);
    assert.equal(String(saved.approvedBy), admin.id);
    assert.equal(await AuditLog.countDocuments({ action: 'ARTICLE_APPROVE' }), 1);
  });

  test('duyệt thiếu token CSRF bị 403 và bài giữ nguyên', async () => {
    const a = await makeArticle();
    const agent = await loginAs('admin@test.vn');
    const res = await agent.post(`/admin/review/${a.id}/approve`);
    assert.equal(res.status, 403);
    assert.equal((await Article.findById(a.id)).status, 'pending');
  });

  test('từ chối không có lý do bị 400 và bài giữ nguyên', async () => {
    const a = await makeArticle();
    const agent = await loginAs('admin@test.vn');
    const res = await agent
      .post(`/admin/review/${a.id}/reject`)
      .type('form')
      .send({ _csrf: await csrfOf(agent), reason: '' });
    assert.equal(res.status, 400);
    assert.equal((await Article.findById(a.id)).status, 'pending');
  });

  test('từ chối có lý do: rejected, tác giả thấy lý do', async () => {
    const a = await makeArticle();
    const adminAgent = await loginAs('admin@test.vn');
    const res = await adminAgent
      .post(`/admin/review/${a.id}/reject`)
      .type('form')
      .send({ _csrf: await csrfOf(adminAgent), reason: 'Cần bổ sung nguồn tham khảo' });
    assert.equal(res.status, 302);
    const saved = await Article.findById(a.id);
    assert.equal(saved.status, 'rejected');
    assert.equal(saved.rejectReason, 'Cần bổ sung nguồn tham khảo');
    assert.equal(await AuditLog.countDocuments({ action: 'ARTICLE_REJECT' }), 1);

    const editorAgent = await loginAs('editor@test.vn');
    const list = await editorAgent.get('/editor/articles');
    assert.ok(list.text.includes('Cần bổ sung nguồn tham khảo'));
  });

  test('duyệt lần hai không ghi đè, chỉ có một nhật ký duyệt', async () => {
    const a = await makeArticle();
    const agent = await loginAs('admin@test.vn');
    const token = await csrfOf(agent);
    await agent.post(`/admin/review/${a.id}/approve`).set('x-csrf-token', token);
    const again = await agent.post(`/admin/review/${a.id}/approve`).set('x-csrf-token', token);
    assert.equal(again.status, 302);
    assert.equal((await Article.findById(a.id)).status, 'published');
    assert.equal(await AuditLog.countDocuments({ action: 'ARTICLE_APPROVE' }), 1);
  });

  test('admin không xem được bản nháp của biên tập viên (404)', async () => {
    const a = await makeArticle({ status: 'draft' });
    const agent = await loginAs('admin@test.vn');
    const res = await agent.get(`/admin/review/${a.id}`);
    assert.equal(res.status, 404);
  });

  test('mã bài viết không hợp lệ trả về 404', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await agent.get('/admin/review/abc');
    assert.equal(res.status, 404);
  });

  test('mã độc lọt vào CSDL vẫn không được xuất ra trang duyệt', async () => {
    const a = await makeArticle({ content: '<p>An toàn</p><script>alert(1)</script><img src=x onerror=alert(2)>' });
    const agent = await loginAs('admin@test.vn');
    const res = await agent.get(`/admin/review/${a.id}`);
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('<p>An toàn</p>'));
    assert.ok(!res.text.includes('alert(1)'));
    assert.ok(!res.text.includes('onerror'));
  });
});