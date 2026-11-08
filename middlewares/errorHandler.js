const AppError = require('../utils/AppError');

const notFound = (_req, _res, next) => next(new AppError(404, 'Không tìm thấy trang'));

const errorHandler = (err, req, res, _next) => {
  const status = err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';
  if (status >= 500) console.error(err);

  const message =
    status >= 500 && isProd ? 'Có lỗi xảy ra, vui lòng thử lại sau' : err.message;

  if (req.originalUrl.startsWith('/api') || !req.accepts('html')) {
    return res.status(status).json({ success: false, error: { message } });
  }
  return res.status(status).render('errors/error', { title: 'Có lỗi xảy ra', status, message });
};

module.exports = { notFound, errorHandler };