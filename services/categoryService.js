const mongoose = require('mongoose');
const Category = require('../models/Category');
const Article = require('../models/Article');
const AppError = require('../utils/AppError');
const slugify = require('../utils/slugify');
const audit = require('./auditService');

const isStr = (v) => typeof v === 'string';

function validate(input) {
  const { name, description = '' } = input || {};
  const errors = {};

  if (!isStr(name) || name.trim().length < 2 || name.trim().length > 60) {
    errors.name = 'Tên danh mục từ 2 đến 60 ký tự';
  } else if (!slugify(name)) {
    errors.name = 'Tên danh mục phải có chữ hoặc số';
  }
  if (!isStr(description) || description.trim().length > 300) {
    errors.description = 'Mô tả tối đa 300 ký tự';
  }
  if (Object.keys(errors).length) throw new AppError(400, 'Dữ liệu không hợp lệ', errors);

  return { name: name.trim(), description: description.trim(), slug: slugify(name) };
}

async function list() {
  const categories = await Category.find().sort('name').lean();
  const counts = await Article.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  return categories.map((c) => ({ ...c, articleCount: countMap.get(String(c._id)) || 0 }));
}

async function getById(id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError(404, 'Không tìm thấy danh mục');
  const category = await Category.findById(id);
  if (!category) throw new AppError(404, 'Không tìm thấy danh mục');
  return category;
}

const duplicate = () => new AppError(409, 'Danh mục đã tồn tại', { name: 'Danh mục này đã tồn tại' });

async function create(admin, input, meta) {
  const data = validate(input);
  try {
    const category = await Category.create(data);
    await audit.record({ user: admin.id, action: 'CATEGORY_CREATE', target: `Category:${category.id}`, ...meta });
    return category;
  } catch (err) {
    if (err.code === 11000) throw duplicate();
    throw err;
  }
}

async function update(id, admin, input, meta) {
  const category = await getById(id);
  const data = validate(input);
  try {
    category.set(data);
    await category.save();
  } catch (err) {
    if (err.code === 11000) throw duplicate();
    throw err;
  }
  await audit.record({ user: admin.id, action: 'CATEGORY_UPDATE', target: `Category:${id}`, ...meta });
  return category;
}

async function remove(id, admin, meta) {
  const category = await getById(id);
  if (await Article.exists({ category: category._id })) {
    throw new AppError(409, 'Không thể xóa danh mục đang có bài viết');
  }
  await category.deleteOne();
  await audit.record({ user: admin.id, action: 'CATEGORY_DELETE', target: `Category:${id}`, ...meta });
}

module.exports = { list, getById, create, update, remove };