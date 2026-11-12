process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/securenews_test_users';

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

async function attemptLogin(agent, email, password = PASSWORD) {
  const page = await agent.get('/auth/login');
  return agent.post('/auth/login').type('form').send({ _csrf: tokenFrom(page.text), email, password });
}

async function loginAs(email) {
  const agent = request.agent(app);
  await attemptLogin(agent, email);
  return agent;
}

const csrfOf = async (agent) => tokenFrom((await agent.get('/profile')).text);

describe('Admin quản lý người dùng', () => {
  let admin;
  let editor;
  let user;

  const act = async (agent, path, fields = {}) =>
    agent
      .post(path)
      .type('form')
      .send({ _csrf: await csrfOf(agent), ...fields });

  before(async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), AuditLog.deleteMany({})]);
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    [admin, editor, user] = await User.create([
      { fullName: 'Quan Tri', email: 'admin@test.vn', passwordHash, role: 'admin' },
      { fullName: 'Bien Tap', email: 'editor@test.vn', passwordHash, role: 'editor' },
      { fullName: 'Nguoi Dung', email: 'user@test.vn', passwordHash, role: 'user' },
    ]);
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('admin xem được danh sách người dùng', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await agent.get('/admin/users');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('user@test.vn'));
    assert.ok(res.text.includes('editor@test.vn'));
  });

  test('biên tập viên và người dùng thường vào /admin/users bị 403', async () => {
    for (const email of ['editor@test.vn', 'user@test.vn']) {
      const agent = await loginAs(email);
      const res = await agent.get('/admin/users');
      assert.equal(res.status, 403);
    }
  });

  test('tìm theo từ khóa và lọc theo vai trò', async () => {
    const agent = await loginAs('admin@test.vn');
    const byKeyword = await agent.get('/admin/users').query({ q: 'editor' });
    assert.ok(byKeyword.text.includes('editor@test.vn'));
    assert.ok(!byKeyword.text.includes('user@test.vn'));

    const byRole = await agent.get('/admin/users').query({ role: 'admin' });
    assert.ok(byRole.text.includes('admin@test.vn'));
    assert.ok(!byRole.text.includes('user@test.vn'));
  });

  test('admin đổi vai trò user thành editor, có nhật ký', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await act(agent, `/admin/users/${user.id}/role`, { role: 'editor' });
    assert.equal(res.status, 302);
    assert.equal((await User.findById(user.id)).role, 'editor');
    assert.equal(await AuditLog.countDocuments({ action: 'USER_ROLE_CHANGE' }), 1);
  });

  test('vai trò không hợp lệ bị bỏ qua', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await act(agent, `/admin/users/${user.id}/role`, { role: 'superadmin' });
    assert.equal(res.status, 302);
    assert.equal((await User.findById(user.id)).role, 'user');
    assert.equal(await AuditLog.countDocuments({ action: 'USER_ROLE_CHANGE' }), 0);
  });

  test('admin không đổi được vai trò của chính mình', async () => {
    const agent = await loginAs('admin@test.vn');
    await act(agent, `/admin/users/${admin.id}/role`, { role: 'user' });
    assert.equal((await User.findById(admin.id)).role, 'admin');
  });

  test('admin khóa tài khoản: isActive false và có nhật ký', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await act(agent, `/admin/users/${user.id}/lock`);
    assert.equal(res.status, 302);
    assert.equal((await User.findById(user.id)).isActive, false);
    assert.equal(await AuditLog.countDocuments({ action: 'USER_LOCK' }), 1);
  });

  test('tài khoản bị khóa mất phiên đăng nhập ngay lập tức', async () => {
    const userAgent = await loginAs('user@test.vn');
    assert.equal((await userAgent.get('/profile')).status, 200);

    const adminAgent = await loginAs('admin@test.vn');
    await act(adminAgent, `/admin/users/${user.id}/lock`);

    const after = await userAgent.get('/profile');
    assert.equal(after.status, 302);
    assert.equal(after.headers.location, '/auth/login');
  });

  test('tài khoản bị khóa không đăng nhập lại được', async () => {
    const adminAgent = await loginAs('admin@test.vn');
    await act(adminAgent, `/admin/users/${user.id}/lock`);
    const res = await attemptLogin(request.agent(app), 'user@test.vn');
    assert.equal(res.status, 401);
  });

  test('mở khóa: xóa cả khóa tạm thời, đăng nhập lại được, có nhật ký', async () => {
    await User.updateOne(
      { _id: user._id },
      { isActive: false, failedAttempts: 3, lockUntil: new Date(Date.now() + 10 * 60 * 1000) }
    );
    const adminAgent = await loginAs('admin@test.vn');
    const res = await act(adminAgent, `/admin/users/${user.id}/unlock`);
    assert.equal(res.status, 302);

    const saved = await User.findById(user.id);
    assert.equal(saved.isActive, true);
    assert.equal(saved.failedAttempts, 0);
    assert.equal(saved.lockUntil, undefined);
    assert.equal(await AuditLog.countDocuments({ action: 'USER_UNLOCK' }), 1);

    const login = await attemptLogin(request.agent(app), 'user@test.vn');
    assert.equal(login.status, 302);
  });

  test('đổi vai trò có hiệu lực ngay: biên tập viên bị hạ quyền thì mất quyền soạn bài', async () => {
    const editorAgent = await loginAs('editor@test.vn');
    assert.equal((await editorAgent.get('/editor/articles')).status, 200);

    const adminAgent = await loginAs('admin@test.vn');
    await act(adminAgent, `/admin/users/${editor.id}/role`, { role: 'user' });

    assert.equal((await editorAgent.get('/editor/articles')).status, 403);
  });

  test('admin không khóa được chính mình', async () => {
    const agent = await loginAs('admin@test.vn');
    await act(agent, `/admin/users/${admin.id}/lock`);
    assert.equal((await User.findById(admin.id)).isActive, true);
  });

  test('thiếu token CSRF khi đổi vai trò bị 403, vai trò giữ nguyên', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await agent.post(`/admin/users/${user.id}/role`).type('form').send({ role: 'admin' });
    assert.equal(res.status, 403);
    assert.equal((await User.findById(user.id)).role, 'user');
  });

  test('mã người dùng không hợp lệ trả về 404', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await act(agent, '/admin/users/abc/lock');
    assert.equal(res.status, 404);
  });
});