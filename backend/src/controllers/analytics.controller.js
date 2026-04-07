const AnalyticsEvent = require('../models/AnalyticsEvent');
const { getDownloadUrl } = require('../services/storage.service');
const ScriptVersion = require('../models/ScriptVersion');

async function recordEvent(req, res) {
  const { scriptId, versionId, eventType, metadata } = req.body;
  const event = await AnalyticsEvent.create({
    script: scriptId,
    scriptVersion: versionId,
    user: req.user._id,
    eventType,
    metadata: {
      ...metadata,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    },
  });
  res.status(201).json({ event });
}

async function getAnalytics(req, res) {
  const { scriptId } = req.params;
  const { from, to, eventType } = req.query;

  const filter = { script: scriptId };
  if (eventType) filter.eventType = eventType;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const events = await AnalyticsEvent.find(filter)
    .populate('user', 'name email avatarUrl')
    .sort({ createdAt: -1 })
    .limit(200);

  const summary = {
    totalViews: await AnalyticsEvent.countDocuments({ ...filter, eventType: 'view' }),
    totalDownloads: await AnalyticsEvent.countDocuments({ ...filter, eventType: 'download' }),
    uniqueViewers: (await AnalyticsEvent.distinct('user', { ...filter, eventType: 'view' })).length,
  };

  res.json({ events, summary });
}

async function getViewers(req, res) {
  const { scriptId } = req.params;

  const viewers = await AnalyticsEvent.aggregate([
    { $match: { script: require('mongoose').Types.ObjectId.createFromHexString(scriptId), eventType: 'view' } },
    { $group: { _id: '$user', viewCount: { $sum: 1 }, lastViewed: { $max: '$createdAt' } } },
    { $sort: { lastViewed: -1 } },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    { $project: { user: { name: 1, email: 1, avatarUrl: 1 }, viewCount: 1, lastViewed: 1 } },
  ]);

  res.json({ viewers });
}

async function getDownloads(req, res) {
  const { scriptId } = req.params;

  const downloads = await AnalyticsEvent.find({ script: scriptId, eventType: 'download' })
    .populate('user', 'name email')
    .populate('scriptVersion', 'versionNumber versionLabel')
    .sort({ createdAt: -1 });

  res.json({ downloads, total: downloads.length });
}

async function downloadVersion(req, res) {
  const version = await ScriptVersion.findById(req.params.versionId);
  if (!version) return res.status(404).json({ error: 'Version not found' });

  // Record download event
  await AnalyticsEvent.create({
    script: version.script,
    scriptVersion: version._id,
    user: req.user._id,
    eventType: 'download',
    metadata: { ipAddress: req.ip, userAgent: req.headers['user-agent'] },
  });

  const url = await getDownloadUrl(version.pdfUrl);
  res.json({ downloadUrl: url });
}

module.exports = { recordEvent, getAnalytics, getViewers, getDownloads, downloadVersion };
