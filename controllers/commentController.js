const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const commentService = require('../services/commentService');

const meta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

exports.add = asyncHandler(async (req, res) => {
  try {
    const { slug } = await commentService.add(
      req.session.user,
      req.params.slug,
      req.body && req.body.content,
      meta(req)
    );
    req.flash('success', 'Đã gửi bình luận');
    return res.redirect(`/articles/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err instanceof AppError && err.status === 400) {
      req.flash('error', err.message);
      return res.redirect(`/articles/${encodeURIComponent(req.params.slug)}`);
    }
    throw err;
  }
});

exports.hide = asyncHandler(async (req, res) => {
  try {
    const { slug } = await commentService.hide(req.params.id, req.session.user, meta(req));
    req.flash('success', 'Đã ẩn bình luận');
    return res.redirect(slug ? `/articles/${encodeURIComponent(slug)}` : '/');
  } catch (err) {
    if (err instanceof AppError && err.status === 409) {
      req.flash('error', err.message);
      return res.redirect('/');
    }
    throw err;
  }
});