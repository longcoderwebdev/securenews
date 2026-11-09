const AppError = require('../utils/AppError');
const audit = require('../services/auditService');

function requireGuest(req, res, next) {
  return req.session.user ? res.redirect('/') : next();
}

function requireLogin(req, res, next) {
  if (req.session.user) return next();
  if (req.method === 'GET' && req.accepts('html')) return res.redirect('/auth/login');
  return next(new AppError(401, 'Bạn cần đăng nhập'));
}

function requireRole(...roles) {
  return async (req, res, next) => {
    const user = req.session.user;
    if (!user) return requireLogin(req, res, next);
    if (roles.includes(user.role)) return next();

    await audit.record({
      user: user.id,
      action: 'ACCESS_DENIED',
      target: req.originalUrl.slice(0, 200),
      ip: req.ip,
      userAgent: req.get('user-agent'),
      result: 'failure',
      detail: `role=${user.role}`,
    });
    return next(new AppError(403, 'Bạn không đủ quyền truy cập'));
  };
}

module.exports = { requireGuest, requireLogin, requireRole };