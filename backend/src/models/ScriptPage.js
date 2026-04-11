const mongoose = require('mongoose');

const scriptPageSchema = new mongoose.Schema({
  scriptVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'ScriptVersion', required: true },
  pageNumber: { type: Number, required: true },
  rawText: { type: String, default: '' },
  htmlContent: String,
  elements: [{
    type: { type: String, enum: ['scene_heading', 'action', 'dialogue', 'character', 'parenthetical', 'transition'] },
    text: String,
    startOffset: Number,
    endOffset: Number,
  }],
  sceneNumbers: [String],
  // Scene metadata (for breakdown)
  location: { type: String, default: '' },
  locationAddress: { type: String, default: '' },
  cast_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BreakdownElement' }],
  synopsis: { type: String, default: '' },
  int_ext: { type: String, default: '' },
  day_night: { type: String, default: '' },
  set_name: { type: String, default: '' },
}, { timestamps: true });

scriptPageSchema.index({ scriptVersion: 1, pageNumber: 1 }, { unique: true });

module.exports = mongoose.model('ScriptPage', scriptPageSchema);
