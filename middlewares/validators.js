const { body, validationResult } = require('express-validator');

const registerRules = [
  body('fullName').trim().isLength({ min: 2, max: 80 }).withMessage('Họ tên từ 2 đến 80 ký tự'),
  body('email').trim().toLowerCase().isEmail().withMessage('Email không hợp lệ'),
  body('password')
    .isLength({ min: 10, max: 72 })
    .withMessage('Mật khẩu từ 10 đến 72 ký tự')
    .matches(/[A-Za-z]/)
    .withMessage('Mật khẩu cần có chữ cái')
    .matches(/\d/)
    .withMessage('Mật khẩu cần có chữ số'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Mật khẩu nhập lại không khớp'),
];

const loginRules = [
  body('email').trim().toLowerCase().isEmail(),
  body('password').isString().notEmpty(),
];

function collectErrors(req) {
  const result = validationResult(req);
  if (result.isEmpty()) return null;
  const errors = {};
  result.array().forEach((e) => {
    if (!errors[e.path]) errors[e.path] = e.msg;
  });
  return errors;
}

module.exports = { registerRules, loginRules, collectErrors };