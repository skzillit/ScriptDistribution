const ManualScene = require('../models/ManualScene');
const ScriptVersion = require('../models/ScriptVersion');

function authorize(req, version) {
  if (!version || !version.script) return false;
  // version.script is populated with .owner — caller is responsible for populating it.
  return String(version.script.owner) === String(req.user._id);
}

/** GET /versions/:versionId/manual-scenes */
async function listManualScenes(req, res) {
  const v = await ScriptVersion.findById(req.params.versionId).populate('script', 'owner');
  if (!v) return res.status(404).json({ error: 'Version not found' });
  if (!authorize(req, v)) return res.status(403).json({ error: 'Not authorized' });
  const scenes = await ManualScene.find({ scriptVersion: v._id }).sort({ pageStart: 1, sceneNumber: 1 });
  res.json({ versionId: String(v._id), manualScenes: scenes });
}

/** POST /versions/:versionId/manual-scenes { sceneNumber, heading, pageStart, pageEnd? } */
async function createManualScene(req, res) {
  const v = await ScriptVersion.findById(req.params.versionId).populate('script', 'owner');
  if (!v) return res.status(404).json({ error: 'Version not found' });
  if (!authorize(req, v)) return res.status(403).json({ error: 'Not authorized' });

  const { sceneNumber, heading, pageStart, pageEnd } = req.body;
  if (!sceneNumber || !String(sceneNumber).trim()) return res.status(400).json({ error: 'Scene number is required' });
  if (!heading || !String(heading).trim()) return res.status(400).json({ error: 'Heading is required' });
  const ps = Number(pageStart);
  if (!Number.isFinite(ps) || ps < 1) return res.status(400).json({ error: 'Start page must be a positive number' });
  const pe = pageEnd != null && pageEnd !== '' ? Number(pageEnd) : null;
  if (pe != null && (!Number.isFinite(pe) || pe < ps)) {
    return res.status(400).json({ error: 'End page must be ≥ start page' });
  }
  if (v.pageCount && ps > v.pageCount) {
    return res.status(400).json({ error: `Start page exceeds the script length (${v.pageCount} pages).` });
  }

  // Upsert by (scriptVersion, sceneNumber) — a second create for the same
  // scene number REPLACES the prior manual entry rather than duplicating.
  const sn = String(sceneNumber).trim();
  const existing = await ManualScene.findOne({ scriptVersion: v._id, sceneNumber: sn });
  if (existing) {
    existing.heading = String(heading).trim();
    existing.pageStart = ps;
    existing.pageEnd = pe || ps;
    await existing.save();
    return res.status(200).json({ manualScene: existing });
  }
  const created = await ManualScene.create({
    scriptVersion: v._id,
    sceneNumber: sn,
    heading: String(heading).trim(),
    pageStart: ps,
    pageEnd: pe || ps,
    createdBy: req.user._id,
  });
  res.status(201).json({ manualScene: created });
}

/** PUT /manual-scenes/:id */
async function updateManualScene(req, res) {
  const ms = await ManualScene.findById(req.params.id);
  if (!ms) return res.status(404).json({ error: 'Manual scene not found' });
  const v = await ScriptVersion.findById(ms.scriptVersion).populate('script', 'owner');
  if (!authorize(req, v)) return res.status(403).json({ error: 'Not authorized' });

  const { sceneNumber, heading, pageStart, pageEnd } = req.body;
  if (sceneNumber !== undefined) {
    const t = String(sceneNumber).trim();
    if (!t) return res.status(400).json({ error: 'Scene number is required' });
    ms.sceneNumber = t;
  }
  if (heading !== undefined) {
    const t = String(heading).trim();
    if (!t) return res.status(400).json({ error: 'Heading is required' });
    ms.heading = t;
  }
  if (pageStart !== undefined) {
    const n = Number(pageStart);
    if (!Number.isFinite(n) || n < 1) return res.status(400).json({ error: 'Start page must be a positive number' });
    ms.pageStart = n;
  }
  if (pageEnd !== undefined) {
    if (pageEnd === '' || pageEnd === null) {
      ms.pageEnd = ms.pageStart;
    } else {
      const n = Number(pageEnd);
      if (!Number.isFinite(n) || n < ms.pageStart) return res.status(400).json({ error: 'End page must be ≥ start page' });
      ms.pageEnd = n;
    }
  }
  await ms.save();
  res.json({ manualScene: ms });
}

/** DELETE /manual-scenes/:id */
async function deleteManualScene(req, res) {
  const ms = await ManualScene.findById(req.params.id);
  if (!ms) return res.status(404).json({ error: 'Manual scene not found' });
  const v = await ScriptVersion.findById(ms.scriptVersion).populate('script', 'owner');
  if (!authorize(req, v)) return res.status(403).json({ error: 'Not authorized' });
  await ms.deleteOne();
  res.json({ ok: true });
}

module.exports = { listManualScenes, createManualScene, updateManualScene, deleteManualScene };
