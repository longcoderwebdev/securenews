const mongoose = require('mongoose');

const backupRecordSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true },
    type: { type: String, enum: ['daily', 'weekly', 'monthly', 'manual'], required: true },
    sizeBytes: { type: Number, default: 0 },
    checksum: { type: String },
    location: { type: String, enum: ['local', 'offsite'], default: 'local' },
    status: { type: String, enum: ['success', 'failed'], required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    error: { type: String, maxlength: 200 },
  },
  { timestamps: true }
);

backupRecordSchema.index({ createdAt: -1 });
backupRecordSchema.index({ type: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('BackupRecord', backupRecordSchema);