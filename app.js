require('dotenv').config();
const path = require('path');
const express = require('express');
const connectDB = require('./config/db');
const buildSession = require('./config/session');
const { validateEnv } = require('./config/env');
const logger = require('./utils/logger');
const requestId = require('./middlewares/requestId');
const requestLogger = require('./middlewares/requestLogger');
const { securityHeaders, noStore } = require('./middlewares/securityHeaders');
const refreshSessionUser = require('./middlewares/sessionUser');
const csrf = require('./middlewares/csrf');
const locals = require('./middlewares/locals');
const { generalLimiter } = require('./middlewares/rateLimit');
const routes = require('./routes');
const backupJob = require('./jobs/backupJob');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');
// Chỉ bật khi thật sự đứng sau reverse proxy (Nginx...), nếu không có thể bị giả mạo địa chỉ IP
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

app.use(requestId);
app.use(securityHeaders);
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));
app.use(
  express.static(path.join(__dirname, 'public'), {
    dotfiles: 'ignore',
    index: false,
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  })
);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(requestLogger);
app.use(noStore);
app.use(generalLimiter);
app.use(buildSession());
app.use(refreshSessionUser);
app.use(csrf);
app.use(locals);
app.use('/', routes);

app.use(notFound);
app.use(errorHandler);

async function start() {
  const problems = validateEnv();
  if (problems.length) throw new Error(`Cấu hình không hợp lệ:\n- ${problems.join('\n- ')}`);

  await connectDB();
  backupJob.start();
  const port = process.env.PORT || 3000;
  app.listen(port, () => logger.info(`Server chạy tại http://localhost:${port}`));
}

if (require.main === module) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = app;