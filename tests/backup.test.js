process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/securenews_test_backup';
process.env.BACKUP_KEY = 'ab'.repeat(32);

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const ROOT = path.join(os.tmpdir(), `securenews-backup-test-${process.pid}`);
const LOCAL = path.join(ROOT, 'local');
const OFFSITE = path.join(ROOT, 'offsite');
process.env.BACKUP_DIR = LOCAL;
process.env.BACKUP_OFFSITE_DIR = OFFSITE;

const app = require('../app');
const User = require('../models/User');
const Category = require('../models/Category');
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const AuditLog = require('../models/AuditLog');
const BackupRecord = require('../models/BackupRecord');
const backupService = require('../services/backupService');

const PASSWORD = 'MatKhau12345';
const meta = { ip: '127.0.0.1', userAgent: 'test' };
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

const csrfOf = async (agent) => tokenFrom((await agent.get('/profile')).text);

describe('Sao lưu và phục hồi', () => {
  let admin;
  let editor;
  let category;

  before(async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  });

  beforeEach(async () => {
    await fs.rm(ROOT, { recursive: true, force: true });
    await Promise.all([
      User.deleteMany({}),
      Category.deleteMany({}),
      Article.deleteMany({}),
      Comment.deleteMany({}),
      AuditLog.deleteMany({}),
      BackupRecord.deleteMany({}),
    ]);
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    [admin, editor] = await User.create([
      { fullName: 'Quan Tri', email: 'admin@test.vn', passwordHash, role: 'admin' },
      { fullName: 'Bien Tap', email: 'editor@test.vn', passwordHash, role: 'editor' },
    ]);
    category = await Category.create({ name: 'An toàn thông tin', slug: 'an-toan-thong-tin' });
    const article = await Article.create({
      title: 'Bài viết mẫu',
      slug: 'bai-viet-mau',
      content: '<p>Nội dung</p>',
      category: category._id,
      author: editor._id,
      status: 'published',
      publishedAt: new Date(),
    });
    await Comment.create({ article: article._id, user: admin._id, content: 'Bình luận mẫu' });
  });

  after(async () => {
    await fs.rm(ROOT, { recursive: true, force: true });
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('tạo sao lưu: tệp .enc, bản ghi, checksum khớp và có nhật ký', async () => {
    const r = await backupService.createBackup({ type: 'daily', adminId: admin.id, meta });
    assert.equal(r.status, 'success');
    assert.match(r.fileName, /^daily-\d{8}-\d{6}-[a-f0-9]{6}\.enc$/);
    const file = await fs.readFile(path.join(LOCAL, r.fileName));
    assert.equal(r.sizeBytes, file.length);
    assert.equal(r.checksum, crypto.createHash('sha256').update(file).digest('hex'));
    assert.equal(await AuditLog.countDocuments({ action: 'BACKUP_SUCCESS' }), 1);
  });

  test('tệp sao lưu được mã hóa, không chứa dữ liệu dạng rõ', async () => {
    const r = await backupService.createBackup({ type: 'daily', adminId: admin.id, meta });
    const file = await fs.readFile(path.join(LOCAL, r.fileName));
    assert.equal(file.subarray(0, 5).toString(), 'SNBK1');
    assert.ok(!file.includes('admin@test.vn'));
    assert.ok(!file.includes('Bài viết mẫu'));
  });

  test('có bản sao lưu ngoài tuyến', async () => {
    const r = await backupService.createBackup({ type: 'daily', adminId: admin.id, meta });
    assert.equal(r.location, 'offsite');
    await fs.access(path.join(OFFSITE, r.fileName));
  });

  test('thiếu khóa mã hóa: sao lưu thất bại, có bản ghi lỗi và nhật ký', async () => {
    const key = process.env.BACKUP_KEY;
    delete process.env.BACKUP_KEY;
    try {
      await assert.rejects(
        backupService.createBackup({ type: 'manual', adminId: admin.id, meta }),
        (err) => err.status === 500
      );
    } finally {
      process.env.BACKUP_KEY = key;
    }
    assert.ok(await BackupRecord.findOne({ status: 'failed' }));
    assert.equal(await AuditLog.countDocuments({ action: 'BACKUP_FAILED' }), 1);
  });

  test('phục hồi trả lại dữ liệu, tạo bản an toàn trước và giữ nguyên nhật ký', async () => {
    const r = await backupService.createBackup({ type: 'daily', adminId: admin.id, meta });
    await Article.deleteMany({});
    await Comment.deleteMany({});
    await User.updateOne({ _id: editor._id }, { fullName: 'Da bi doi' });
    const logsBefore = await AuditLog.countDocuments();

    const summary = await backupService.restore(r.id, { id: admin.id }, meta);
    assert.equal(summary.articles, 1);
    assert.equal(summary.users, 2);
    assert.equal(await Article.countDocuments(), 1);
    assert.equal(await Comment.countDocuments(), 1);
    assert.equal((await User.findById(editor.id)).fullName, 'Bien Tap');
    assert.equal(await BackupRecord.countDocuments({ type: 'manual' }), 1);
    assert.ok((await AuditLog.countDocuments()) > logsBefore);
    assert.equal(await AuditLog.countDocuments({ action: 'RESTORE_SUCCESS' }), 1);
    assert.equal(await AuditLog.countDocuments({ action: 'BACKUP_SUCCESS' }), 2);
  });

  test('tệp bị sửa: từ chối phục hồi (409), dữ liệu giữ nguyên, có nhật ký', async () => {
    const r = await backupService.createBackup({ type: 'daily', adminId: admin.id, meta });
    const target = path.join(LOCAL, r.fileName);
    const file = await fs.readFile(target);
    file[40] ^= 0xff;
    await fs.writeFile(target, file);
    await Article.deleteMany({});

    await assert.rejects(backupService.restore(r.id, { id: admin.id }, meta), (err) => err.status === 409);
    assert.equal(await Article.countDocuments(), 0);
    assert.equal(await AuditLog.countDocuments({ action: 'RESTORE_FAILED' }), 1);
    assert.equal(await BackupRecord.countDocuments({ type: 'manual' }), 0);
  });

  test('tệp sao lưu bị xóa: trả 404', async () => {
    const r = await backupService.createBackup({ type: 'daily', adminId: admin.id, meta });
    await fs.rm(path.join(LOCAL, r.fileName));
    await assert.rejects(backupService.restore(r.id, { id: admin.id }, meta), (err) => err.status === 404);
  });

  test('chỉ giữ tối đa 7 bản sao lưu hằng ngày', async () => {
    for (let i = 0; i < 9; i += 1) {
      await backupService.createBackup({ type: 'daily', adminId: admin.id, meta });
    }
    assert.equal(await BackupRecord.countDocuments({ type: 'daily', status: 'success' }), 7);
    assert.equal((await fs.readdir(LOCAL)).length, 7);
  });

  test('loại sao lưu không hợp lệ bị từ chối 400', async () => {
    await assert.rejects(
      backupService.createBackup({ type: 'hourly', adminId: admin.id, meta }),
      (err) => err.status === 400
    );
  });

  test('mã bản sao lưu không hợp lệ trả 404', async () => {
    await assert.rejects(backupService.restore('abc', { id: admin.id }, meta), (err) => err.status === 404);
  });

  test('admin xem được trang sao lưu', async () => {
    const r = await backupService.createBackup({ type: 'daily', adminId: admin.id, meta });
    const agent = await loginAs('admin@test.vn');
    const res = await agent.get('/admin/backups');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Sao lưu và phục hồi'));
    assert.ok(res.text.includes(r.checksum.slice(0, 12)));
  });

  test('biên tập viên vào trang sao lưu bị 403', async () => {
    const agent = await loginAs('editor@test.vn');
    const res = await agent.get('/admin/backups');
    assert.equal(res.status, 403);
  });

  test('admin sao lưu thủ công qua trang', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await agent
      .post('/admin/backups')
      .type('form')
      .send({ _csrf: await csrfOf(agent) });
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/admin/backups');
    assert.equal(await BackupRecord.countDocuments({ type: 'manual', status: 'success' }), 1);
  });

  test('sao lưu thiếu token CSRF bị 403', async () => {
    const agent = await loginAs('admin@test.vn');
    const res = await agent.post('/admin/backups').type('form').send({});
    assert.equal(res.status, 403);
    assert.equal(await BackupRecord.countDocuments(), 0);
  });

  test('phục hồi sai mật khẩu bị từ chối, dữ liệu giữ nguyên', async () => {
    const r = await backupService.createBackup({ type: 'daily', adminId: admin.id, meta });
    await Article.deleteMany({});
    const agent = await loginAs('admin@test.vn');
    const res = await agent
      .post(`/admin/backups/${r.id}/restore`)
      .type('form')
      .send({ _csrf: await csrfOf(agent), password: 'SaiMatKhau99' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/admin/backups');
    assert.equal(await Article.countDocuments(), 0);
    assert.equal(await AuditLog.countDocuments({ action: 'RESTORE_FAILED' }), 1);
  });

  test('phục hồi đúng mật khẩu: dữ liệu trở lại và phải đăng nhập lại', async () => {
    const r = await backupService.createBackup({ type: 'daily', adminId: admin.id, meta });
    await Article.deleteMany({});
    const agent = await loginAs('admin@test.vn');
    const res = await agent
      .post(`/admin/backups/${r.id}/restore`)
      .type('form')
      .send({ _csrf: await csrfOf(agent), password: PASSWORD });
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/auth/login');
    assert.equal(await Article.countDocuments(), 1);

    const after = await agent.get('/admin/backups');
    assert.equal(after.status, 302);
    assert.equal(after.headers.location, '/auth/login');
  });
});