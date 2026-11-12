const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const INFO = {
  400: { title: 'Yêu cầu không hợp lệ', hint: 'Dữ liệu gửi lên không đúng định dạng. Hãy kiểm tra lại và thử lần nữa.' },
  401: { title: 'Cần đăng nhập', hint: 'Bạn cần đăng nhập để tiếp tục.' },
  403: { title: 'Không đủ quyền truy cập', hint: 'Tài khoản của bạn không có quyền với chức năng này.' },
  404: { title: 'Không tìm thấy trang', hint: 'Đường dẫn có thể đã bị đổi hoặc không tồn tại.' },
  409: { title: 'Xung đột dữ liệu', hint: 'Dữ liệu vừa bị thay đổi hoặc thao tác này không còn phù hợp.' },
  413: { title: 'Dữ liệu quá lớn', hint: 'Dữ liệu gửi lên vượt quá giới hạn cho phép.' },
  429: { title: 'Quá nhiều yêu cầu', hint: 'Bạn thao tác quá nhanh. Hãy chờ một lúc rồi thử lại.' },
  500: {
    title: 'Lỗi máy chủ',
    hint: 'Có sự cố ở phía máy chủ. Hãy thử lại sau; nếu lỗi lặp lại, báo mã tham chiếu bên dưới cho quản trị viên.',
  },
};

const infoFor = (status) => INFO[status] || (status < 500 ? INFO[400] : INFO[500]);

const notFound = (_req, _res, next) => next(new AppError(404, 'Không tìm thấy trang'));

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let status = Number(err && (err.status || err.statusCode));
  if (!Number.isInteger(status) || status < 400 || status > 599) status = 500;

  const isProd = process.env.NODE_ENV === 'production';
  const operational = Boolean(err && err.isOperational);
  const info = infoFor(status);
  const requestId = req.id;

  if (status >= 500) {
    logger.error('Lỗi không xử lý được', {
      requestId,
      method: req.method,
      path: (req.originalUrl || '').split('?')[0],
      error: err && err.message,
      stack: err && err.stack,
    });
  }

  // Lỗi 5xx: chỉ hiện chi tiết ở môi trường phát triển. Lỗi 4xx: chỉ hiện thông báo do chính ứng dụng tạo ra
  let message = '';
  if (status >= 500) message = isProd ? '' : String((err && err.message) || '');
  else if (operational) message = err.message;

  if ((req.originalUrl || '').startsWith('/api') || !req.accepts('html')) {
    const error = { message: message || info.title, requestId };
    if (operational && status < 500 && err.details) error.details = err.details;
    return res.status(status).json({ success: false, error });
  }

  return res.status(status).render('errors/error', {
    status,
    heading: info.title,
    message,
    hint: info.hint,
    requestId: status >= 500 ? requestId || '' : '',
  });
};

module.exports = { notFound, errorHandler };