const helmet = require('helmet');

// Chính sách chặt: chỉ nạp tài nguyên cùng nguồn, không cho mã nhúng trong HTML chạy
const directives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  scriptSrcAttr: ["'none'"],
  styleSrc: ["'self'"],
  imgSrc: ["'self'", 'data:'],
  fontSrc: ["'self'"],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
};

const helmetMiddleware = helmet({
  contentSecurityPolicy: { useDefaults: false, directives },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: { maxAge: 15552000, includeSubDomains: true },
});

function permissionsPolicy(_req, res, next) {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  next();
}

// Trang động không được lưu trong bộ nhớ đệm của trình duyệt hay proxy
function noStore(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

module.exports = { securityHeaders: [helmetMiddleware, permissionsPolicy], noStore };