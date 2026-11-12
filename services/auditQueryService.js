const AuditLog = require('../models/AuditLog');
const User = require('../models/User');

const PAGE_SIZE = 50;
const ACTION_RX = /^[A-Z0-9_]{1,40}$/;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const str = (v) => (typeof v === 'string' ? v.trim() : '');

function parseDate(value, endOfDay) {
  if (!DATE_RX.test(value)) return null;
  const d = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Chỉ đọc: giá trị lọc không hợp lệ bị bỏ qua, không gây lỗi
async function search(query = {}) {
  const rawAction = str(query.action);
  const action = ACTION_RX.test(rawAction) ? rawAction : '';
  const email = str(query.email).toLowerCase().slice(0, 120);
  const result = ['success', 'failure'].includes(str(query.result)) ? str(query.result) : '';
  const from = parseDate(str(query.from), false);
  const to = parseDate(str(query.to), true);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);

  const filters = {
    action,
    email,
    result,
    from: from ? str(query.from) : '',
    to: to ? str(query.to) : '',
  };
  const actions = (await AuditLog.distinct('action')).sort();
  const empty = { items: [], meta: { page, limit: PAGE_SIZE, total: 0, totalPages: 0 }, filters, actions };

  const filter = {};
  if (action) filter.action = action;
  if (result) filter.result = result;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }
  if (email) {
    const user = await User.findOne({ email }).select('_id').lean();
    if (!user) return empty;
    filter.user = user._id;
  }

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .populate('user', 'fullName email')
      .sort('-createdAt')
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);
  return { items, meta: { page, limit: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE) }, filters, actions };
}

module.exports = { search };