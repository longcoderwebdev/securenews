const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const articleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    slug: { type: String, required: true, unique: true },
    summary: { type: String, trim: true, maxlength: 300, default: '' },
    content: { type: String, required: true },
    coverImage: { type: String },
    category: { type: ObjectId, ref: 'Category', required: true },
    author: { type: ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['draft', 'pending', 'published', 'rejected'], default: 'draft' },
    rejectReason: { type: String, maxlength: 300 },
    approvedBy: { type: ObjectId, ref: 'User' },
    submittedAt: { type: Date },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

articleSchema.index({ title: 'text', summary: 'text' }, { default_language: 'none' });
articleSchema.index({ status: 1, publishedAt: -1 });
articleSchema.index({ author: 1, status: 1 });

articleSchema.methods.isOwnedBy = function isOwnedBy(userId) {
  return String(this.author) === String(userId);
};

module.exports = mongoose.model('Article', articleSchema);