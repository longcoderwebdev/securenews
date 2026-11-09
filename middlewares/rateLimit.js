const rateLimit = require('express-rate-limit');
const AppError = require('../utils/AppError');

const make = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    handler: (_req, _res, next) => next(new AppError(429, message)),
  });

exports.generalLimiter = make(60 * 1000, 100, 'Quá nhiều yêu cầu, vui lòng thử lại sau');
exports.loginLimiter = make(15 * 60 * 1000, 10, 'Bạn thử đăng nhập quá nhiều lần, hãy quay lại sau 15 phút');