const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const articleService = require('../services/articleService');
const categoryService = require('../services/categoryService');

const meta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });
const str = (v) => (typeof v === 'string' ? v : '');
const pick = (body) => ({
  title: str(body?.title),
  summary: str(body?.summary),
  content: str(body?.content),
  category: str(body?.category),
});
const isFormError = (err) => err instanceof AppError && err.status === 400;
const isConflict = (err) => err instanceof AppError && err.status === 409;
const EDITABLE = ['draft', 'rejected'];
const STATUS_LABELS = { draft: 'Nháp', pending: 'Chờ duyệt', published: 'Đã đăng', rejected: 'Bị từ chối' };

async function renderForm(res, status, { article = null, errors = {}, values = {} }) {
  const categories = await categoryService.list();
  return res.status(status).render('editor/form', {
    title: article ? 'Sửa bài viết' : 'Soạn bài mới',
    article,
    categories,
    errors,
    values,
  });
}

exports.list = asyncHandler(async (req, res) => {
  const { items, meta: paging } = await articleService.listMine(req.session.user, req.query);
  res.render('editor/list', {
    title: 'Bài viết của tôi',
    items,
    paging,
    status: str(req.query.status),
    statusLabels: STATUS_LABELS,
  });
});

exports.showNew = asyncHandler(async (_req, res) => renderForm(res, 200, {}));

exports.create = asyncHandler(async (req, res) => {
  const values = pick(req.body);
  if (req.uploadError) return renderForm(res, 400, { errors: { coverImage: req.uploadError }, values });

  try {
    await articleService.createDraft(req.session.user, req.body, meta(req), req.file);
  } catch (err) {
    if (isFormError(err)) return renderForm(res, 400, { errors: err.details || {}, values });
    throw err;
  }
  req.flash('success', 'Đã lưu bản nháp');
  return res.redirect('/editor/articles');
});

exports.showEdit = asyncHandler(async (req, res) => {
  const article = await articleService.getForEdit(req.params.id, req.session.user, meta(req));
  if (!EDITABLE.includes(article.status)) {
    req.flash('error', 'Bài viết đang chờ duyệt hoặc đã đăng nên không thể sửa');
    return res.redirect('/editor/articles');
  }
  const values = {
    title: article.title,
    summary: article.summary,
    content: article.content,
    category: String(article.category),
  };
  return renderForm(res, 200, { article, values });
});

exports.update = asyncHandler(async (req, res) => {
  const user = req.session.user;
  const values = pick(req.body);
  const fail = async (errors) => {
    const article = await articleService.getForEdit(req.params.id, user, meta(req));
    return renderForm(res, 400, { article, errors, values });
  };

  if (req.uploadError) return fail({ coverImage: req.uploadError });

  try {
    await articleService.updateDraft(req.params.id, user, req.body, meta(req), req.file);
  } catch (err) {
    if (isFormError(err)) return fail(err.details || {});
    if (isConflict(err)) {
      req.flash('error', err.message);
      return res.redirect('/editor/articles');
    }
    throw err;
  }
  req.flash('success', 'Đã lưu bài viết');
  return res.redirect('/editor/articles');
});

exports.submit = asyncHandler(async (req, res) => {
  try {
    await articleService.submit(req.params.id, req.session.user, meta(req));
  } catch (err) {
    if (isConflict(err)) {
      req.flash('error', err.message);
      return res.redirect('/editor/articles');
    }
    throw err;
  }
  req.flash('success', 'Đã gửi bài chờ duyệt');
  return res.redirect('/editor/articles');
});