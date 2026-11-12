const Article = require('../models/Article');
const Category = require('../models/Category');
const AppError = require('../utils/AppError');

const PAGE_SIZE = 10;
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function paging(page) {
  const p = Math.max(parseInt(page, 10) || 1, 1);
  return { page: p, limit: PAGE_SIZE, skip: (p - 1) * PAGE_SIZE };
}

async function listCategories() {
  return Category.find().select('name slug').sort('name').lean();
}

async function listPublished(query = {}) {
  const q = str(query.q).slice(0, 100);
  const categorySlug = str(query.category).slice(0, 80);
  const p = paging(query.page);
  const filter = { status: 'published' };
  let category = null;

  if (categorySlug) {
    category = await Category.findOne({ slug: categorySlug }).select('name slug').lean();
    if (!category) {
      return { items: [], meta: { page: p.page, limit: p.limit, total: 0, totalPages: 0 }, q, category: null };
    }
    filter.category = category._id;
  }
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ title: rx }, { summary: rx }];
  }

  const [items, total] = await Promise.all([
    Article.find(filter)
      .select('title slug summary coverImage publishedAt author category')
      .populate('author', 'fullName')
      .populate('category', 'name slug')
      .sort('-publishedAt')
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Article.countDocuments(filter),
  ]);

  return {
    items,
    meta: { page: p.page, limit: p.limit, total, totalPages: Math.ceil(total / p.limit) },
    q,
    category,
  };
}

async function getBySlug(slug) {
  if (typeof slug !== 'string' || !slug || slug.length > 120) {
    throw new AppError(404, 'Không tìm thấy bài viết');
  }
  const article = await Article.findOne({ slug, status: 'published' })
    .populate('author', 'fullName')
    .populate('category', 'name slug')
    .lean();
  if (!article) throw new AppError(404, 'Không tìm thấy bài viết');
  return article;
}

module.exports = { listCategories, listPublished, getBySlug };