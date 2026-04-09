const mongoose = require('mongoose');

const breakdownTagSchema = new mongoose.Schema({
  project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Script', required: true },
  scene_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ScriptPage', required: true },
  element_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BreakdownElement', required: true },
  line_index: { type: Number, required: true },
  char_start: { type: Number, required: true },
  char_end: { type: Number, required: true },
  tagged_text: { type: String, required: true },
  status: { type: String, enum: ['confirmed', 'suggested', 'rejected'], default: 'confirmed' },
  ai_generated: { type: Boolean, default: false },
  ai_confidence: { type: Number, default: null },
  created: { type: Number, default: Date.now },
  created_by: { type: String, default: '' },
});

breakdownTagSchema.index({ scene_id: 1, element_id: 1 });
breakdownTagSchema.index({ element_id: 1 });
breakdownTagSchema.index({ project_id: 1, status: 1 });

module.exports = mongoose.model('BreakdownTag', breakdownTagSchema);
