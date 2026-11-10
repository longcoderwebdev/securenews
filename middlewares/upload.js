const multer = require('multer');

const MAX_BYTES = 2 * 1024 * 1024;

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 10, fieldSize: 200 * 1024 },
}).single('coverImage');

const MESSAGES = {
  LIMIT_FILE_SIZE: 'Ảnh bìa tối đa 2 MB',
  LIMIT_UNEXPECTED_FILE: 'Tệp tải lên không hợp lệ',
};

// Lỗi tải tệp không làm hỏng cả yêu cầu: gắn vào req.uploadError để controller hiển thị ở ô ảnh
function handleCoverUpload(req, res, next) {
  parser(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      req.uploadError = MESSAGES[err.code] || 'Không tải được tệp lên';
      req.body = req.body || {};
      return next();
    }
    return next(err);
  });
}

module.exports = { handleCoverUpload };