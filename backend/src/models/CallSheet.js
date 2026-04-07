const mongoose = require('mongoose');

const callSheetSceneSchema = new mongoose.Schema({
  sceneNumber: { type: String, required: true },
  description: String,
  cast: [String],
  location: String,
  timeOfDay: String,
  pages: String, // e.g. "1-3", "5 2/8"
  estimatedTime: String,
  notes: String,
}, { _id: false });

const callSheetSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Script' },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date }, // Shoot date
  pdfUrl: String, // Original uploaded call sheet PDF in S3
  rawText: String, // Extracted text from call sheet
  scenes: [callSheetSceneSchema],
  crewCall: String, // e.g. "6:00 AM"
  location: String, // Primary location for the day
  weather: String,
  sunrise: String,
  sunset: String,
  notes: String,
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
}, { timestamps: true });

callSheetSchema.index({ project: 1, date: -1 });
callSheetSchema.index({ uploadedBy: 1 });

module.exports = mongoose.model('CallSheet', callSheetSchema);
