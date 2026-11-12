const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const backupService = require('../services/backupService');
const auditService = require('../services/auditService');

const meta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });
const str = (v) => (typeof v === 'string' ? v : '');
const regenerate = (req) =>
  new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
const safeMessage = (err) =>
  err instanceof AppError && err.status < 500 ? err.message : 'Thao tác thất bại, hãy xem nhật ký hoạt động';

exports.list = asyncHandler(async (_req, res) => {
  const items = await backupService.list();
  res.render('admin/backups', { title: 'Sao lưu và phục hồi', items });
});

exports.create = asyncHandler(async (req, res) => {
  try {
    await backupService.createBackup({ type: 'manual', adminId: req.session.user.id, meta: meta(req) });
  } catch (err) {
    if (err instanceof AppError) {
      req.flash('error', safeMessage(err));
      return res.redirect('/admin/backups');
    }
    throw err;
  }
  req.flash('success', 'Đã tạo bản sao lưu');
  return res.redirect('/admin/backups');
});

exports.restore = asyncHandler(async (req, res) => {
  const admin = req.session.user;
  const id = req.params.id;

  if (!(await backupService.confirmAdminPassword(admin.id, str(req.body && req.body.password)))) {
    await auditService.record({
      user: admin.id,
      action: 'RESTORE_FAILED',
      target: `Backup:${String(id).slice(0, 40)}`,
      ...meta(req),
      result: 'failure',
      detail: 'wrong password',
    });
    req.flash('error', 'Mật khẩu xác nhận không đúng');
    return res.redirect('/admin/backups');
  }

  try {
    await backupService.restore(id, admin, meta(req));
  } catch (err) {
    if (err instanceof AppError) {
      req.flash('error', safeMessage(err));
      return res.redirect('/admin/backups');
    }
    throw err;
  }

  await regenerate(req); // dữ liệu tài khoản vừa đổi, buộc đăng nhập lại
  req.flash('success', 'Đã phục hồi dữ liệu. Vui lòng đăng nhập lại');
  return res.redirect('/auth/login');
});