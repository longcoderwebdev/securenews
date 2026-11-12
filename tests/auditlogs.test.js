process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/securenews_test_audit';

const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const app = require('../app');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

const PASSWORD = 'MatKhau12345';
const tokenFrom = (html) => /name="_csrf" value="([a-f0-9]+)"/.exec(html)[1];
const countRows = (html) => (html.match(/class="log-row"/g) || []).length;

async function loginAs(email) {
  const agent = request.agent(app);
  const page = await agent.get('/auth/login');
  await agent
    .post('/auth/login')
    .type('form')
    .send({ _csrf: tokenFrom(page.text), email, password: PASSWORD });
  return agent;
}

describe('Tra cứu nhật ký hoạt động', () => {
  let admin;
  let user;

  before(async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), AuditLog.deleteMany({})]);
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    [admin, user] = await User.create([
      { fullName: 'Quan Tri', email: 'admin@test.vn', passwordHash, role: 'admin' },
      { fullName: 'Nguoi Dung', email: 'user@test.vn', passwordHash, role: 'user' },
      { fullName: 'Bien Tap', email: 'editor@test.vn', passwordHash, role: 'editor' },
    ]);
    await AuditLog.create([
      { user: user._id, action: 'LOGIN_FAILED', target: 'marker-login-failed', result: 'failure' },
      { user: user._id, action: 'ACCESS_DENIED', target: 'marker-denied', result: 'failure' },
      { user: admin._id, action: 'USER_LOCK', target: 'marker-admin-action', result: 'success' },
    ]);
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('admin xem được nhật ký', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await agent.get('/admin/audit-logs');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('marker-login-failed'));
    assert.ok(res.text.includes('marker-denied'));
  });

  test('biên tập viên và người dùng thường bị 403', async () => {
    for (const email of ['editor@test.vn', 'user@test.vn']) {
      const agent = await loginAs(email);
      const res = await agent.get('/admin/audit-logs');
      assert.equal(res.status, 403);
    }
  });

  test('lọc theo hành động', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await agent.get('/admin/audit-logs').query({ action: 'ACCESS_DENIED' });
    assert.ok(res.text.includes('marker-denied'));
    assert.ok(!res.text.includes('marker-login-failed'));
  });

  test('lọc theo email người dùng', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await agent.get('/admin/audit-logs').query({ email: 'user@test.vn' });
    assert.ok(res.text.includes('marker-login-failed'));
    assert.ok(!res.text.includes('marker-admin-action'));

    const unknown = await agent.get('/admin/audit-logs').query({ email: 'khong-co@test.vn' });
    assert.equal(unknown.status, 200);
    assert.equal(countRows(unknown.text), 0);
  });

  test('lọc theo kết quả thất bại', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await agent.get('/admin/audit-logs').query({ result: 'failure' });
    assert.ok(res.text.includes('marker-denied'));
    assert.ok(!res.text.includes('marker-admin-action'));
  });

  test('lọc theo khoảng ngày', async () => {
    const old = await AuditLog.create({ user: user._id, action: 'LOGIN_SUCCESS', target: 'marker-old-log' });
        await AuditLog.collection.updateOne(
      { _id: old._id },
      { $set: { createdAt: new Date('2020-01-15T10:00:00') } }
    );

    const agent = await loginAs('admin@test.vn');
    const res = await agent.get('/admin/audit-logs').query({ from: '2020-01-01', to: '2020-01-31' });
    assert.ok(res.text.includes('marker-old-log'));
    assert.ok(!res.text.includes('marker-denied'));
  });

  test('bộ lọc không hợp lệ bị bỏ qua, không gây lỗi', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await agent
      .get('/admin/audit-logs')
      .query({ action: '<script>alert(1)</script>', from: 'abc', to: '99-99-99', result: 'zzz' });
    assert.equal(res.status, 200);
    assert.ok(!res.text.includes('<script>alert(1)</script>'));
    assert.ok(res.text.includes('marker-denied'));
  });

  test('phân trang: 50 dòng mỗi trang', async () => {
    await AuditLog.insertMany(
      Array.from({ length: 60 }, (_, i) => ({ user: user._id, action: 'PAGE_TEST', target: `row-${i}` }))
    );
    const agent = await loginAs('admin@test.vn');
    const page1 = await agent.get('/admin/audit-logs').query({ action: 'PAGE_TEST' });
    assert.equal(countRows(page1.text), 50);
    const page2 = await agent.get('/admin/audit-logs').query({ action: 'PAGE_TEST', page: 2 });
    assert.equal(countRows(page2.text), 10);
  });

  test('không có chức năng sửa hay xóa nhật ký', async () => {
    const total = await AuditLog.countDocuments();
    const agent = await loginAs('admin@test.vn');
    const csrf = tokenFrom((await agent.get('/profile')).text);
    const post = await agent.post('/admin/audit-logs').set('x-csrf-token', csrf).send({});
    const del = await agent.delete('/admin/audit-logs').set('x-csrf-token', csrf);
    assert.equal(post.status, 404);
    assert.equal(del.status, 404);
    assert.ok((await AuditLog.countDocuments()) >= total);
  });
});