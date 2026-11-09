process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');

test('GET /health trả về ok', async () => {
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok' });
});

test('Đường dẫn không tồn tại trả về 404', async () => {
  const res = await request(app).get('/khong-ton-tai');
  assert.equal(res.status, 404);
});