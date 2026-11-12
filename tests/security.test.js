process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/securenews_test_security';

const fs = require('fs/promises');
const path = require('path');
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const app = require('../app');
const AppError = require('../utils/AppError');
const requestId = require('../middlewares/requestId');
const { notFound, errorHandler } = require('../middlewares/errorHandler');

describe('Header bảo mật và xử lý lỗi (ứng dụng thật)', () => {
  test('CSP chặt: cùng nguồn, không script nhúng, không iframe, không object', async () => {
    const res = await request(app).get('/auth/login');
    const csp = res.headers['content-security-policy'];
    assert.ok(csp.includes("default-src 'self'"));
    assert.ok(csp.includes("object-src 'none'"));
    assert.ok(csp.includes("frame-ancestors 'none'"));
    assert.ok(csp.includes("form-action 'self'"));
    assert.ok(csp.includes("script-src-attr 'none'"));
    assert.ok(!csp.includes('unsafe-inline'));
  });

  test('các header bảo mật khác đều có, không lộ X-Powered-By', async () => {
    const res = await request(app).get('/auth/login');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
    assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.ok(res.headers['permissions-policy'].includes('camera=()'));
    assert.ok(res.headers['strict-transport-security'].includes('max-age=15552000'));
    assert.equal(res.headers['x-powered-by'], undefined);
  });

  test('trang động không được lưu trong bộ nhớ đệm', async () => {
    const res = await request(app).get('/auth/login');
    assert.ok(res.headers['cache-control'].includes('no-store'));
  });

  test('mỗi yêu cầu có mã X-Request-Id riêng', async () => {
    const a = await request(app).get('/health');
    const b = await request(app).get('/health');
    assert.match(a.headers['x-request-id'], /^[0-9a-f-]{36}$/);
    assert.notEqual(a.headers['x-request-id'], b.headers['x-request-id']);
  });

  test('tệp tĩnh được phục vụ kèm nosniff', async () => {
    const res = await request(app).get('/css/style.css');
    assert.equal(res.status, 200);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });

  test('tệp bắt đầu bằng dấu chấm không bị phục vụ', async () => {
    const file = path.join(__dirname, '..', 'public', '.dotfile-test.txt');
    await fs.writeFile(file, 'bi mat');
    try {
      const res = await request(app).get('/.dotfile-test.txt');
      assert.equal(res.status, 404);
      assert.ok(!res.text.includes('bi mat'));
    } finally {
      await fs.rm(file, { force: true });
    }
  });

  test('đường dẫn thoát khỏi thư mục tĩnh không đọc được package.json', async () => {
    const res = await request(app).get('/%2e%2e/%2e%2e/package.json');
    assert.ok([400, 403, 404].includes(res.status));
    assert.ok(!res.text.includes('"dependencies"'));
  });

  test('trang 404 tiếng Việt, không lộ stack', async () => {
    const res = await request(app).get('/khong-ton-tai');
    assert.equal(res.status, 404);
    assert.ok(res.text.includes('Không tìm thấy trang'));
    assert.ok(!res.text.includes('node_modules'));
  });

  test('địa chỉ mã hóa hỏng trả 400, không lộ URIError', async () => {
    const res = await request(app).get('/articles/%E0%A4%A');
    assert.equal(res.status, 400);
    assert.ok(res.text.includes('Yêu cầu không hợp lệ'));
    assert.ok(!res.text.includes('URIError'));
  });

  test('JSON hỏng trả 400, không lộ SyntaxError', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    assert.equal(res.status, 400);
    assert.ok(!res.text.includes('SyntaxError'));
  });

  test('dữ liệu gửi lên quá lớn trả 413', async () => {
    const res = await request(app)
      .post('/auth/login')
      .type('form')
      .send(`a=${'x'.repeat(200 * 1024)}`);
    assert.equal(res.status, 413);
    assert.ok(res.text.includes('Dữ liệu quá lớn'));
  });
});

describe('Bộ xử lý lỗi (ứng dụng thu nhỏ)', () => {
  function miniApp() {
    const a = express();
    a.set('view engine', 'ejs');
    a.set('views', path.join(__dirname, '..', 'views'));
    a.use(requestId);
    a.get('/boom', () => {
      throw new Error('chi tiet noi bo bi mat');
    });
    a.get('/ban', (_req, _res, next) => next(new AppError(403, 'Bạn không đủ quyền với bài này')));
    a.get('/lib', (_req, _res, next) => next(Object.assign(new Error('English internal message'), { status: 400 })));
    a.use(notFound);
    a.use(errorHandler);
    return a;
  }

  async function withEnv(value, fn) {
    const old = process.env.NODE_ENV;
    process.env.NODE_ENV = value;
    try {
      return await fn();
    } finally {
      process.env.NODE_ENV = old;
    }
  }

  test('production: lỗi 500 ẩn chi tiết và có mã tham chiếu trùng X-Request-Id', async () => {
    await withEnv('production', async () => {
      const res = await request(miniApp()).get('/boom');
      assert.equal(res.status, 500);
      assert.ok(!res.text.includes('chi tiet noi bo bi mat'));
      assert.ok(!res.text.includes('node_modules'));
      assert.ok(res.text.includes(res.headers['x-request-id']));
    });
  });

  test('môi trường phát triển: lỗi 500 hiện chi tiết để gỡ lỗi', async () => {
    await withEnv('development', async () => {
      const res = await request(miniApp()).get('/boom');
      assert.equal(res.status, 500);
      assert.ok(res.text.includes('chi tiet noi bo bi mat'));
    });
  });

  test('lỗi nghiệp vụ 403 hiện đúng thông báo của ứng dụng', async () => {
    const res = await request(miniApp()).get('/ban');
    assert.equal(res.status, 403);
    assert.ok(res.text.includes('Bạn không đủ quyền với bài này'));
  });

  test('yêu cầu Accept JSON nhận JSON, không có stack', async () => {
    await withEnv('production', async () => {
      const res = await request(miniApp()).get('/boom').set('Accept', 'application/json');
      assert.equal(res.status, 500);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.requestId, res.headers['x-request-id']);
      assert.ok(!JSON.stringify(res.body).includes('chi tiet noi bo bi mat'));
      assert.equal(res.body.error.stack, undefined);
    });
  });

  test('lỗi 4xx của thư viện không lộ thông báo gốc bằng tiếng Anh', async () => {
    const res = await request(miniApp()).get('/lib');
    assert.equal(res.status, 400);
    assert.ok(!res.text.includes('English internal message'));
  });
});