const svc = require('../services/scriptBreakdown.service');

async function getCategories(req, res) {
  const cats = await svc.seedDefaultCategories(req.params.scriptId);
  res.json({ categories: cats });
}

async function getBreakdownSheet(req, res) {
  const sheet = await svc.getBreakdownSheet(req.params.scriptId, req.params.sceneId);
  res.json(sheet);
}

async function tagText(req, res) {
  const result = await svc.tagTextSelection(req.params.scriptId, req.params.sceneId, req.body);
  res.status(201).json(result);
}

async function removeTag(req, res) {
  await svc.removeTag(req.params.tagId);
  res.json({ success: true });
}

async function getElements(req, res) {
  const elements = await svc.getProjectElements(req.params.scriptId, req.query);
  res.json({ elements });
}

async function bulkDecisions(req, res) {
  const result = await svc.bulkAcceptRejectSuggestions(req.params.scriptId, req.params.sceneId, req.body.decisions || []);
  res.json(result);
}

async function aiAnalyze(req, res) {
  const result = await svc.aiAnalyzeScene(req.params.scriptId, req.params.sceneId);
  res.json(result);
}

async function getScenesList(req, res) {
  const ScriptPage = require('../models/ScriptPage');
  const BreakdownTag = require('../models/BreakdownTag');
  const BreakdownElement = require('../models/BreakdownElement');

  const pages = await ScriptPage.find({ scriptVersion: req.params.versionId })
    .select('pageNumber sceneNumbers rawText location locationAddress cast_ids synopsis int_ext day_night set_name')
    .populate('cast_ids', 'name')
    .sort({ pageNumber: 1 });

  const pageIds = pages.map(p => p._id);

  // Aggregate tag counts per scene
  const tagCounts = await BreakdownTag.aggregate([
    { $match: { scene_id: { $in: pageIds }, status: { $ne: 'rejected' } } },
    { $group: { _id: '$scene_id', count: { $sum: 1 } } },
  ]);
  const tagCountMap = {};
  for (const t of tagCounts) tagCountMap[t._id.toString()] = t.count;

  // Aggregate cast counts from tags too (for scenes that have cast tags but no cast_ids yet)
  const castTagsPerScene = await BreakdownTag.aggregate([
    { $match: { scene_id: { $in: pageIds }, status: { $ne: 'rejected' } } },
    { $lookup: { from: 'breakdownelements', localField: 'element_id', foreignField: '_id', as: 'element' } },
    { $unwind: '$element' },
    { $match: { 'element.category_slug': 'cast' } },
    { $group: { _id: { scene: '$scene_id', element: '$element_id' }, name: { $first: '$element.name' } } },
    { $group: { _id: '$_id.scene', names: { $push: '$name' }, count: { $sum: 1 } } },
  ]);
  const castMap = {};
  for (const c of castTagsPerScene) castMap[c._id.toString()] = { names: c.names, count: c.count };

  const scenes = pages.map(p => {
    // Parse heading if not already parsed
    let int_ext = p.int_ext;
    let set_name = p.set_name;
    let day_night = p.day_night;
    if (!int_ext || !set_name) {
      // Find the first line that looks like a scene heading (contains INT./EXT.)
      const lines = (p.rawText || '').split('\n').map(l => l.trim()).filter(Boolean);
      const headingLine = lines.find(l => /(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(l)) || lines[0];
      if (headingLine) {
        const parsed = svc.parseSceneHeading(headingLine);
        int_ext = int_ext || parsed.int_ext;
        set_name = set_name || parsed.set_name;
        day_night = day_night || parsed.day_night;
      }
    }

    const castInfo = castMap[p._id.toString()] || { names: [], count: 0 };
    // Merge cast_ids populated names with cast from tags
    const castIdNames = (p.cast_ids || []).map(c => c?.name).filter(Boolean);
    const allCastNames = Array.from(new Set([...castIdNames, ...castInfo.names]));

    return {
      _id: p._id,
      pageNumber: p.pageNumber,
      sceneNumbers: p.sceneNumbers,
      lineCount: (p.rawText || '').split('\n').length,
      preview: (p.rawText || '').split('\n').slice(0, 3).join(' ').substring(0, 100),
      location: p.location || '',
      locationAddress: p.locationAddress || '',
      synopsis: p.synopsis || '',
      int_ext,
      set_name,
      day_night,
      cast_names: allCastNames,
      cast_count: allCastNames.length,
      tag_count: tagCountMap[p._id.toString()] || 0,
    };
  });

  res.json({ scenes });
}

async function updateSceneHandler(req, res) {
  const scene = await svc.updateScene(req.params.sceneId, req.body);
  res.json({ scene });
}

async function getCastHandler(req, res) {
  const cast = await svc.getProjectCast(req.params.scriptId);
  res.json({ cast });
}

module.exports = {
  getCategories, getBreakdownSheet, tagText, removeTag, getElements,
  bulkDecisions, aiAnalyze, getScenesList,
  updateScene: updateSceneHandler, getCast: getCastHandler,
};
