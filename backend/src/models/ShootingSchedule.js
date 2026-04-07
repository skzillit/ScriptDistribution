const mongoose = require('mongoose');

const shootDaySchema = new mongoose.Schema({
  dayNumber: Number,
  date: String,
  scenes: [{
    sceneNumber: String,
    heading: String,
    intExt: String,
    location: String,
    timeOfDay: String,
    pages: String,
    synopsis: String,
    cast: [String],
    props: [String],
    backgroundActors: [String],
    setDressing: [String],
    cgiCharacters: [String],
    grip: [String],
    electric: [String],
    additionalLabor: [String],
    standby: [String],
    visualEffects: [String],
    makeupHair: [String],
    wardrobe: [String],
    vehicles: [String],
    specialEffects: [String],
    stunts: [String],
    animals: [String],
    music: [String],
    sound: [String],
    notes: String,
  }],
  location: String,
  callTime: String,
  wrapTime: String,
  notes: String,
}, { _id: false });

const shootingScheduleSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Script' },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  pdfUrl: String,
  rawText: String,
  shootDays: [shootDaySchema],
  totalDays: Number,
  totalScenes: Number,
  startDate: String,
  endDate: String,
  notes: String,
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
}, { timestamps: true });

shootingScheduleSchema.index({ project: 1 });
shootingScheduleSchema.index({ uploadedBy: 1 });

module.exports = mongoose.model('ShootingSchedule', shootingScheduleSchema);
