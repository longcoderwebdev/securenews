const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const BackupRecord = require('../models/BackupRecord');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const audit = require('./auditService');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const { EJSON } = mongoose.mongo.BSON || require('bson');

const MAGIC = Buffer.from('SNBK1');
const BACKUP_COLLECTIONS = ['users', 'categories', 'articles', 'comments', 'auditlogs'];
const NEVER_RESTORE = ['auditlogs']; // nhật ký chỉ thêm mới, không bao giờ bị ghi đè
const TYPES = ['daily', 'weekly', 'monthly', 'manual'];
const RETENTION = { daily: 7, weekly: 4, monthly: 6 };
const FILE_RX = /^(daily|weekly|monthly|manual)-\d{8}-\d{6}-[a-f0-9]{6}\.enc$/;

let busy = false;

const backupDir = () => path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups'));
const offsiteDir = () => (process.env.BACKUP_OFFSITE_DIR ? path.resolve(process.env.BACKUP_OFFSITE_DIR) : null);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-');

function safePath(dir, fileName) {
  if (typeof fileName !== 'string' || !FILE_RX.test(fileName)) {
    throw new AppError(409, 'Tên tệp sao lưu không hợp lệ');
  }
  return path.join(dir, fileName);
}

function getKey() {
  const hex = process.env.BACKUP_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(hex)) {
    throw new AppError(500, 'Chưa cấu hình BACKUP_KEY hợp lệ (64 ký tự hex)');
  }
  return Buffer.from(hex, 'hex');
}

function encrypt(plain, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), data]);
}

function decrypt(file, key) {
  const invalid = () => new AppError(409, 'Tệp sao lưu không hợp lệ hoặc đã bị thay đổi');
  if (file.length < MAGIC.length + 28 || !file.subarray(0, MAGIC.length).equals(MAGIC)) throw invalid();
  const iv = file.subarray(5, 17);
  const tag = file.subarray(17, 33);
  const data = file.subarray(33);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  } catch {
    throw invalid();
  }
}

async function snapshot() {
  const db = mongoose.connection.db;
  const collections = {};
  for (const name of BACKUP_COLLECTIONS) {
    collections[name] = await db.collection(name).find({}).toArray();
  }
  return { version: 1, createdAt: new Date(), collections };
}

async function removeFiles(fileName) {
  const dirs = [backupDir(), offsiteDir()].filter(Boolean);
  for (const dir of dirs) {
    try {
      await fs.unlink(safePath(dir, fileName));
    } catch {
      // tệp đã mất hoặc không xóa được: bỏ qua
    }
  }
}

async function prune(type) {
  const keep = RETENTION[type];
  if (!keep) return;
  const old = await BackupRecord.find({ type, status: 'success' }).sort('-createdAt').skip(keep).lean();
  for (const record of old) {
    await removeFiles(record.fileName);
    await BackupRecord.deleteOne({ _id: record._id });
  }
}

async function createBackup({ type = 'manual', adminId, meta = {} } = {}) {
  if (!TYPES.includes(type)) throw new AppError(400, 'Loại sao lưu không hợp lệ');
  if (busy) throw new AppError(409, 'Đang có một thao tác sao lưu hoặc phục hồi khác');

  busy = true;
  const fileName = `${type}-${stamp()}-${crypto.randomBytes(3).toString('hex')}.enc`;
  try {
    const key = getKey();
    const json = EJSON.stringify(await snapshot(), { relaxed: false });
    const file = encrypt(await gzip(Buffer.from(json, 'utf8')), key);
    const checksum = sha256(file);

    const dir = backupDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(safePath(dir, fileName), file, { flag: 'wx' });

    let location = 'local';
    const offsite = offsiteDir();
    if (offsite) {
      try {
        await fs.mkdir(offsite, { recursive: true });
        await fs.copyFile(safePath(dir, fileName), safePath(offsite, fileName));
        location = 'offsite';
      } catch (err) {
        console.error('Không sao chép được bản sao lưu ra ngoài tuyến:', err.message);
      }
    }

    const record = await BackupRecord.create({
      fileName,
      type,
      sizeBytes: file.length,
      checksum,
      location,
      status: 'success',
      createdBy: adminId,
    });
    await audit.record({
      user: adminId,
      action: 'BACKUP_SUCCESS',
      target: `Backup:${record.id}`,
      ...meta,
      detail: `${type}, ${location}`,
    });
    await prune(type);
    return record;
  } catch (err) {
    const reason = String((err && err.message) || 'unknown').slice(0, 200);
    await BackupRecord.create({
      fileName,
      type,
      status: 'failed',
      createdBy: adminId,
      error: reason,
    }).catch(() => {});
    await audit.record({
      user: adminId,
      action: 'BACKUP_FAILED',
      target: 'Backup',
      ...meta,
      result: 'failure',
      detail: reason,
    });
    throw err instanceof AppError ? err : new AppError(500, 'Sao lưu thất bại');
  } finally {
    busy = false;
  }
}

