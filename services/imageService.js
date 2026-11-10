const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const AppError = require('../utils/AppError');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Nhận dạng ảnh theo byte đầu của tệp, không tin tên tệp hay loại do trình duyệt khai báo
function detectType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

async function saveCover(file) {
  const ext = detectType(file && file.buffer);
  if (!ext) {
    throw new AppError(400, 'Dữ liệu không hợp lệ', { coverImage: 'Chỉ nhận ảnh JPG, PNG hoặc WebP' });
  }
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, name), file.buffer, { flag: 'wx' });
  return name;
}

async function removeCover(name) {
  if (typeof name !== 'string' || !/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) return;
  await fs.unlink(path.join(UPLOAD_DIR, name)).catch(() => {});
}

module.exports = { saveCover, removeCover, detectType };