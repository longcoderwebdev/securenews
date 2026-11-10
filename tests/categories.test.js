process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/securenews_test_categories';

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

async function csrfOf(agent, path = '/') {
  const res = await agent.get(path);
  return tokenFrom(res.text);
}

describe('Quản lý danh mục (admin)', () => {
//   let admin;
  let editor;

  before(async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Category.deleteMany({}), Article.deleteMany({}), AuditLog.deleteMany({})]);
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    [, editor] = await User.create([
      { fullName: 'Admin', email: 'admin@test.vn', passwordHash, role: 'admin' },
      { fullName: 'Editor', email: 'editor@test.vn', passwordHash, role: 'editor' },
    ]);
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  async function createCategory(agent, name = 'An toàn thông tin') {
    const token = await csrfOf(agent, '/admin/categories');
    return agent.post('/admin/categories').type('form').send({ _csrf: token, name, description: 'Mô tả' });
  }

  test('admin thêm danh mục: lưu vào CSDL và ghi nhật ký', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await createCategory(agent);
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/admin/categories');
    const c = await Category.findOne({ name: 'An toàn thông tin' });
    assert.equal(c.slug, 'an-toan-thong-tin');
    assert.equal(await AuditLog.countDocuments({ action: 'CATEGORY_CREATE' }), 1);
  });

  test('tên trùng bị từ chối 409', async () => {
    const agent = await loginAs('admin@test.vn');
    await createCategory(agent);
    const res = await createCategory(agent);
    assert.equal(res.status, 409);
    assert.equal(await Category.countDocuments(), 1);
  });

  test('tên quá ngắn bị từ chối 400', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await createCategory(agent, 'A');
    assert.equal(res.status, 400);
    assert.equal(await Category.countDocuments(), 0);
  });

  test('biên tập viên thêm danh mục bị 403', async () => {
    const agent = await loginAs('editor@test.vn');
    const token = await csrfOf(agent);
    const res = await agent.post('/admin/categories').type('form').send({ _csrf: token, name: 'Danh mục lậu' });
    assert.equal(res.status, 403);
    assert.equal(await Category.countDocuments(), 0);
  });

  test('POST thiếu token CSRF bị từ chối 403', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await agent.post('/admin/categories').type('form').send({ name: 'Không có token' });
    assert.equal(res.status, 403);
    assert.equal(await Category.countDocuments(), 0);
  });

  test('trang danh sách hiển thị danh mục đã có', async () => {
    const agent = await loginAs('admin@test.vn');
    await createCategory(agent, 'Thông báo');
    const res = await agent.get('/admin/categories');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Thông báo'));
  });

  test('admin sửa danh mục: tên và đường dẫn đổi theo', async () => {
    const agent = await loginAs('admin@test.vn');
    await createCategory(agent, 'Tin cũ');
    const c = await Category.findOne({ name: 'Tin cũ' });
    const token = await csrfOf(agent, `/admin/categories/${c.id}/edit`);
    const res = await agent
      .post(`/admin/categories/${c.id}`)
      .type('form')
      .send({ _csrf: token, name: 'Tin công nghệ', description: '' });
    assert.equal(res.status, 302);
    const updated = await Category.findById(c.id);
    assert.equal(updated.name, 'Tin công nghệ');
    assert.equal(updated.slug, 'tin-cong-nghe');
    assert.equal(await AuditLog.countDocuments({ action: 'CATEGORY_UPDATE' }), 1);
  });

  test('xóa danh mục chưa có bài viết thành công', async () => {
    const agent = await loginAs('admin@test.vn');
    await createCategory(agent, 'Tạm thời');
    const c = await Category.findOne({ name: 'Tạm thời' });
    const token = await csrfOf(agent, '/admin/categories');
    const res = await agent.post(`/admin/categories/${c.id}/delete`).type('form').send({ _csrf: token });
    assert.equal(res.status, 302);
    assert.equal(await Category.countDocuments(), 0);
    assert.equal(await AuditLog.countDocuments({ action: 'CATEGORY_DELETE' }), 1);
  });

  test('không xóa được danh mục đang có bài viết', async () => {
    const agent = await loginAs('admin@test.vn');
    await createCategory(agent, 'Có bài');
    const c = await Category.findOne({ name: 'Có bài' });
    await Article.create({
      title: 'Bài viết mẫu',
      slug: 'bai-viet-mau',
      content: '<p>Nội dung</p>',
      category: c._id,
      author: editor._id,
    });
    const token = await csrfOf(agent, '/admin/categories');
    await agent.post(`/admin/categories/${c.id}/delete`).type('form').send({ _csrf: token });
    assert.equal(await Category.countDocuments(), 1);
    assert.equal(await AuditLog.countDocuments({ action: 'CATEGORY_DELETE' }), 0);
  });

  test('mã danh mục không hợp lệ trả về 404', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await agent.get('/admin/categories/abc/edit');
    assert.equal(res.status, 404);
  });
});