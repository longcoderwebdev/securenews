const User = require('../models/User');

// Mỗi yêu cầu đọc lại tài khoản: bị khóa, bị xóa hoặc đã đổi mật khẩu ở nơi khác thì phiên mất hiệu lực
module.exports = async function refreshSessionUser(req, _res, next) {
  const current = req.session && req.session.user;
  if (!current) return next();

  try {
    const user = await User.findById(current.id).select('role isActive fullName sessionVersion').lean();
    const valid = user && user.isActive && (current.v || 0) === (user.sessionVersion || 0);

    if (!valid) {
      delete req.session.user;
      req.session.flash = { type: 'error', message: 'Phiên đăng nhập đã hết hiệu lực, vui lòng đăng nhập lại' };
      return next();
    }
    current.role = user.role; // vai trò mới có hiệu lực ngay
    current.fullName = user.fullName;
    return next();
  } catch (err) {
    return next(err);
  }
};