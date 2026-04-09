const mongoose = require('mongoose');

const breakdownCategorySchema = new mongoose.Schema({
  project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Script', required: true },
  name: { type: String, required: true },
  slug: { type: String, required: true },
  color: { type: String, required: true },
  icon: { type: String, default: '' },
  sort_order: { type: Number, default: 0 },
  is_default: { type: Boolean, default: false },
  is_active: { type: Boolean, default: true },
  created: { type: Number, default: Date.now },
});

breakdownCategorySchema.index({ project_id: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('BreakdownCategory', breakdownCategorySchema);
