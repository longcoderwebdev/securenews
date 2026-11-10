process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/securenews_test_rbac';

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

async function loginAs(email) {
  const agent = request.agent(app);
  const page = await agent.get('/auth/login');
  await agent
    .post('/auth/login')
    .type('form')
    .send({ _csrf: tokenFrom(page.text), email, password: PASSWORD });
  return agent;
}

describe('Phân quyền theo vai trò', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await AuditLog.deleteMany({});
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    await User.create([
      { fullName: 'Admin', email: 'admin@test.vn', passwordHash, role: 'admin' },
      { fullName: 'Editor', email: 'editor@test.vn', passwordHash, role: 'editor' },
      { fullName: 'User', email: 'user@test.vn', passwordHash, role: 'user' },
    ]);
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('khách chưa đăng nhập vào /admin bị chuyển tới trang đăng nhập', async () => {
    const res = await request(app).get('/admin');
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/auth/login');
  });

  test('người dùng thường vào /admin bị 403 và có ghi nhật ký', async () => {
    const agent = await loginAs('user@test.vn');
    const res = await agent.get('/admin');
    assert.equal(res.status, 403);
    assert.equal(await AuditLog.countDocuments({ action: 'ACCESS_DENIED' }), 1);
  });

  test('biên tập viên vào /admin bị 403', async () => {
    const agent = await loginAs('editor@test.vn');
    const res = await agent.get('/admin');
    assert.equal(res.status, 403);
  });

  test('quản trị viên vào được /admin', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await agent.get('/admin');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Bảng điều khiển quản trị'));
  });
});