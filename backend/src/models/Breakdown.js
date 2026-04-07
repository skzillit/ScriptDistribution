const mongoose = require('mongoose');

const occurrenceSchema = new mongoose.Schema({
  pageNumber: Number,
  sceneNumber: String,
  startOffset: Number,
  endOffset: Number,
  contextSnippet: String,
}, { _id: false });

const breakdownElementSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: [
      'CAST_MEMBER', 'EXTRA', 'PROP', 'SET_DRESSING', 'LOCATION', 'VEHICLE',
      'WARDROBE', 'MAKEUP_HAIR', 'VFX', 'SFX', 'SOUND_EFFECT', 'MUSIC',
      'SPECIAL_EQUIPMENT', 'ANIMAL', 'STUNT', 'GREENERY',
    ],
    required: true,
  },
  name: { type: String, required: true },
  description: String,
  occurrences: [occurrenceSchema],
  notes: String,
  color: String,
});

const sceneSchema = new mongoose.Schema({
  sceneNumber: String,
  heading: String,
  intExt: String,
  location: String,
  timeOfDay: String,
  pageStart: Number,
  pageEnd: Number,
  synopsis: String,
  castIds: [String],
  elementIds: [mongoose.Schema.Types.ObjectId],
}, { _id: false });

const breakdownSchema = new mongoose.Schema({
  scriptVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'ScriptVersion', required: true },
  status: { type: String, enum: ['pending', 'processing', 'complete', 'error'], default: 'pending' },
  elements: [breakdownElementSchema],
  scenes: [sceneSchema],
  summary: {
    totalScenes: Number,
    totalPages: Number,
    castCount: Number,
    locationCount: Number,
    estimatedShootDays: Number,
  },
  aiProvider: String,
  error: String,
  processedAt: Date,
}, { timestamps: true });

breakdownSchema.index({ scriptVersion: 1 }, { unique: true });

module.exports = mongoose.model('Breakdown', breakdownSchema);
