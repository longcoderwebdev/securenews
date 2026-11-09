// const session = require('express-session');
// const MongoStore = require('connect-mongo');

const session = require('express-session');
const MongoStore = require('connect-mongo').default || require('connect-mongo'); 

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
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 60 * 1000,
    },
  };
  if (process.env.NODE_ENV !== 'test') {
    options.store = MongoStore.create({ mongoUrl: process.env.MONGO_URI, ttl: 30 * 60 });
  }
  return session(options);
}

module.exports = buildSession;