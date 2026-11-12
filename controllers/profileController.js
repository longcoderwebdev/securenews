const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const profileService = require('../services/profileService');

const meta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });
const str = (v) => (typeof v === 'string' ? v : '');
const isFormError = (err) => err instanceof AppError && err.status === 400;
const regenerate = (req) =>
  new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));

function render(res, status, profile, errors = {}, fullName = profile.fullName) {
  return res.status(status).render('profile/index', {
    title: 'Hồ sơ cá nhân',
    profile,
    errors,
    values: { fullName },
  });
}

exports.show = asyncHandler(async (req, res) => {
  const profile = await profileService.getProfile(req.session.user.id);
  return render(res, 200, profile);
});

exports.updateName = asyncHandler(async (req, res) => {
  const user = req.session.user;
  const fullName = str(req.body && req.body.fullName);
  try {
    const updated = await profileService.updateName(user.id, fullName, meta(req));
    user.fullName = updated.fullName;
  } catch (err) {
    if (isFormError(err)) {
      const profile = await profileService.getProfile(user.id);
      return render(res, 400, profile, err.details || {}, fullName);
    }
    throw err;
  }
  req.flash('success', 'Đã cập nhật họ tên');
  return res.redirect('/profile');
});

exports.changePassword = asyncHandler(async (req, res) => {
  const user = req.session.user;
  const body = req.body || {};
  const fields = {
    currentPassword: str(body.currentPassword),
    newPassword: str(body.newPassword),
    confirmPassword: str(body.confirmPassword),
  };

  let updated;
  try {
    updated = await profileService.changePassword(user.id, fields, meta(req));
  } catch (err) {
    if (isFormError(err)) {
      const profile = await profileService.getProfile(user.id);
      return render(res, 400, profile, err.details || {});
    }
    throw err;
  }

  await regenerate(req); // cấp mã phiên mới sau khi đổi mật khẩu
  req.session.user = { id: updated.id, role: updated.role, fullName: updated.fullName, v: updated.sessionVersion };
  req.flash('success', 'Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất');
  return res.redirect('/profile');
});