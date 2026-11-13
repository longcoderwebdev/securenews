const rateLimit = require('express-rate-limit');
const AppError = require('../utils/AppError');

const make = (windowMs, limit, message, extra = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    handler: (_req, _res, next) => next(new AppError(429, message)),
    ...extra,
  });

const byUser = (req) => (req.session && req.session.user ? req.session.user.id : 'anonymous');

const generalLimit = Math.max(parseInt(process.env.GENERAL_RATE_LIMIT, 10) || 100, 1);
exports.generalLimiter = make(60 * 1000, generalLimit, 'Quá nhiều yêu cầu, vui lòng thử lại sau');
exports.loginLimiter = make(15 * 60 * 1000, 10, 'Bạn thử đăng nhập quá nhiều lần, hãy quay lại sau 15 phút');
exports.commentLimiter = make(60 * 1000, 10, 'Bạn bình luận quá nhanh, vui lòng thử lại sau ít phút', {
  keyGenerator: byUser,
});
exports.passwordLimiter = make(15 * 60 * 1000, 5, 'Bạn đổi mật khẩu quá nhiều lần, hãy quay lại sau 15 phút', {
  keyGenerator: byUser,
});