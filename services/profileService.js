const bcrypt = require('bcrypt');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const audit = require('./auditService');

const ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;
const isStr = (v) => typeof v === 'string';
const notFound = () => new AppError(404, 'Không tìm thấy tài khoản');

function passwordError(pw) {
  if (!isStr(pw) || pw.length < 10 || pw.length > 72) return 'Mật khẩu từ 10 đến 72 ký tự';
  if (!/[A-Za-z]/.test(pw)) return 'Mật khẩu cần có chữ cái';
  if (!/\d/.test(pw)) return 'Mật khẩu cần có chữ số';
  return null;
}

async function getProfile(userId) {
  const user = await User.findById(userId).select('fullName email role createdAt lastLoginAt').lean();
  if (!user) throw notFound();
  return user;
}

async function updateName(userId, fullName, meta) {
  if (!isStr(fullName) || fullName.trim().length < 2 || fullName.trim().length > 80) {
    throw new AppError(400, 'Dữ liệu không hợp lệ', { fullName: 'Họ tên từ 2 đến 80 ký tự' });
  }
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { fullName: fullName.trim() } },
    { returnDocument: 'after' }
  );
  if (!user) throw notFound();
  await audit.record({ user: userId, action: 'PROFILE_UPDATE', target: `User:${userId}`, ...meta });
  return user;
}

async function changePassword(userId, { currentPassword, newPassword, confirmPassword } = {}, meta) {
  const errors = {};
  if (!isStr(currentPassword) || !currentPassword) errors.currentPassword = 'Vui lòng nhập mật khẩu hiện tại';
  const policy = passwordError(newPassword);
  if (policy) errors.newPassword = policy;
  else if (newPassword === currentPassword) errors.newPassword = 'Mật khẩu mới phải khác mật khẩu hiện tại';
  if (confirmPassword !== newPassword) errors.confirmPassword = 'Mật khẩu nhập lại không khớp';
  if (Object.keys(errors).length) throw new AppError(400, 'Dữ liệu không hợp lệ', errors);

  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw notFound();

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    await audit.record({
      user: userId,
      action: 'PASSWORD_CHANGE_FAILED',
      target: `User:${userId}`,
      ...meta,
      result: 'failure',
      detail: 'wrong current password',
    });
    throw new AppError(400, 'Dữ liệu không hợp lệ', { currentPassword: 'Mật khẩu hiện tại không đúng' });
  }

  user.passwordHash = await bcrypt.hash(newPassword, ROUNDS);
  user.sessionVersion = (user.sessionVersion || 0) + 1; // các phiên khác không còn hợp lệ
  await user.save();
  await audit.record({ user: userId, action: 'PASSWORD_CHANGE', target: `User:${userId}`, ...meta });
  return user;
}

module.exports = { getProfile, updateName, changePassword };