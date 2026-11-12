const asyncHandler = require('../utils/asyncHandler');
const publicService = require('../services/publicService');
const commentService = require('../services/commentService');
const sanitizeContent = require('../utils/sanitizeContent');

exports.list = asyncHandler(async (req, res) => {
  const [result, categories] = await Promise.all([
    publicService.listPublished(req.query),
    publicService.listCategories(),
  ]);

  const buildUrl = (page) => {
    const params = new URLSearchParams();
    if (result.q) params.set('q', result.q);
    if (result.category) params.set('category', result.category.slug);
    if (page > 1) params.set('page', String(page));
    const qs = params.toString();
    return `/articles${qs ? `?${qs}` : ''}`;
  };

  res.render('public/home', {
    title: 'Trang chủ',
    items: result.items,
    paging: result.meta,
    q: result.q,
    activeCategory: result.category ? result.category.slug : '',
    categories,
    buildUrl,
  });
});

exports.show = asyncHandler(async (req, res) => {
  const article = await publicService.getBySlug(req.params.slug);
  const comments = await commentService.listVisible(article._id);
  res.render('public/detail', {
    title: article.title,
    article,
    safeContent: sanitizeContent(article.content), // lọc thêm một lần nữa khi xuất ra
    comments: comments.items,
    commentTotal: comments.total,
  });
});