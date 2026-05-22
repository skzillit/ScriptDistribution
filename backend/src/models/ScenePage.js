const mongoose = require('mongoose');

/**
 * A "scene folder" / page bundle attached to a script. Producers create these
 * to organise specific pages (a PDF) under a scene number, with a color tag and
 * optional description. They can then be pulled into a sides booklet.
 */
const scenePageSchema = new mongoose.Schema({
  script: { type: mongoose.Schema.Types.ObjectId, ref: 'Script', required: true },
  sceneNumber: { type: String, required: true },  // used as the folder title
  color: { type: String, default: '#9e9e9e' },    // hex color tag
  description: { type: String, default: '' },      // optional
  pdfUrl: { type: String },                        // storage key of the uploaded PDF
  pageCount: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

scenePageSchema.index({ script: 1, createdAt: -1 });

module.exports = mongoose.model('ScenePage', scenePageSchema);
