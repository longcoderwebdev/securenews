process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/securenews_test';

const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

const PASSWORD = 'MatKhau12345';
const tokenFrom = (html) => /name="_csrf" value="([a-f0-9]+)"/.exec(html)[1];

async function csrfFor(agent, path) {
  const res = await agent.get(path);
  return tokenFrom(res.text);
}

async function registerUser(agent, overrides = {}) {
  const token = await csrfFor(agent, '/auth/register');
  return agent.post('/auth/register').type('form').send({
    _csrf: token,
    fullName: 'Nguyen Van A',
    email: 'a@test.vn',
    password: PASSWORD,
    confirmPassword: PASSWORD,
    ...overrides,
  });
}

async function loginUser(agent, email, password) {
  const token = await csrfFor(agent, '/auth/login');
  return agent.post('/auth/login').type('form').send({ _csrf: token, email, password });
}

describe('Đăng ký và đăng nhập', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await AuditLog.deleteMany({});
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('đăng ký thành công và mật khẩu được băm', async () => {
    const res = await registerUser(request.agent(app));
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/auth/login');
    const user = await User.findOne({ email: 'a@test.vn' }).select('+passwordHash');
    assert.equal(user.role, 'user');
    assert.notEqual(user.passwordHash, PASSWORD);
  });

  test('không nhận vai trò do client gửi lên', async () => {
    await registerUser(request.agent(app), { role: 'admin' });
    const user = await User.findOne({ email: 'a@test.vn' });
    assert.equal(user.role, 'user');
  });

  test('POST thiếu token CSRF bị từ chối 403', async () => {
    const res = await request(app)
      .post('/auth/register')
      .type('form')
      .send({ fullName: 'A', email: 'a@test.vn', password: PASSWORD, confirmPassword: PASSWORD });
    assert.equal(res.status, 403);
  });

  test('mật khẩu yếu bị từ chối 400', async () => {
    const res = await registerUser(request.agent(app), { password: '123', confirmPassword: '123' });
    assert.equal(res.status, 400);
    assert.equal(await User.countDocuments(), 0);
  });

  test('email trùng trả về 409', async () => {
    await registerUser(request.agent(app));
    const res = await registerUser(request.agent(app));
    assert.equal(res.status, 409);
    assert.equal(await User.countDocuments(), 1);
  });

  test('đăng nhập đúng thì về trang chủ và thấy tên người dùng', async () => {
    await registerUser(request.agent(app));
    const agent = request.agent(app);
    const res = await loginUser(agent, 'a@test.vn', PASSWORD);
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/');
    const home = await agent.get('/');
    assert.ok(home.text.includes('Nguyen Van A'));
  });

  test('sai mật khẩu và email không tồn tại cùng một thông báo', async () => {
    await registerUser(request.agent(app));
    const wrongPass = await loginUser(request.agent(app), 'a@test.vn', 'SaiMatKhau99');
    const noUser = await loginUser(request.agent(app), 'khong@test.vn', 'SaiMatKhau99');
    assert.equal(wrongPass.status, 401);
    assert.equal(noUser.status, 401);
    assert.ok(wrongPass.text.includes('Email hoặc mật khẩu không đúng'));
    assert.ok(noUser.text.includes('Email hoặc mật khẩu không đúng'));
  });

  test('khóa tài khoản sau 5 lần sai, đúng mật khẩu cũng không vào được', async () => {
    await registerUser(request.agent(app));
    for (let i = 0; i < 5; i += 1) {
      await loginUser(request.agent(app), 'a@test.vn', 'SaiMatKhau99');
    }
    const res = await loginUser(request.agent(app), 'a@test.vn', PASSWORD);
    assert.equal(res.status, 401);
    const user = await User.findOne({ email: 'a@test.vn' });
    assert.equal(user.isLocked(), true);
    assert.equal(await AuditLog.countDocuments({ action: 'ACCOUNT_LOCKED' }), 1);
  });

  test('đăng nhập sai được ghi vào nhật ký', async () => {
    await registerUser(request.agent(app));
    await loginUser(request.agent(app), 'a@test.vn', 'SaiMatKhau99');
    assert.equal(await AuditLog.countDocuments({ action: 'LOGIN_FAILED' }), 1);
  });
});