async function readPayload(record) {
  if (!record || record.status !== 'success') throw new AppError(409, 'Bản sao lưu này không dùng được');

  let file;
  try {
    file = await fs.readFile(safePath(backupDir(), record.fileName));
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(404, 'Không tìm thấy tệp sao lưu');
  }
  if (sha256(file) !== record.checksum) {
    throw new AppError(409, 'Checksum không khớp, tệp sao lưu có thể đã bị thay đổi');
  }

  const json = (await gunzip(decrypt(file, getKey()))).toString('utf8');
  const payload = EJSON.parse(json, { relaxed: true });
  if (!payload || payload.version !== 1 || typeof payload.collections !== 'object') {
    throw new AppError(409, 'Định dạng bản sao lưu không hợp lệ');
  }
  return payload;
}

async function confirmAdminPassword(adminId, password) {
  if (typeof password !== 'string' || !password) return false;
  const user = await User.findById(adminId).select('+passwordHash');
  return Boolean(user) && bcrypt.compare(password, user.passwordHash);
}

async function restore(id, admin, meta = {}) {
  if (!mongoose.isValidObjectId(id)) throw new AppError(404, 'Không tìm thấy bản sao lưu');
  const record = await BackupRecord.findById(id);
  if (!record) throw new AppError(404, 'Không tìm thấy bản sao lưu');

  let payload;
  try {
    payload = await readPayload(record);
  } catch (err) {
    await audit.record({
      user: admin.id,
      action: 'RESTORE_FAILED',
      target: `Backup:${id}`,
      ...meta,
      result: 'failure',
      detail: String(err.message).slice(0, 200),
    });
    throw err;
  }

  // Bản sao lưu an toàn trước khi ghi đè, để thao tác phục hồi cũng hoàn tác được
  await createBackup({ type: 'manual', adminId: admin.id, meta });

  busy = true;
  try {
    const db = mongoose.connection.db;
    const summary = {};
    for (const name of BACKUP_COLLECTIONS) {
      if (NEVER_RESTORE.includes(name)) continue;
      const docs = Array.isArray(payload.collections[name]) ? payload.collections[name] : [];
      await db.collection(name).deleteMany({});
      if (docs.length) await db.collection(name).insertMany(docs, { ordered: true });
      summary[name] = docs.length;
    }
    await audit.record({
      user: admin.id,
      action: 'RESTORE_SUCCESS',
      target: `Backup:${id}`,
      ...meta,
      detail: JSON.stringify(summary).slice(0, 280),
    });
    return summary;
  } catch (err) {
    await audit.record({
      user: admin.id,
      action: 'RESTORE_FAILED',
      target: `Backup:${id}`,
      ...meta,
      result: 'failure',
      detail: String(err.message).slice(0, 200),
    });
    throw new AppError(500, 'Phục hồi thất bại, dữ liệu trước đó đã được sao lưu tự động');
  } finally {
    busy = false;
  }
}

async function list(limit = 50) {
  return BackupRecord.find().sort('-createdAt').limit(limit).populate('createdBy', 'fullName').lean();
}

module.exports = { createBackup, restore, list, confirmAdminPassword, BACKUP_COLLECTIONS };