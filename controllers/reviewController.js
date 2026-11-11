const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const articleService = require('../services/articleService');
const sanitizeContent = require('../utils/sanitizeContent');

const meta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });
const str = (v) => (typeof v === 'string' ? v : '');
const STATUS_LABELS = { draft: 'Nháp', pending: 'Chờ duyệt', published: 'Đã đăng', rejected: 'Bị từ chối' };

function renderDetail(res, status, article, errors = {}, values = {}) {
  return res.status(status).render('admin/review-detail', {
    title: 'Duyệt bài viết',
    article,
    safeContent: sanitizeContent(article.content), // lọc thêm một lần nữa khi xuất ra
    statusLabels: STATUS_LABELS,
    errors,
    values,
  });
}

exports.list = asyncHandler(async (req, res) => {
  const { items, meta: paging } = await articleService.listPending(req.query);
  res.render('admin/review-list', { title: 'Bài chờ duyệt', items, paging });
});

exports.show = asyncHandler(async (req, res) => {
  const article = await articleService.getForReview(req.params.id);
  return renderDetail(res, 200, article);
});

exports.approve = asyncHandler(async (req, res) => {
  try {
    await articleService.approve(req.params.id, req.session.user, meta(req));
  } catch (err) {
    if (err instanceof AppError && err.status === 409) {
      req.flash('error', err.message);
      return res.redirect('/admin/review');
    }
    throw err;
  }
  req.flash('success', 'Đã duyệt và xuất bản bài viết');
  return res.redirect('/admin/review');
});

exports.reject = asyncHandler(async (req, res) => {
  const reason = str(req.body && req.body.reason);
  try {
    await articleService.reject(req.params.id, req.session.user, reason, meta(req));
  } catch (err) {
    if (err instanceof AppError && err.status === 400) {
      const article = await articleService.getForReview(req.params.id);
      return renderDetail(res, 400, article, err.details || {}, { reason });
    }
    if (err instanceof AppError && err.status === 409) {
      req.flash('error', err.message);
      return res.redirect('/admin/review');
    }
    throw err;
  }
  req.flash('success', 'Đã từ chối bài viết, tác giả sẽ thấy lý do');
  return res.redirect('/admin/review');
});