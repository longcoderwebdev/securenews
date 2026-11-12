// Trả về danh sách vấn đề của cấu hình; rỗng nghĩa là hợp lệ
function validateEnv(env = process.env) {
  const problems = [];
  if (!env.MONGO_URI) problems.push('MONGO_URI chưa được cấu hình');
  if (!env.SESSION_SECRET) problems.push('SESSION_SECRET chưa được cấu hình');

  if (env.NODE_ENV === 'production') {
    if (env.SESSION_SECRET && env.SESSION_SECRET.length < 32) {
      problems.push('SESSION_SECRET phải có ít nhất 32 ký tự khi chạy production');
    }
    if (!/^[a-f0-9]{64}$/i.test(env.BACKUP_KEY || '')) {
      problems.push('BACKUP_KEY phải là chuỗi hex 64 ký tự khi chạy production');
    }
  }
  return problems;
}

module.exports = { validateEnv };