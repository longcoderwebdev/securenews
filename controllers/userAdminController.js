const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const userAdminService = require('../services/userAdminService');

const meta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

async function run(req, res, action, successMessage) {
  try {
    await action();
  } catch (err) {
    if (err instanceof AppError && err.status === 400) {
      req.flash('error', err.message);
      return res.redirect('/admin/users');
    }
    throw err;
  }
  req.flash('success', successMessage);
  return res.redirect('/admin/users');
}

exports.list = asyncHandler(async (req, res) => {
  const result = await userAdminService.list(req.query);
  const buildUrl = (page) => {
    const params = new URLSearchParams();
    if (result.q) params.set('q', result.q);
    if (result.role) params.set('role', result.role);
    if (page > 1) params.set('page', String(page));
    const qs = params.toString();
    return `/admin/users${qs ? `?${qs}` : ''}`;
  };
  res.render('admin/users', {
    title: 'Quản lý người dùng',
    items: result.items,
    paging: result.meta,
    q: result.q,
    role: result.role,
    selfId: req.session.user.id,
    buildUrl,
  });
});

exports.changeRole = asyncHandler((req, res) =>
  run(
    req,
    res,
    () => userAdminService.changeRole(req.params.id, req.session.user, req.body && req.body.role, meta(req)),
    'Đã cập nhật vai trò'
  )
);

exports.lock = asyncHandler((req, res) =>
  run(req, res, () => userAdminService.setActive(req.params.id, req.session.user, false, meta(req)), 'Đã khóa tài khoản')
);

exports.unlock = asyncHandler((req, res) =>
  run(req, res, () => userAdminService.setActive(req.params.id, req.session.user, true, meta(req)), 'Đã mở khóa tài khoản')
);