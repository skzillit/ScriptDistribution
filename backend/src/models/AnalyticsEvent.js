const mongoose = require('mongoose');

const analyticsEventSchema = new mongoose.Schema({
  script: { type: mongoose.Schema.Types.ObjectId, ref: 'Script', required: true },
  scriptVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'ScriptVersion' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventType: {
    type: String,
    enum: ['view', 'download', 'share', 'breakdown_view', 'page_view'],
    required: true,
  },
  metadata: {
    pageNumber: Number,
    ipAddress: String,
    userAgent: String,
    duration: Number,
  },
}, { timestamps: true });

analyticsEventSchema.index({ script: 1, eventType: 1, createdAt: -1 });
analyticsEventSchema.index({ script: 1, user: 1 });

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);
