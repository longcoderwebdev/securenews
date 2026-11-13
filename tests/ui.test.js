process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/securenews_test_ui';

const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const app = require('../app');
const User = require('../models/User');

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

// Mọi trang phải tương thích CSP chặt: không style hay script nhúng, không sự kiện nhúng, không CDN
function assertCspFriendly(html, where) {
  assert.ok(!/<style[\s>]/i.test(html), `${where}: có thẻ <style> nhúng`);
  assert.ok(!/\sstyle\s*=/i.test(html), `${where}: có thuộc tính style nhúng`);
  assert.ok(!/\son[a-z]+\s*=/i.test(html), `${where}: có sự kiện nhúng (onclick...)`);
  assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/i.test(html), `${where}: có thẻ <script> nhúng`);
  assert.ok(
    !/(?:https?:)?\/\/(?:cdn|unpkg|cdnjs|fonts\.googleapis|code\.jquery)/i.test(html),
    `${where}: nạp tài nguyên từ CDN`
  );
}

describe('Giao diện tương thích CSP', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  });

  beforeEach(async () => {
    await User.deleteMany({});
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    await User.create([
      { fullName: 'Quan Tri', email: 'admin@test.vn', passwordHash, role: 'admin' },
      { fullName: 'Nguoi Dung', email: 'user@test.vn', passwordHash, role: 'user' },
    ]);
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  for (const page of ['/', '/auth/login', '/auth/register', '/khong-ton-tai']) {
    test(`trang công khai ${page} không có mã nhúng và không dùng CDN`, async () => {
      const res = await request(app).get(page);
      assertCspFriendly(res.text, page);
      assert.ok(res.text.includes('/vendor/bootstrap/bootstrap.min.css'));
    });
  }

  test('Bootstrap được phục vụ từ chính máy chủ', async () => {
    const css = await request(app).get('/vendor/bootstrap/bootstrap.min.css');
    assert.equal(css.status, 200);
    assert.match(css.headers['content-type'], /css/);
    const js = await request(app).get('/vendor/bootstrap/bootstrap.bundle.min.js');
    assert.equal(js.status, 200);
    assert.match(js.headers['content-type'], /javascript/);
  });

  test('trang hồ sơ không có mã nhúng', async () => {
    const agent = await loginAs('user@test.vn');
    const res = await agent.get('/profile');
    assert.equal(res.status, 200);
    assertCspFriendly(res.text, '/profile');
  });

  test('bảng điều khiển admin: thanh bên có đủ mục và không có mã nhúng', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await agent.get('/admin');
    assert.equal(res.status, 200);
    assertCspFriendly(res.text, '/admin');
    for (const href of ['/admin/review', '/admin/categories', '/admin/users', '/admin/audit-logs', '/admin/backups']) {
      assert.ok(res.text.includes(`href="${href}"`), `thiếu liên kết ${href}`);
    }
    assert.ok(res.text.includes('aria-current="page"'));
  });

  test('thanh điều hướng đổi theo vai trò', async () => {
    const guest = await request(app).get('/');
    assert.ok(guest.text.includes('href="/auth/login"'));
    assert.ok(!guest.text.includes('href="/admin"'));

    const user = await (await loginAs('user@test.vn')).get('/');
    assert.ok(!user.text.includes('href="/auth/login"'));
    assert.ok(!user.text.includes('href="/admin"'));

    const admin = await (await loginAs('admin@test.vn')).get('/');
    assert.ok(admin.text.includes('href="/admin"'));
  });
});