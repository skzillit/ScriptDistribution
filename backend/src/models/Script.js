const mongoose = require('mongoose');

const scriptSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  collaborators: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['editor', 'viewer'], default: 'viewer' },
  }],
  currentVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'ScriptVersion' },
  genre: String,
  format: { type: String, enum: ['feature', 'tv_episode', 'short', 'commercial'], default: 'feature' },
  status: { type: String, enum: ['draft', 'in_review', 'approved', 'archived'], default: 'draft' },
  thumbnailUrl: String,
  tags: [String],
}, { timestamps: true });

scriptSchema.index({ owner: 1, status: 1 });

module.exports = mongoose.model('Script', scriptSchema);
