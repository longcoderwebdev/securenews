const request = require('supertest');
const app = require('../app');

describe('Khung ứng dụng', () => {
  test('GET /health trả về ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('Đường dẫn không tồn tại trả về 404', async () => {
    const res = await request(app).get('/khong-ton-tai');
    expect(res.status).toBe(404);
  });
});