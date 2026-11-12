const cron = require('node-cron');
const backupService = require('../services/backupService');

const TIMEZONE = 'Asia/Ho_Chi_Minh';
const SCHEDULES = [
  { type: 'daily', expression: '0 2 * * *' }, // 02:00 mỗi ngày
  { type: 'weekly', expression: '0 3 * * 0' }, // 03:00 Chủ nhật
  { type: 'monthly', expression: '0 4 1 * *' }, // 04:00 ngày 1 hằng tháng
];

function start() {
  if (process.env.NODE_ENV === 'test' || process.env.BACKUP_SCHEDULE === 'off') return [];

  if (!/^[a-f0-9]{64}$/i.test(process.env.BACKUP_KEY || '')) {
    console.warn('Cảnh báo: chưa cấu hình BACKUP_KEY hợp lệ, sao lưu tự động sẽ thất bại');
  }

  const tasks = SCHEDULES.map(({ type, expression }) =>
    cron.schedule(
      expression,
      () => {
        backupService
          .createBackup({ type })
          .catch((err) => console.error(`Sao lưu ${type} thất bại:`, err.message));
      },
      { timezone: TIMEZONE }
    )
  );
  console.log('Đã lên lịch sao lưu: hằng ngày 02:00, Chủ nhật 03:00, ngày 1 hằng tháng 04:00');
  return tasks;
}

module.exports = { start };