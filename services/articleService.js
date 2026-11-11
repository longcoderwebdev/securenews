const crypto = require('crypto');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const Category = require('../models/Category');
const AppError = require('../utils/AppError');
const slugify = require('../utils/slugify');
const sanitizeContent = require('../utils/sanitizeContent');
const audit = require('./auditService');
const imageService = require('./imageService');

const EDITABLE = ['draft', 'rejected'];
const STATUSES = ['draft', 'pending', 'published', 'rejected'];
const isStr = (v) => typeof v === 'string';

function paging(page, limit, max = 50) {
  const l = Math.min(Math.max(parseInt(limit, 10) || 10, 1), max);
  const p = Math.max(parseInt(page, 10) || 1, 1);
  return { page: p, limit: l, skip: (p - 1) * l };
}

// Chỉ lấy 4 trường được phép; mọi trường khác (status, author, slug...) bị bỏ qua
async function normalizeInput(input) {
  const { title, summary = '', content, category } = input || {};
  const errors = {};

  if (!isStr(title) || title.trim().length < 5 || title.trim().length > 150) {
    errors.title = 'Tiêu đề từ 5 đến 150 ký tự';
  }
  if (!isStr(summary) || summary.trim().length > 300) {
    errors.summary = 'Tóm tắt tối đa 300 ký tự';
  }
  const cleanContent = isStr(content) ? sanitizeContent(content) : '';
  if (!cleanContent.replace(/<[^>]*>/g, '').trim()) {
    errors.content = 'Nội dung không được để trống';
  }
  if (!isStr(category) || !mongoose.isValidObjectId(category) || !(await Category.exists({ _id: category }))) {
    errors.category = 'Danh mục không hợp lệ';
  }

  if (Object.keys(errors).length) throw new AppError(400, 'Dữ liệu không hợp lệ', errors);
  return { title: title.trim(), summary: summary.trim(), content: cleanContent, category };
}

async function findOwned(id, user, meta, allowedStatuses) {
  if (!mongoose.isValidObjectId(id)) throw new AppError(404, 'Không tìm thấy bài viết');
  const article = await Article.findById(id);
  if (!article) throw new AppError(404, 'Không tìm thấy bài viết');

  if (!article.isOwnedBy(user.id)) {
    await audit.record({
      user: user.id,
      action: 'ACCESS_DENIED',
      target: `Article:${id}`,
      ...meta,
      result: 'failure',
      detail: 'not owner',
    });
    throw new AppError(403, 'Bạn không đủ quyền với bài viết này');
  }
  if (allowedStatuses && !allowedStatuses.includes(article.status)) {
    throw new AppError(409, 'Trạng thái bài viết không cho phép thao tác này');
  }
  return article;
}

async function createDraft(user, input, meta, file) {
  const data = await normalizeInput(input);
  const slug = `${slugify(data.title) || 'bai-viet'}-${crypto.randomBytes(3).toString('hex')}`;
  const coverImage = file ? await imageService.saveCover(file) : undefined;

  let article;
  try {
    article = await Article.create({ ...data, slug, coverImage, author: user.id, status: 'draft' });
  } catch (err) {
    await imageService.removeCover(coverImage);
    throw err;
  }
  await audit.record({ user: user.id, action: 'ARTICLE_CREATE', target: `Article:${article.id}`, ...meta });
  return article;
}

async function updateDraft(id, user, input, meta, file) {
  const current = await findOwned(id, user, meta, EDITABLE);
  const data = await normalizeInput(input);
  const newCover = file ? await imageService.saveCover(file) : undefined;
  const changes = newCover ? { ...data, coverImage: newCover } : data;

  const updated = await Article.findOneAndUpdate(
    { _id: id, status: { $in: EDITABLE } },
    { $set: changes },
    { new: true, runValidators: true }
  );
  if (!updated) {
    await imageService.removeCover(newCover);
    throw new AppError(409, 'Trạng thái bài viết không cho phép thao tác này');
  }
  if (newCover) await imageService.removeCover(current.coverImage);
  await audit.record({ user: user.id, action: 'ARTICLE_UPDATE', target: `Article:${id}`, ...meta });
  return updated;
}

