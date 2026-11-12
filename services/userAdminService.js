const mongoose = require('mongoose');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const audit = require('./auditService');

const ROLES = ['user', 'editor', 'admin'];
const PAGE_SIZE = 20;
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function list(query = {}) {
  const q = str(query.q).slice(0, 100);
  const role = ROLES.includes(str(query.role)) ? str(query.role) : '';
  const page = Math.max(parseInt(query.page, 10) || 1, 1);

  const filter = {};
  if (role) filter.role = role;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ fullName: rx }, { email: rx }];
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .select('fullName email role isActive lockUntil lastLoginAt createdAt')
      .sort('-createdAt')
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    User.countDocuments(filter),
  ]);
  return { items, meta: { page, limit: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE) }, q, role };
}

// Không cho admin tác động lên chính mình: luôn còn ít nhất một admin hoạt động
async function getTarget(id, admin) {
  if (!mongoose.isValidObjectId(id)) throw new AppError(404, 'Không tìm thấy người dùng');
  if (String(id) === String(admin.id)) {
    throw new AppError(400, 'Bạn không thể thay đổi tài khoản của chính mình');
  }
  const user = await User.findById(id);
  if (!user) throw new AppError(404, 'Không tìm thấy người dùng');
  return user;
}

async function changeRole(id, admin, role, meta) {
  if (typeof role !== 'string' || !ROLES.includes(role)) throw new AppError(400, 'Vai trò không hợp lệ');
  const user = await getTarget(id, admin);
  if (user.role === role) return user;

  const from = user.role;
  user.role = role;
  await user.save();
  await audit.record({
    user: admin.id,
    action: 'USER_ROLE_CHANGE',
    target: `User:${id}`,
    ...meta,
    detail: `${from} -> ${role}`,
  });
  return user;
}

async function setActive(id, admin, active, meta) {
  const user = await getTarget(id, admin);
  user.isActive = active;
  if (active) {
    user.failedAttempts = 0; // mở khóa cũng xóa luôn khóa tạm thời do nhập sai
    user.lockUntil = undefined;
  }
  await user.save();
  await audit.record({
    user: admin.id,
    action: active ? 'USER_UNLOCK' : 'USER_LOCK',
    target: `User:${id}`,
    ...meta,
  });
  return user;
}

module.exports = { list, changeRole, setActive };