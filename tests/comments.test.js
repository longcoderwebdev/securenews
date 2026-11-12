process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/securenews_test_comments';

const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const app = require('../app');
const User = require('../models/User');
const Category = require('../models/Category');
const Article = require('../models/Article');
const Comment = require('../models/Comment');
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

const csrfOf = async (agent, path = '/') => tokenFrom((await agent.get(path)).text);

describe('Bình luận', () => {
  let user;
  let editor;
  let article;
  let category;

  const postComment = async (agent, content, slug = article.slug) =>
    agent
      .post(`/articles/${slug}/comments`)
      .type('form')
      .send({ _csrf: await csrfOf(agent), content });

  const makeComment = (extra = {}) =>
    Comment.create({ article: article._id, user: user._id, content: 'Bình luận cần kiểm duyệt', ...extra });

  before(async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  });

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Category.deleteMany({}),
      Article.deleteMany({}),
      Comment.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    [user, editor] = await User.create([
      { fullName: 'Nguoi Dung', email: 'user@test.vn', passwordHash, role: 'user' },
      { fullName: 'Bien Tap', email: 'editor@test.vn', passwordHash, role: 'editor' },
      { fullName: 'Quan Tri', email: 'admin@test.vn', passwordHash, role: 'admin' },
    ]);
    category = await Category.create({ name: 'An toàn thông tin', slug: 'an-toan-thong-tin' });
    article = await Article.create({
      title: 'Bài viết để bình luận',
      slug: 'bai-viet-de-binh-luan',
      content: '<p>Nội dung</p>',
      category: category._id,
      author: editor._id,
      status: 'published',
      publishedAt: new Date(),
    });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('khách thấy lời mời đăng nhập, không có form bình luận', async () => {
    const res = await request(app).get(`/articles/${article.slug}`);
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('để bình luận'));
    assert.ok(!res.text.includes('Gửi bình luận'));
  });

  test('người dùng đăng nhập bình luận được: lưu, hiển thị và ghi nhật ký', async () => {
    const agent = await loginAs('user@test.vn');
    const res = await postComment(agent, 'Bài viết rất hữu ích');
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, `/articles/${article.slug}`);
    const page = await agent.get(res.headers.location);
    assert.ok(page.text.includes('Bài viết rất hữu ích'));
    assert.ok(page.text.includes('Đã gửi bình luận'));
    assert.equal(await Comment.countDocuments(), 1);
    assert.equal(await AuditLog.countDocuments({ action: 'COMMENT_CREATE' }), 1);
  });

  test('khách chưa đăng nhập gửi bình luận bị 401', async () => {
    const agent = request.agent(app);
    const token = await csrfOf(agent, '/auth/login');
    const res = await agent
      .post(`/articles/${article.slug}/comments`)
      .type('form')
      .send({ _csrf: token, content: 'Bình luận của khách' });
    assert.equal(res.status, 401);
    assert.equal(await Comment.countDocuments(), 0);
  });

  test('thiếu token CSRF bị 403', async () => {
    const agent = await loginAs('user@test.vn');
    const res = await agent
      .post(`/articles/${article.slug}/comments`)
      .type('form')
      .send({ content: 'Không có token' });
    assert.equal(res.status, 403);
    assert.equal(await Comment.countDocuments(), 0);
  });

  test('mã độc trong bình luận bị escape khi hiển thị', async () => {
    const agent = await loginAs('user@test.vn');
    const res = await postComment(agent, '<script>alert(1)</script><img src=x onerror=alert(2)>');
    const page = await agent.get(res.headers.location);
    assert.ok(!page.text.includes('<script>alert(1)</script>'));
    assert.ok(page.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!page.text.includes('<img src=x'));
  });

  test('bình luận quá ngắn bị từ chối, có thông báo lỗi', async () => {
    const agent = await loginAs('user@test.vn');
    const res = await postComment(agent, 'a');
    assert.equal(res.status, 302);
    const page = await agent.get(res.headers.location);
    assert.ok(page.text.includes('Bình luận từ 2 đến 1000 ký tự'));
    assert.equal(await Comment.countDocuments(), 0);
  });

  test('bình luận quá dài (trên 1000 ký tự) bị từ chối', async () => {
    const agent = await loginAs('user@test.vn');
    await postComment(agent, 'a'.repeat(1001));
    assert.equal(await Comment.countDocuments(), 0);
  });

  test('không bình luận được dưới bài chưa đăng (404)', async () => {
    const draft = await Article.create({
      title: 'Bài nháp',
      slug: 'bai-nhap',
      content: '<p>x</p>',
      category: category._id,
      author: editor._id,
      status: 'draft',
    });
    const agent = await loginAs('user@test.vn');
    const res = await postComment(agent, 'Bình luận vào bài nháp', draft.slug);
    assert.equal(res.status, 404);
    assert.equal(await Comment.countDocuments(), 0);
  });

  test('biên tập viên ẩn bình luận: không còn hiển thị và có nhật ký', async () => {
    const c = await makeComment();
    const agent = await loginAs('editor@test.vn');
    const res = await agent
      .post(`/comments/${c.id}/hide`)
      .type('form')
      .send({ _csrf: await csrfOf(agent) });
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, `/articles/${article.slug}`);
    assert.equal((await Comment.findById(c.id)).status, 'hidden');
    assert.equal(await AuditLog.countDocuments({ action: 'COMMENT_HIDE' }), 1);
    const page = await request(app).get(`/articles/${article.slug}`);
    assert.ok(!page.text.includes('Bình luận cần kiểm duyệt'));
  });

  test('admin cũng ẩn được bình luận', async () => {
    const c = await makeComment();
    const agent = await loginAs('admin@test.vn');
    const res = await agent
      .post(`/comments/${c.id}/hide`)
      .type('form')
      .send({ _csrf: await csrfOf(agent) });
    assert.equal(res.status, 302);
    assert.equal((await Comment.findById(c.id)).status, 'hidden');
  });

  test('người dùng thường ẩn bình luận bị 403, bình luận giữ nguyên', async () => {
    const c = await makeComment();
    const agent = await loginAs('user@test.vn');
    const res = await agent
      .post(`/comments/${c.id}/hide`)
      .type('form')
      .send({ _csrf: await csrfOf(agent) });
    assert.equal(res.status, 403);
    assert.equal((await Comment.findById(c.id)).status, 'visible');
    assert.equal(await AuditLog.countDocuments({ action: 'ACCESS_DENIED' }), 1);
  });

  test('ẩn lần hai không tạo thêm nhật ký', async () => {
    const c = await makeComment();
    const agent = await loginAs('editor@test.vn');
    const token = await csrfOf(agent);
    await agent.post(`/comments/${c.id}/hide`).type('form').send({ _csrf: token });
    const again = await agent.post(`/comments/${c.id}/hide`).type('form').send({ _csrf: token });
    assert.equal(again.status, 302);
    assert.equal(again.headers.location, '/');
    assert.equal(await AuditLog.countDocuments({ action: 'COMMENT_HIDE' }), 1);
  });

  test('mã bình luận không hợp lệ trả về 404', async () => {
    const agent = await loginAs('editor@test.vn');
    const res = await agent
      .post('/comments/abc/hide')
      .type('form')
      .send({ _csrf: await csrfOf(agent) });
    assert.equal(res.status, 404);
  });

  test('nút Ẩn chỉ hiện cho biên tập viên và admin', async () => {
    const c = await makeComment();
    const hideAction = `/comments/${c.id}/hide`;

    const userAgent = await loginAs('user@test.vn');
    const asUser = await userAgent.get(`/articles/${article.slug}`);
    assert.ok(asUser.text.includes('Bình luận cần kiểm duyệt'));
    assert.ok(!asUser.text.includes(hideAction));

    const editorAgent = await loginAs('editor@test.vn');
    const asEditor = await editorAgent.get(`/articles/${article.slug}`);
    assert.ok(asEditor.text.includes(hideAction));
  });
});