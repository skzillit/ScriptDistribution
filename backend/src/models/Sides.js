const mongoose = require('mongoose');

const sidesSceneSchema = new mongoose.Schema({
  sceneNumber: { type: String, required: true },
  heading: String,           // e.g. "INT. BATCAVE - NIGHT"
  rawText: { type: String, default: '' },
  htmlContent: String,
  pageStart: Number,         // which script page this scene starts on
  pageEnd: Number,           // which script page this scene ends on
  // Provenance — set only when sides are pulled from multiple script versions.
  sourceVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'ScriptVersion' },
  sourceVersionLabel: String, // e.g. "v3" or "Blue Revision" — shown in the PDF
  // Owning script id — required for multi-script generation so the combined-
  // order pass can place units by the `scriptId:sceneNumber` composite token.
  sourceScriptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Script' },
  imageKey: String,           // unique key tying this scene to its rendered image group
}, { _id: false });

const sidesSchema = new mongoose.Schema({
  callSheet: { type: mongoose.Schema.Types.ObjectId, ref: 'CallSheet' },
  shootingSchedule: { type: mongoose.Schema.Types.ObjectId, ref: 'ShootingSchedule', default: null },
  scriptVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'ScriptVersion', required: true },
  script: { type: mongoose.Schema.Types.ObjectId, ref: 'Script', required: true },
  title: { type: String, required: true },
  sceneNumbers: [String],
  // User-defined render order across BOTH script scenes and page scenes
  // (the "rearrange order" field). Empty = natural script/page order.
  sceneOrder: [String],
  // Multi-version selection: pull specific scenes from specific script versions.
  // Empty for the common single-version case (then scriptVersion + sceneNumbers apply).
  versionScenes: [{
    scriptVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'ScriptVersion' },
    script: { type: mongoose.Schema.Types.ObjectId, ref: 'Script' }, // version's own parent script (may be a historical one)
    versionLabel: String,
    sceneNumbers: [String],
    _id: false,
  }],
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
  // Scene "folders" (ScenePage) pulled into this sides booklet — each contributes
  // its uploaded PDF pages under a colored, titled header.
  sceneFolders: [{
    scenePage: { type: mongoose.Schema.Types.ObjectId, ref: 'ScenePage' },
    sceneNumber: String,          // the folder's title
    sceneNumbers: [String],       // specific scenes selected from the folder's PDF (empty = whole PDF)
    color: String,
    description: String,
    pdfUrl: String,
    _id: false,
  }],
  includeCallSheet: { type: Boolean, default: true },
  callSheetPages: { type: String, default: 'all' },
  // How unselected scenes are rendered: 'hide' (only selected scenes — default)
  // or 'crossout' (keep full pages, strike through the unselected scenes).
  sceneDisplayMode: { type: String, enum: ['hide', 'crossout'], default: 'hide' },
  pdfUrl: String,
  scheduleStartPage: { type: Number, default: 0 },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  downloadCount: { type: Number, default: 0 },
  status: { type: String, enum: ['generating', 'ready', 'error', 'archived'], default: 'generating' },
  // Review gate: generated sides stay unpublished (hidden from the Sides module)
  // until the user clicks "Publish". Default true keeps older records visible.
  published: { type: Boolean, default: true },
  docDistribution: { type: Boolean, default: false },
  error: String,
}, { timestamps: true });

sidesSchema.index({ callSheet: 1 });
sidesSchema.index({ script: 1 });
sidesSchema.index({ generatedBy: 1 });

module.exports = mongoose.model('Sides', sidesSchema);
