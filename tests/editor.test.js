process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/securenews_test_editor';

const fs = require('fs/promises');
const path = require('path');
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
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
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

async function csrfOf(agent) {
  const res = await agent.get('/');
  return tokenFrom(res.text);
}

describe('Biên tập viên soạn bài', () => {
  let editor;
  let editor2;
  let category;
  const createdFiles = [];

  const makeArticle = (author, extra = {}) =>
    Article.create({
      title: 'Bài viết mẫu',
      slug: `bai-viet-mau-${Math.random().toString(16).slice(2, 8)}`,
      content: '<p>Nội dung</p>',
      category: category._id,
      author: author._id,
      ...extra,
    });

  function postArticle(agent, token, { withFile = true, file = PNG, filename = 'cover.png', ...extra } = {}) {
    const fields = {
      title: 'Cách nhận biết email lừa đảo',
      summary: 'Tóm tắt ngắn',
      content: '<p>Nội dung bài viết</p>',
      category: category.id,
      ...extra,
    };
    let req = agent.post('/editor/articles');
    if (token) req = req.set('x-csrf-token', token);
    Object.entries(fields).forEach(([k, v]) => {
      req = req.field(k, v);
    });
    if (withFile) req = req.attach('coverImage', file, { filename, contentType: 'image/png' });
    return req;
  }

  before(async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Category.deleteMany({}), Article.deleteMany({}), AuditLog.deleteMany({})]);
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    [editor, editor2] = await User.create([
      { fullName: 'Editor 1', email: 'e1@test.vn', passwordHash, role: 'editor' },
      { fullName: 'Editor 2', email: 'e2@test.vn', passwordHash, role: 'editor' },
      { fullName: 'User', email: 'user@test.vn', passwordHash, role: 'user' },
      { fullName: 'Admin', email: 'admin@test.vn', passwordHash, role: 'admin' },
    ]);
    category = await Category.create({ name: 'An toàn thông tin', slug: 'an-toan-thong-tin' });
  });

  after(async () => {
    await Promise.all(createdFiles.map((f) => fs.unlink(path.join(UPLOAD_DIR, f)).catch(() => {})));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('tạo bài kèm ảnh PNG: lưu nháp, ảnh được ghi với tên ngẫu nhiên', async () => {
    const agent = await loginAs('e1@test.vn');
    const res = await postArticle(agent, await csrfOf(agent));
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/editor/articles');
    const a = await Article.findOne({});
    createdFiles.push(a.coverImage);
    assert.equal(a.status, 'draft');
    assert.match(a.coverImage, /^[a-f0-9]{32}\.png$/);
    await fs.access(path.join(UPLOAD_DIR, a.coverImage));
  });

  test('tạo bài không có ảnh vẫn được', async () => {
    const agent = await loginAs('e1@test.vn');
    const res = await postArticle(agent, await csrfOf(agent), { withFile: false });
    assert.equal(res.status, 302);
    const a = await Article.findOne({});
    assert.equal(a.coverImage, undefined);
  });

  test('tệp giả làm ảnh (nội dung chữ) bị từ chối 400', async () => {
    const agent = await loginAs('e1@test.vn');
    const fake = Buffer.from('day khong phai la anh, chi la chu thuong');
    const res = await postArticle(agent, await csrfOf(agent), { file: fake, filename: 'fake.png' });
    assert.equal(res.status, 400);
    assert.equal(await Article.countDocuments(), 0);
  });

  test('ảnh vượt 2 MB bị từ chối 400', async () => {
    const agent = await loginAs('e1@test.vn');
    const big = Buffer.alloc(2 * 1024 * 1024 + 1024, 1);
    const res = await postArticle(agent, await csrfOf(agent), { file: big });
    assert.equal(res.status, 400);
    assert.equal(await Article.countDocuments(), 0);
  });

  test('thiếu token CSRF khi tải lên bị 403', async () => {
    const agent = await loginAs('e1@test.vn');
    const res = await postArticle(agent, null, { withFile: false });
    assert.equal(res.status, 403);
    assert.equal(await Article.countDocuments(), 0);
  });

  test('người dùng thường vào /editor/articles bị 403', async () => {
    const agent = await loginAs('user@test.vn');
    const res = await agent.get('/editor/articles');
    assert.equal(res.status, 403);
  });

  test('quản trị viên không soạn bài (403)', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await agent.get('/editor/articles/new');
    assert.equal(res.status, 403);
  });

  test('trang soạn bài liệt kê danh mục', async () => {
    const agent = await loginAs('e1@test.vn');
    const res = await agent.get('/editor/articles/new');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('An toàn thông tin'));
  });

  test('danh sách chỉ hiện bài của chính mình', async () => {
    await makeArticle(editor, { title: 'Bài của E1' });
    await makeArticle(editor2, { title: 'Bài của E2' });
    const agent = await loginAs('e1@test.vn');
    const res = await agent.get('/editor/articles');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Bài của E1'));
    assert.ok(!res.text.includes('Bài của E2'));
  });

  test('gửi duyệt qua trang: draft chuyển sang pending và có nhật ký', async () => {
    const a = await makeArticle(editor);
    const agent = await loginAs('e1@test.vn');
    const res = await agent
      .post(`/editor/articles/${a.id}/submit`)
      .set('x-csrf-token', await csrfOf(agent));
    assert.equal(res.status, 302);
    assert.equal((await Article.findById(a.id)).status, 'pending');
    assert.equal(await AuditLog.countDocuments({ action: 'ARTICLE_SUBMIT' }), 1);
  });

  test('gửi duyệt bài của người khác bị 403', async () => {
    const a = await makeArticle(editor2);
    const agent = await loginAs('e1@test.vn');
    const res = await agent
      .post(`/editor/articles/${a.id}/submit`)
      .set('x-csrf-token', await csrfOf(agent));
    assert.equal(res.status, 403);
    assert.equal((await Article.findById(a.id)).status, 'draft');
  });

  test('bài đang chờ duyệt không sửa được qua trang', async () => {
    const a = await makeArticle(editor, { status: 'pending', title: 'Tiêu đề gốc' });
    const agent = await loginAs('e1@test.vn');
    const res = await agent.post(`/editor/articles/${a.id}`).type('form').send({
      _csrf: await csrfOf(agent),
      title: 'Tiêu đề đã bị đổi',
      summary: '',
      content: '<p>x</p>',
      category: category.id,
    });
    assert.equal(res.status, 302);
    assert.equal((await Article.findById(a.id)).title, 'Tiêu đề gốc');
  });
});