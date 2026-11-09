const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const authService = require('../services/authService');
const auditService = require('../services/auditService');
const { collectErrors } = require('../middlewares/validators');

const meta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });
const regenerate = (req) =>
  new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
const destroy = (req) =>
  new Promise((resolve, reject) => req.session.destroy((err) => (err ? reject(err) : resolve())));

exports.showRegister = (_req, res) =>
  res.render('auth/register', { title: 'Đăng ký', errors: {}, values: {} });

exports.showLogin = (_req, res) =>
  res.render('auth/login', { title: 'Đăng nhập', error: null, values: {} });

exports.register = asyncHandler(async (req, res) => {
  const { fullName, email, password } = req.body;
  const values = { fullName, email };
  const errors = collectErrors(req);
  if (errors) return res.status(400).render('auth/register', { title: 'Đăng ký', errors, values });

  try {
    await authService.register({ fullName, email, password }, meta(req));
  } catch (err) {
    if (err instanceof AppError && err.status === 409) {
      return res
        .status(409)
        .render('auth/register', { title: 'Đăng ký', errors: { email: err.message }, values });
    }
    throw err;
  }
  req.flash('success', 'Đăng ký thành công, hãy đăng nhập');
  return res.redirect('/auth/login');
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const fail = (status, error) =>
    res.status(status).render('auth/login', { title: 'Đăng nhập', error, values: { email } });

  if (collectErrors(req)) return fail(400, 'Email hoặc mật khẩu không hợp lệ');

  let user;
  try {
    user = await authService.login(email, password, meta(req));
  } catch (err) {
    if (err instanceof AppError && err.status === 401) return fail(401, err.message);
    throw err;
  }

  await regenerate(req); // phiên mới sau đăng nhập, chống cố định phiên
  req.session.user = { id: user.id, role: user.role, fullName: user.fullName };
  req.flash('success', 'Đăng nhập thành công');
  return res.redirect('/');
});

exports.logout = asyncHandler(async (req, res) => {
  const user = req.session.user;
  await auditService.record({ user: user.id, action: 'LOGOUT', target: `User:${user.id}`, ...meta(req) });
  await destroy(req);
  res.clearCookie('sid');
  res.redirect('/');
});