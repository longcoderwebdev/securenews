const session = require('express-session');
// const MongoStore = require('connect-mongo');
const MongoStore = require('connect-mongo').default || require('connect-mongo');

// Mặc định cookie chỉ gửi qua HTTPS khi chạy production.
// Chạy demo trên HTTP (ví dụ Docker trên máy cá nhân) thì đặt COOKIE_SECURE=false
function secureCookie() {
  if (process.env.COOKIE_SECURE) return process.env.COOKIE_SECURE === 'true';
  return process.env.NODE_ENV === 'production';
}

function buildSession() {
  const options = {
    name: 'sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookie(),
      maxAge: 30 * 60 * 1000,
    },
  };
  if (process.env.NODE_ENV !== 'test') {
    options.store = MongoStore.create({ mongoUrl: process.env.MONGO_URI, ttl: 30 * 60 });
  }
  return session(options);
}

module.exports = buildSession;