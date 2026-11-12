const mongoose = require('mongoose');
const Comment = require('../models/Comment');
const Article = require('../models/Article');
const AppError = require('../utils/AppError');
const audit = require('./auditService');

const MIN_LENGTH = 2;
const MAX_LENGTH = 1000;
const LIST_LIMIT = 50;

// Giữ lại xuống dòng và tab, bỏ các ký tự điều khiển khác; việc escape HTML làm ở tầng hiển thị
function cleanText(input) {
  if (typeof input !== 'string') return '';
  let out = '';
  for (const ch of input.replace(/\r\n?/g, '\n')) {
    const code = ch.codePointAt(0);
    if (code === 10 || code === 9 || (code >= 32 && code !== 127)) out += ch;
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

async function add(user, slug, content, meta) {
  const article = await Article.findOne({
    slug: typeof slug === 'string' ? slug : '',
    status: 'published',
  }).select('slug');
  if (!article) throw new AppError(404, 'Không tìm thấy bài viết');

  const text = cleanText(content);
  if (text.length < MIN_LENGTH || text.length > MAX_LENGTH) {
    throw new AppError(400, 'Bình luận từ 2 đến 1000 ký tự', { content: 'Bình luận từ 2 đến 1000 ký tự' });
  }

  const comment = await Comment.create({ article: article._id, user: user.id, content: text });
  await audit.record({ user: user.id, action: 'COMMENT_CREATE', target: `Comment:${comment.id}`, ...meta });
  return { comment, slug: article.slug };
}

async function listVisible(articleId) {
  const filter = { article: articleId, status: 'visible' };
  const [items, total] = await Promise.all([
    Comment.find(filter)
      .select('content createdAt user')
      .populate('user', 'fullName')
      .sort('-createdAt')
      .limit(LIST_LIMIT)
      .lean(),
    Comment.countDocuments(filter),
  ]);
  return { items, total };
}

async function hide(id, actor, meta) {
  if (!mongoose.isValidObjectId(id)) throw new AppError(404, 'Không tìm thấy bình luận');

  const updated = await Comment.findOneAndUpdate(
    { _id: id, status: 'visible' },
    { $set: { status: 'hidden' } },
    { returnDocument: 'after' }
  );
  if (!updated) {
    throw (await Comment.exists({ _id: id }))
      ? new AppError(409, 'Bình luận đã được ẩn trước đó')
      : new AppError(404, 'Không tìm thấy bình luận');
  }

  const article = await Article.findById(updated.article).select('slug');
  await audit.record({ user: actor.id, action: 'COMMENT_HIDE', target: `Comment:${id}`, ...meta });
  return { comment: updated, slug: article ? article.slug : '' };
}

module.exports = { add, listVisible, hide };