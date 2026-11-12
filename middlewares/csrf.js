const crypto = require('crypto');
const AppError = require('../utils/AppError');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function csrf(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  if (SAFE_METHODS.has(req.method)) return next();

    const sent = (req.body && req.body._csrf) || req.get('x-csrf-token') || req.query._csrf;
  const expected = req.session.csrfToken;
  const valid =
    typeof sent === 'string' &&
    sent.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));

  if (!valid) return next(new AppError(403, 'Phiên làm việc không hợp lệ, vui lòng tải lại trang'));
  return next();
}

module.exports = csrf;