const path = require('path');
const winston = require('winston');

const isTest = process.env.NODE_ENV === 'test';

const consoleFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${message}${extra}${stack ? `\n${stack}` : ''}`;
  })
);
const fileFormat = winston.format.combine(winston.format.timestamp(), winston.format.json());

const transports = [];
if (isTest) {
  transports.push(new winston.transports.Console({ silent: true }));
} else {
  const dir = path.join(__dirname, '..', 'logs');
  const rotate = { maxsize: 5 * 1024 * 1024, maxFiles: 5 };
  transports.push(new winston.transports.Console({ format: consoleFormat }));
  transports.push(new winston.transports.File({ filename: path.join(dir, 'app.log'), format: fileFormat, ...rotate }));
  transports.push(
    new winston.transports.File({ filename: path.join(dir, 'error.log'), level: 'error', format: fileFormat, ...rotate })
  );
}

module.exports = winston.createLogger({ level: process.env.LOG_LEVEL || 'info', transports });