async function submit(id, user, meta) {
  await findOwned(id, user, meta, EDITABLE);
  const updated = await Article.findOneAndUpdate(
    { _id: id, status: { $in: EDITABLE } },
    { $set: { status: 'pending', submittedAt: new Date() }, $unset: { rejectReason: '' } },
    { new: true }
  );
  if (!updated) throw new AppError(409, 'Trạng thái bài viết không cho phép thao tác này');
  await audit.record({ user: user.id, action: 'ARTICLE_SUBMIT', target: `Article:${id}`, ...meta });
  return updated;
}

async function getForEdit(id, user, meta) {
  return findOwned(id, user, meta);
}

async function listMine(user, { status, page, limit } = {}) {
  const p = paging(page, limit);
  const filter = { author: user.id };
  if (STATUSES.includes(status)) filter.status = status;

  const [items, total] = await Promise.all([
    Article.find(filter)
      .select('title slug status rejectReason updatedAt')
      .sort('-updatedAt')
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Article.countDocuments(filter),
  ]);
  return { items, meta: { page: p.page, limit: p.limit, total, totalPages: Math.ceil(total / p.limit) } };
}

async function listPending({ page, limit } = {}) {
  const p = paging(page, limit);
  const filter = { status: 'pending' };
  const [items, total] = await Promise.all([
    Article.find(filter)
      .select('title slug submittedAt author category')
      .populate('author', 'fullName email')
      .populate('category', 'name')
      .sort('submittedAt')
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Article.countDocuments(filter),
  ]);
  return { items, meta: { page: p.page, limit: p.limit, total, totalPages: Math.ceil(total / p.limit) } };
}

async function getForReview(id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError(404, 'Không tìm thấy bài viết');
  const article = await Article.findById(id).populate('author', 'fullName email').populate('category', 'name');
  if (!article || article.status === 'draft') throw new AppError(404, 'Không tìm thấy bài viết');
  return article;
}

async function missingOrConflict(id) {
  return (await Article.exists({ _id: id }))
    ? new AppError(409, 'Bài viết không ở trạng thái chờ duyệt')
    : new AppError(404, 'Không tìm thấy bài viết');
}

async function approve(id, admin, meta) {
  if (!mongoose.isValidObjectId(id)) throw new AppError(404, 'Không tìm thấy bài viết');
  const updated = await Article.findOneAndUpdate(
    { _id: id, status: 'pending' },
    { $set: { status: 'published', publishedAt: new Date(), approvedBy: admin.id }, $unset: { rejectReason: '' } },
    { new: true }
  );
  if (!updated) throw await missingOrConflict(id);
  await audit.record({ user: admin.id, action: 'ARTICLE_APPROVE', target: `Article:${id}`, ...meta });
  return updated;
}

async function reject(id, admin, reason, meta) {
  if (!isStr(reason) || reason.trim().length < 5 || reason.trim().length > 300) {
    throw new AppError(400, 'Dữ liệu không hợp lệ', { reason: 'Lý do từ 5 đến 300 ký tự' });
  }
  if (!mongoose.isValidObjectId(id)) throw new AppError(404, 'Không tìm thấy bài viết');
  const updated = await Article.findOneAndUpdate(
    { _id: id, status: 'pending' },
    { $set: { status: 'rejected', rejectReason: reason.trim() } },
    { new: true }
  );
  if (!updated) throw await missingOrConflict(id);
  await audit.record({
    user: admin.id,
    action: 'ARTICLE_REJECT',
    target: `Article:${id}`,
    ...meta,
    detail: reason.trim().slice(0, 200),
  });
  return updated;
}

module.exports = {
  createDraft,
  updateDraft,
  submit,
  getForEdit,
  listMine,
  listPending,
  getForReview,
  approve,
  reject,
};