const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, sparse: true, trim: true, lowercase: true },
  name: { type: String, required: true, trim: true },
  deviceId: { type: String, index: true },
  role: { type: String, enum: ['admin', 'editor', 'viewer'], default: 'editor' },
  avatarUrl: String,
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
