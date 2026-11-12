const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const commentSchema = new mongoose.Schema(
  {
    article: { type: ObjectId, ref: 'Article', required: true },
    user: { type: ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 1000 },
    status: { type: String, enum: ['visible', 'hidden'], default: 'visible' },
  },
  { timestamps: true }
);

commentSchema.index({ article: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);