require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const connectDB = require('./config/db');
const buildSession = require('./config/session');
const csrf = require('./middlewares/csrf');
const locals = require('./middlewares/locals');
const { generalLimiter } = require('./middlewares/rateLimit');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');

app.use(helmet());
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(generalLimiter);
app.use(buildSession());
app.use(csrf);
app.use(locals);
app.use('/', routes);

app.use(notFound);
app.use(errorHandler);

async function start() {
  await connectDB();
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server chạy tại http://localhost:${port}`));
}

if (require.main === module) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = app;