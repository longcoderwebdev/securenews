const crypto = require('crypto');

// Mỗi yêu cầu có một mã riêng: hiện trên trang lỗi 500 và nằm trong nhật ký để truy vết
module.exports = function requestId(req, res, next) {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};