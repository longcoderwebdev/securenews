const bcrypt = require('bcrypt');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const audit = require('./auditService');

const ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
const GENERIC = 'Email hoặc mật khẩu không đúng';
const isStr = (v) => typeof v === 'string';

let dummyHash;
const getDummyHash = () => {
  dummyHash = dummyHash || bcrypt.hashSync('dummy-password', ROUNDS);
  return dummyHash;
};

async function register({ fullName, email, password }, meta) {
  if (![fullName, email, password].every(isStr)) throw new AppError(400, 'Dữ liệu không hợp lệ');
  if (await User.exists({ email })) throw new AppError(409, 'Email đã được đăng ký');

  const passwordHash = await bcrypt.hash(password, ROUNDS);
  try {
    const user = await User.create({ fullName, email, passwordHash }); // role luôn là 'user'
    await audit.record({ user: user._id, action: 'USER_REGISTER', target: `User:${user.id}`, ...meta });
    return user;
  } catch (err) {
    if (err.code === 11000) throw new AppError(409, 'Email đã được đăng ký');
    throw err;
  }
}

async function login(email, password, meta) {
  if (!isStr(email) || !isStr(password)) throw new AppError(401, GENERIC);

  const user = await User.findOne({ email }).select('+passwordHash');
  // Luôn so khớp một lần, kể cả khi không có tài khoản, để thời gian phản hồi không lộ email có tồn tại hay không
  const ok = await bcrypt.compare(password, user ? user.passwordHash : getDummyHash());
  const target = `email:${email.slice(0, 100)}`;

  if (!user || !user.isActive || user.isLocked()) {
    const detail = !user ? 'no such user' : !user.isActive ? 'inactive' : 'locked';
    await audit.record({ user: user?._id, action: 'LOGIN_FAILED', target, ...meta, result: 'failure', detail });
    throw new AppError(401, GENERIC);
  }

  if (!ok) {
    user.failedAttempts += 1;
    const lockNow = user.failedAttempts >= MAX_FAILED;
    if (lockNow) {
      user.lockUntil = new Date(Date.now() + LOCK_MS);
      user.failedAttempts = 0;
    }
    await user.save();
    await audit.record({ user: user._id, action: 'LOGIN_FAILED', target, ...meta, result: 'failure', detail: 'wrong password' });
    if (lockNow) await audit.record({ user: user._id, action: 'ACCOUNT_LOCKED', target, ...meta, result: 'failure' });
    throw new AppError(401, GENERIC);
  }

  user.failedAttempts = 0;
  user.lockUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();
  await audit.record({ user: user._id, action: 'LOGIN_SUCCESS', target: `User:${user.id}`, ...meta });
  return user;
}

module.exports = { register, login };