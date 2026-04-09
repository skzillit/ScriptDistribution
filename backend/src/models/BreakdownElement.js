const mongoose = require('mongoose');

const breakdownElementSchema = new mongoose.Schema({
  project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Script', required: true },
  category_slug: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  ai_generated: { type: Boolean, default: false },
  created: { type: Number, default: Date.now },
  updated: { type: Number, default: Date.now },
});

breakdownElementSchema.index(
  { project_id: 1, category_slug: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);
breakdownElementSchema.index({ project_id: 1, category_slug: 1 });

module.exports = mongoose.model('BreakdownElement', breakdownElementSchema);
