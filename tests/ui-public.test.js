process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/securenews_test_ui_public';

const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const app = require('../app');
const User = require('../models/User');
const Category = require('../models/Category');
const Article = require('../models/Article');
const Comment = require('../models/Comment');

const PASSWORD = 'MatKhau12345';
const COVER = `${'0'.repeat(32)}.png`;
const tokenFrom = (html) => /name="_csrf" value="([a-f0-9]+)"/.exec(html)[1];
const countCards = (html) => (html.match(/class="article-card"/g) || []).length;

async function loginAs(email) {
  const agent = request.agent(app);
  const page = await agent.get('/auth/login');
  await agent
    .post('/auth/login')
    .type('form')
    .send({ _csrf: tokenFrom(page.text), email, password: PASSWORD });
  return agent;
}

function assertCspFriendly(html, where) {
  assert.ok(!/<style[\s>]/i.test(html), `${where}: có thẻ <style> nhúng`);
  assert.ok(!/\sstyle\s*=/i.test(html), `${where}: có thuộc tính style nhúng`);
  assert.ok(!/\son[a-z]+\s*=/i.test(html), `${where}: có sự kiện nhúng (onclick...)`);
  assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/i.test(html), `${where}: có thẻ <script> nhúng`);
  assert.ok(
    !/(?:https?:)?\/\/(?:cdn|unpkg|cdnjs|fonts\.googleapis|code\.jquery)/i.test(html),
    `${where}: nạp tài nguyên từ CDN`
  );
}

describe('Giao diện công khai', () => {
  let editor;
  let user;
  let withCover;

  before(async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Category.deleteMany({}), Article.deleteMany({}), Comment.deleteMany({})]);
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    [editor, user] = await User.create([
      { fullName: 'Bien Tap', email: 'editor@test.vn', passwordHash, role: 'editor' },
      { fullName: 'Nguoi Dung', email: 'user@test.vn', passwordHash, role: 'user' },
    ]);
    const cat = await Category.create({ name: 'An toàn thông tin', slug: 'an-toan-thong-tin' });
    [withCover] = await Article.create([
      {
        title: 'Bài có ảnh bìa',
        slug: 'bai-co-anh-bia',
        content: '<p>Nội dung</p>',
        coverImage: COVER,
        category: cat._id,
        author: editor._id,
        status: 'published',
        publishedAt: new Date(),
      },
      {
        title: 'Bài không có ảnh',
        slug: 'bai-khong-co-anh',
        content: '<p>Nội dung</p>',
        category: cat._id,
        author: editor._id,
        status: 'published',
        publishedAt: new Date(Date.now() - 1000),
      },
    ]);
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('trang chủ có bài: không mã nhúng, có ảnh bìa và khung thay thế khi thiếu ảnh', async () => {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assertCspFriendly(res.text, '/');
    assert.equal(countCards(res.text), 2);
    assert.ok(res.text.includes(`/uploads/${COVER}`));
    assert.ok(res.text.includes('cover-placeholder'));
  });

  test('có ô tìm kiếm có nhãn và nhãn danh mục đánh dấu trang hiện tại', async () => {
    const all = await request(app).get('/');
    assert.ok(all.text.includes('name="q"'));
    assert.ok(all.text.includes('for="q"'));
    assert.ok(all.text.includes('href="/articles?category=an-toan-thong-tin"'));
    assert.ok(all.text.includes('href="/articles" aria-current="page"'));

    const filtered = await request(app).get('/articles').query({ category: 'an-toan-thong-tin' });
    assert.ok(filtered.text.includes('href="/articles?category=an-toan-thong-tin" aria-current="page"'));
    assert.ok(!filtered.text.includes('href="/articles" aria-current="page"'));
  });

  test('từ khóa tìm kiếm chứa mã được hiển thị thành chữ', async () => {
    const res = await request(app).get('/articles').query({ q: '<script>alert(1)</script>' });
    assert.equal(res.status, 200);
    assert.ok(!res.text.includes('<script>alert(1)</script>'));
    assert.ok(res.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  });

  test('trang đọc bài của khách: có breadcrumb, lời mời đăng nhập, không mã nhúng', async () => {
    await Comment.create({ article: withCover._id, user: user._id, content: 'Bình luận hiển thị' });
    const res = await request(app).get(`/articles/${withCover.slug}`);
    assert.equal(res.status, 200);
    assertCspFriendly(res.text, 'detail');
    assert.ok(res.text.includes('breadcrumb'));
    assert.ok(res.text.includes('Bình luận (1)'));
    assert.ok(res.text.includes('Bình luận hiển thị'));
    assert.ok(res.text.includes('Đăng nhập</a> để bình luận'));
    assert.ok(!res.text.includes('Gửi bình luận'));
  });

  test('trang đọc bài của biên tập viên: có nút Ẩn bình luận và vẫn không mã nhúng', async () => {
    const c = await Comment.create({ article: withCover._id, user: user._id, content: 'Bình luận cần ẩn' });
    const agent = await loginAs('editor@test.vn');
    const res = await agent.get(`/articles/${withCover.slug}`);
    assert.equal(res.status, 200);
    assertCspFriendly(res.text, 'detail-editor');
    assert.ok(res.text.includes(`/comments/${c.id}/hide`));
    assert.ok(res.text.includes('Gửi bình luận'));
  });

  test('bình luận chứa HTML được hiển thị thành chữ, không thành thẻ', async () => {
    await Comment.create({ article: withCover._id, user: user._id, content: '<b>đậm</b><i>nghiêng</i>' });
    const res = await request(app).get(`/articles/${withCover.slug}`);
    assert.ok(res.text.includes('&lt;b&gt;'));
    assert.ok(!res.text.includes('<b>đậm</b>'));
  });
});