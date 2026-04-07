const mongoose = require('mongoose');

const scriptVersionSchema = new mongoose.Schema({
  script: { type: mongoose.Schema.Types.ObjectId, ref: 'Script', required: true },
  versionNumber: { type: Number, required: true },
  versionLabel: String,
  pdfUrl: { type: String, default: '' },
  rawText: String,
  pageCount: Number,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  changeNotes: String,
  diffFromPrevious: {
    added: [String],
    removed: [String],
    modified: [{
      pageNumber: Number,
      changes: [mongoose.Schema.Types.Mixed],
    }],
  },
  status: { type: String, enum: ['processing', 'ready', 'error'], default: 'processing' },
}, { timestamps: true });

scriptVersionSchema.index({ script: 1, versionNumber: -1 });

module.exports = mongoose.model('ScriptVersion', scriptVersionSchema);
