const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const categoryService = require('../services/categoryService');

const meta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });
const str = (v) => (typeof v === 'string' ? v : '');
const pickValues = (body) => ({ name: str(body?.name), description: str(body?.description) });
const isFormError = (err) => err instanceof AppError && (err.status === 400 || err.status === 409);

async function renderList(res, status, { errors = {}, values = {} } = {}) {
  const categories = await categoryService.list();
  return res.status(status).render('admin/categories', { title: 'Quản lý danh mục', categories, errors, values });
}

exports.list = asyncHandler(async (_req, res) => renderList(res, 200));

exports.create = asyncHandler(async (req, res) => {
  try {
    await categoryService.create(req.session.user, req.body, meta(req));
  } catch (err) {
    if (isFormError(err)) return renderList(res, err.status, { errors: err.details || {}, values: pickValues(req.body) });
    throw err;
  }
  req.flash('success', 'Đã thêm danh mục');
  return res.redirect('/admin/categories');
});

exports.showEdit = asyncHandler(async (req, res) => {
  const category = await categoryService.getById(req.params.id);
  res.render('admin/category-edit', {
    title: 'Sửa danh mục',
    category,
    errors: {},
    values: { name: category.name, description: category.description },
  });
});

exports.update = asyncHandler(async (req, res) => {
  try {
    await categoryService.update(req.params.id, req.session.user, req.body, meta(req));
  } catch (err) {
    if (isFormError(err)) {
      const category = await categoryService.getById(req.params.id);
      return res.status(err.status).render('admin/category-edit', {
        title: 'Sửa danh mục',
        category,
        errors: err.details || {},
        values: pickValues(req.body),
      });
    }
    throw err;
  }
  req.flash('success', 'Đã cập nhật danh mục');
  return res.redirect('/admin/categories');
});

exports.remove = asyncHandler(async (req, res) => {
  try {
    await categoryService.remove(req.params.id, req.session.user, meta(req));
  } catch (err) {
    if (err instanceof AppError && err.status === 409) {
      req.flash('error', err.message);
      return res.redirect('/admin/categories');
    }
    throw err;
  }
  req.flash('success', 'Đã xóa danh mục');
  return res.redirect('/admin/categories');
});