const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { validateEnv } = require('../config/env');

const GOOD = { MONGO_URI: 'mongodb://x', SESSION_SECRET: 'a'.repeat(40), BACKUP_KEY: 'ab'.repeat(32) };

describe('Kiểm tra cấu hình môi trường', () => {
  test('thiếu MONGO_URI và SESSION_SECRET: báo cả hai', () => {
    const problems = validateEnv({});
    assert.equal(problems.length, 2);
    assert.ok(problems.some((p) => p.includes('MONGO_URI')));
    assert.ok(problems.some((p) => p.includes('SESSION_SECRET')));
  });

  test('production: SESSION_SECRET quá ngắn bị báo', () => {
    const problems = validateEnv({ ...GOOD, NODE_ENV: 'production', SESSION_SECRET: 'ngan' });
    assert.ok(problems.some((p) => p.includes('SESSION_SECRET')));
  });

  test('production: thiếu BACKUP_KEY hợp lệ bị báo', () => {
    const problems = validateEnv({ ...GOOD, NODE_ENV: 'production', BACKUP_KEY: '' });
    assert.ok(problems.some((p) => p.includes('BACKUP_KEY')));
  });

  test('production: cấu hình đủ thì hợp lệ', () => {
    assert.deepEqual(validateEnv({ ...GOOD, NODE_ENV: 'production' }), []);
  });

  test('môi trường phát triển không ép độ dài khóa', () => {
    const env = { ...GOOD, NODE_ENV: 'development', SESSION_SECRET: 'abc', BACKUP_KEY: '' };
    assert.deepEqual(validateEnv(env), []);
  });
});