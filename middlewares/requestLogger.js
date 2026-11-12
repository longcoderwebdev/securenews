const logger = require('../utils/logger');

// Chỉ ghi đường dẫn, KHÔNG ghi query string (có thể chứa token) và không ghi nội dung gửi lên
module.exports = function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
    logger.info('http', {
      requestId: req.id,
      method: req.method,
      path: (req.originalUrl || '').split('?')[0].slice(0, 200),
      status: res.statusCode,
      ms,
      ip: req.ip,
      userId: req.session && req.session.user ? req.session.user.id : undefined,
    });
  });
  next();
};