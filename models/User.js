const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'editor', 'admin'], default: 'user' },
    isActive: { type: Boolean, default: true },
    failedAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    twoFAEnabled: { type: Boolean, default: false },
    twoFASecret: { type: String, select: false },
    lastLoginAt: { type: Date },
    sessionVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSchema.methods.isLocked = function isLocked() {
  return Boolean(this.lockUntil && this.lockUntil > new Date());
};

module.exports = mongoose.model('User', userSchema);