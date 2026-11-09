const AuditLog = require('../models/AuditLog');

async function record({ user, action, target, ip, userAgent, result = 'success', detail }) {
  try {
    await AuditLog.create({ user, action, target, ip, userAgent, result, detail });
  } catch (err) {
    console.error('Không ghi được nhật ký:', err.message);
  }
}

module.exports = { record };