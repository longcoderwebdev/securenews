process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/securenews_test_public';

const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const User = require('../models/User');
const Category = require('../models/Category');
const Article = require('../models/Article');

const countCards = (html) => (html.match(/class="article-card"/g) || []).length;
let counter = 0;

describe('Trang công khai', () => {
  let author;
  let cat1;
  let cat2;

  const make = (title, extra = {}) => {
    counter += 1;
    return Article.create({
      title,
      slug: `bai-${counter}-${Math.random().toString(16).slice(2, 8)}`,
      content: '<p>Nội dung</p>',
      category: cat1._id,
      author: author._id,
      status: 'published',
      publishedAt: new Date(Date.now() - counter * 1000),
      ...extra,
    });
  };

  before(async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Category.deleteMany({}), Article.deleteMany({})]);
    author = await User.create({ fullName: 'Lan Nguyen', email: 'lan@test.vn', passwordHash: 'x', role: 'editor' });
    [cat1, cat2] = await Category.create([
      { name: 'An toàn thông tin', slug: 'an-toan-thong-tin' },
      { name: 'Thông báo', slug: 'thong-bao' },
    ]);
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('khách xem trang chủ: chỉ thấy bài đã đăng', async () => {
    await make('Bài đã đăng hợp lệ');
    await make('Bài còn là nháp', { status: 'draft' });
    await make('Bài đang chờ duyệt', { status: 'pending' });
    await make('Bài bị từ chối', { status: 'rejected' });
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Bài đã đăng hợp lệ'));
    assert.ok(!res.text.includes('Bài còn là nháp'));
    assert.ok(!res.text.includes('Bài đang chờ duyệt'));
    assert.ok(!res.text.includes('Bài bị từ chối'));
  });

  test('tìm kiếm theo từ khóa, không phân biệt hoa thường', async () => {
    await make('Cách nhận biết email lừa đảo');
    await make('Bản vá bảo mật tháng mười một');
    const res = await request(app).get('/articles').query({ q: 'EMAIL' });
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Cách nhận biết email lừa đảo'));
    assert.ok(!res.text.includes('Bản vá bảo mật'));
  });

  test('tìm không thấy thì báo không có bài phù hợp', async () => {
    await make('Một bài viết bất kỳ');
    const res = await request(app).get('/articles').query({ q: 'khongcotuaynay' });
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Không tìm thấy bài viết phù hợp'));
    assert.equal(countCards(res.text), 0);
  });

  test('ký tự đặc biệt trong từ khóa không gây lỗi', async () => {
    await make('Một bài viết bất kỳ');
    const res = await request(app).get('/articles').query({ q: '(.*+?[' });
    assert.equal(res.status, 200);
  });

  test('truy vấn kiểu object (NoSQL injection) bị bỏ qua, không gây lỗi', async () => {
    await make('Bài viết vẫn hiển thị bình thường');
    const res = await request(app).get('/articles?q[$ne]=x');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Bài viết vẫn hiển thị bình thường'));
  });

  test('lọc theo danh mục', async () => {
    await make('Bài thuộc an toàn thông tin');
    await make('Bài thuộc thông báo', { category: cat2._id });
    const res = await request(app).get('/articles').query({ category: 'thong-bao' });
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Bài thuộc thông báo'));
    assert.ok(!res.text.includes('Bài thuộc an toàn thông tin'));
  });

  test('phân trang: 10 bài mỗi trang', async () => {
    for (let i = 1; i <= 12; i += 1) {
      await make(`Bai so ${String(i).padStart(2, '0')}`);
    }
    const page1 = await request(app).get('/articles');
    assert.equal(countCards(page1.text), 10);
    assert.ok(page1.text.includes('Bai so 01'));
    assert.ok(!page1.text.includes('Bai so 12'));

    const page2 = await request(app).get('/articles').query({ page: 2 });
    assert.equal(countCards(page2.text), 2);
    assert.ok(page2.text.includes('Bai so 12'));
  });

  test('số trang không hợp lệ thì về trang 1', async () => {
    await make('Bài viết duy nhất');
    const res = await request(app).get('/articles').query({ page: 'abc' });
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Bài viết duy nhất'));
  });

  test('đọc bài đã đăng: có tiêu đề, tác giả, danh mục và nội dung', async () => {
    const a = await make('Bài để đọc chi tiết');
    const res = await request(app).get(`/articles/${a.slug}`);
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Bài để đọc chi tiết'));
    assert.ok(res.text.includes('Lan Nguyen'));
    assert.ok(res.text.includes('An toàn thông tin'));
    assert.ok(res.text.includes('<p>Nội dung</p>'));
  });

  test('bài nháp, chờ duyệt, bị từ chối đều trả 404 khi truy cập bằng đường dẫn', async () => {
    for (const status of ['draft', 'pending', 'rejected']) {
      const a = await make(`Bài trạng thái ${status}`, { status });
      const res = await request(app).get(`/articles/${a.slug}`);
      assert.equal(res.status, 404);
    }
  });

  test('đường dẫn bài không tồn tại trả 404', async () => {
    const res = await request(app).get('/articles/khong-ton-tai');
    assert.equal(res.status, 404);
  });

  test('mã độc lọt vào CSDL vẫn không được xuất ra trang đọc', async () => {
    const a = await make('Bài có mã độc', {
      content: '<p>An toàn</p><script>alert(1)</script><img src=x onerror=alert(2)>',
    });
    const res = await request(app).get(`/articles/${a.slug}`);
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('<p>An toàn</p>'));
    assert.ok(!res.text.includes('alert(1)'));
    assert.ok(!res.text.includes('onerror'));
  });
});