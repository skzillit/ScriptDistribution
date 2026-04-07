const Breakdown = require('../models/Breakdown');
const ScriptPage = require('../models/ScriptPage');
const { processBreakdown } = require('../services/breakdown.service');
const { BREAKDOWN_CATEGORIES } = require('../utils/constants');

async function triggerBreakdown(req, res) {
  const { versionId } = req.params;
  const provider = req.query.provider;
  const mode = req.query.mode || 'ai'; // 'ai' or 'manual'

  let breakdown = await Breakdown.findOne({ scriptVersion: versionId });

  // Manual mode: create empty breakdown ready for manual editing
  if (mode === 'manual') {
    if (breakdown && breakdown.status === 'complete') {
      return res.json({ breakdown, message: 'Breakdown already exists' });
    }
    if (!breakdown) {
      // Get page/scene info for summary
      const pages = await ScriptPage.find({ scriptVersion: versionId });
      const sceneCount = new Set(pages.flatMap(p => p.sceneNumbers || [])).size;

      breakdown = await Breakdown.create({
        scriptVersion: versionId,
        status: 'complete',
        elements: [],
        scenes: [],
        summary: {
          totalScenes: sceneCount,
          totalPages: pages.length,
          castCount: 0,
          locationCount: 0,
          estimatedShootDays: 0,
        },
        aiProvider: 'manual',
      });
    } else {
      breakdown.status = 'complete';
      breakdown.aiProvider = 'manual';
      breakdown.error = null;
      await breakdown.save();
    }
    return res.json({ breakdown, message: 'Manual breakdown ready' });
  }

  // AI mode
  if (breakdown && breakdown.status === 'complete') {
    return res.json({ breakdown, message: 'Breakdown already exists' });
  }
  if (breakdown && breakdown.status === 'processing') {
    return res.json({ breakdown, message: 'Breakdown is in progress' });
  }

  if (!breakdown) {
    breakdown = await Breakdown.create({ scriptVersion: versionId, status: 'pending' });
  } else {
    breakdown.status = 'pending';
    breakdown.error = null;
    await breakdown.save();
  }

  processBreakdown(breakdown._id, versionId, provider).catch(err => {
    console.error('Background breakdown error:', err);
  });

  res.status(202).json({ breakdown });
}

async function getBreakdown(req, res) {
  const breakdown = await Breakdown.findOne({ scriptVersion: req.params.versionId });
  if (!breakdown) return res.status(404).json({ error: 'No breakdown found' });
  res.json({ breakdown });
}

async function updateElement(req, res) {
  const { breakdownId, elementId } = req.params;
  const breakdown = await Breakdown.findById(breakdownId);
  if (!breakdown) return res.status(404).json({ error: 'Breakdown not found' });

  const element = breakdown.elements.id(elementId);
  if (!element) return res.status(404).json({ error: 'Element not found' });

  Object.assign(element, req.body);
  await breakdown.save();
  // Recalculate summary
  updateSummary(breakdown);
  await breakdown.save();
  res.json({ element });
}

async function addElement(req, res) {
  const breakdown = await Breakdown.findById(req.params.breakdownId);
  if (!breakdown) return res.status(404).json({ error: 'Breakdown not found' });

  // Assign color from category
  const cat = BREAKDOWN_CATEGORIES[req.body.category];
  if (cat && !req.body.color) req.body.color = cat.color;

  breakdown.elements.push(req.body);
  updateSummary(breakdown);
  await breakdown.save();
  const newElement = breakdown.elements[breakdown.elements.length - 1];
  res.status(201).json({ element: newElement });
}

async function deleteElement(req, res) {
  const { breakdownId, elementId } = req.params;
  const breakdown = await Breakdown.findById(breakdownId);
  if (!breakdown) return res.status(404).json({ error: 'Breakdown not found' });

  breakdown.elements.pull(elementId);
  updateSummary(breakdown);
  await breakdown.save();
  res.json({ success: true });
}

function updateSummary(breakdown) {
  const els = breakdown.elements || [];
  breakdown.summary = {
    ...breakdown.summary,
    castCount: els.filter(e => e.category === 'CAST_MEMBER').length,
    locationCount: els.filter(e => e.category === 'LOCATION').length,
  };
}

module.exports = { triggerBreakdown, getBreakdown, updateElement, addElement, deleteElement };
