process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/securenews_test_profile';

const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const app = require('../app');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

const OLD = 'MatKhau12345';
const NEW = 'MatKhauMoi67890';
const tokenFrom = (html) => /name="_csrf" value="([a-f0-9]+)"/.exec(html)[1];

async function attemptLogin(agent, email, password) {
  const page = await agent.get('/auth/login');
  return agent.post('/auth/login').type('form').send({ _csrf: tokenFrom(page.text), email, password });
}

async function loginAs(email, password = OLD) {
  const agent = request.agent(app);
  await attemptLogin(agent, email, password);
  return agent;
}

const csrfOf = async (agent) => tokenFrom((await agent.get('/profile')).text);

describe('Hồ sơ và đổi mật khẩu', () => {
  let user;

  const changePassword = async (agent, fields) =>
    agent
      .post('/profile/password')
      .type('form')
      .send({ _csrf: await csrfOf(agent), ...fields });

  before(async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), AuditLog.deleteMany({})]);
    const passwordHash = await bcrypt.hash(OLD, 4);
    user = await User.create({ fullName: 'Nguoi Dung', email: 'user@test.vn', passwordHash, role: 'user' });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('khách vào /profile bị chuyển tới trang đăng nhập', async () => {
    const res = await request(app).get('/profile');
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/auth/login');
  });

  test('đổi họ tên thành công và ghi nhật ký', async () => {
    const agent = await loginAs('user@test.vn');
    const res = await agent
      .post('/profile')
      .type('form')
      .send({ _csrf: await csrfOf(agent), fullName: 'Ten Moi' });
    assert.equal(res.status, 302);
    assert.equal((await User.findById(user.id)).fullName, 'Ten Moi');
    assert.equal(await AuditLog.countDocuments({ action: 'PROFILE_UPDATE' }), 1);
  });

  test('họ tên quá ngắn bị từ chối 400', async () => {
    const agent = await loginAs('user@test.vn');
    const res = await agent
      .post('/profile')
      .type('form')
      .send({ _csrf: await csrfOf(agent), fullName: 'A' });
    assert.equal(res.status, 400);
    assert.equal((await User.findById(user.id)).fullName, 'Nguoi Dung');
  });

  test('đổi mật khẩu thành công: mật khẩu mới dùng được, mật khẩu cũ thì không', async () => {
    const agent = await loginAs('user@test.vn');
    const res = await changePassword(agent, { currentPassword: OLD, newPassword: NEW, confirmPassword: NEW });
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/profile');

    const withNew = await attemptLogin(request.agent(app), 'user@test.vn', NEW);
    assert.equal(withNew.status, 302);
    const withOld = await attemptLogin(request.agent(app), 'user@test.vn', OLD);
    assert.equal(withOld.status, 401);
    assert.equal(await AuditLog.countDocuments({ action: 'PASSWORD_CHANGE' }), 1);
  });

  test('sai mật khẩu hiện tại bị từ chối 400, mật khẩu giữ nguyên', async () => {
    const agent = await loginAs('user@test.vn');
    const res = await changePassword(agent, { currentPassword: 'SaiMatKhau99', newPassword: NEW, confirmPassword: NEW });
    assert.equal(res.status, 400);
    const withOld = await attemptLogin(request.agent(app), 'user@test.vn', OLD);
    assert.equal(withOld.status, 302);
    assert.equal(await AuditLog.countDocuments({ action: 'PASSWORD_CHANGE_FAILED' }), 1);
  });

  test('mật khẩu mới yếu bị từ chối 400', async () => {
    const agent = await loginAs('user@test.vn');
    const res = await changePassword(agent, { currentPassword: OLD, newPassword: '123', confirmPassword: '123' });
    assert.equal(res.status, 400);
  });

  test('nhập lại mật khẩu không khớp bị từ chối 400', async () => {
    const agent = await loginAs('user@test.vn');
    const res = await changePassword(agent, { currentPassword: OLD, newPassword: NEW, confirmPassword: 'KhacHan12345' });
    assert.equal(res.status, 400);
  });

  test('mật khẩu mới trùng mật khẩu cũ bị từ chối 400', async () => {
    const agent = await loginAs('user@test.vn');
    const res = await changePassword(agent, { currentPassword: OLD, newPassword: OLD, confirmPassword: OLD });
    assert.equal(res.status, 400);
  });

  test('đổi mật khẩu xong, thiết bị khác bị đăng xuất còn thiết bị hiện tại vẫn đăng nhập', async () => {
    const agentA = await loginAs('user@test.vn');
    const agentB = await loginAs('user@test.vn');
    assert.equal((await agentB.get('/profile')).status, 200);

    await changePassword(agentA, { currentPassword: OLD, newPassword: NEW, confirmPassword: NEW });

    const b = await agentB.get('/profile');
    assert.equal(b.status, 302);
    assert.equal(b.headers.location, '/auth/login');
    assert.equal((await agentA.get('/profile')).status, 200);
  });

  test('thiếu token CSRF khi đổi mật khẩu bị 403', async () => {
    const agent = await loginAs('user@test.vn');
    const res = await agent
      .post('/profile/password')
      .type('form')
      .send({ currentPassword: OLD, newPassword: NEW, confirmPassword: NEW });
    assert.equal(res.status, 403);
    const withOld = await attemptLogin(request.agent(app), 'user@test.vn', OLD);
    assert.equal(withOld.status, 302);
  });
});