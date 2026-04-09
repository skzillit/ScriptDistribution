const mongoose = require('mongoose');

const sidesSceneSchema = new mongoose.Schema({
  sceneNumber: { type: String, required: true },
  heading: String,           // e.g. "INT. BATCAVE - NIGHT"
  rawText: { type: String, default: '' },
  htmlContent: String,
  pageStart: Number,         // which script page this scene starts on
  pageEnd: Number,           // which script page this scene ends on
}, { _id: false });

const sidesSchema = new mongoose.Schema({
  callSheet: { type: mongoose.Schema.Types.ObjectId, ref: 'CallSheet' },
  scriptVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'ScriptVersion', required: true },
  script: { type: mongoose.Schema.Types.ObjectId, ref: 'Script', required: true },
  title: { type: String, required: true },
  sceneNumbers: [String],
  scenes: [sidesSceneSchema], // Extracted scene text (not whole pages)
  totalScenes: Number,
  shootDayInfo: [{
    dayNumber: Number,
    date: String,
    callTime: String,
    wrapTime: String,
    location: String,
    scenes: [mongoose.Schema.Types.Mixed],
  }],
  includeCallSheet: { type: Boolean, default: true },
  callSheetPages: { type: String, default: 'all' },
  pdfUrl: String,
  scheduleStartPage: { type: Number, default: 0 },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  downloadCount: { type: Number, default: 0 },
  status: { type: String, enum: ['generating', 'ready', 'error', 'archived'], default: 'generating' },
  error: String,
}, { timestamps: true });

sidesSchema.index({ callSheet: 1 });
sidesSchema.index({ script: 1 });
sidesSchema.index({ generatedBy: 1 });

module.exports = mongoose.model('Sides', sidesSchema);
