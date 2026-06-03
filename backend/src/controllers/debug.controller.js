const ScriptVersion = require('../models/ScriptVersion');
const Script = require('../models/Script');
const ScenePage = require('../models/ScenePage');
const { getFileBuffer, getScriptPdfKey } = require('../services/storage.service');
const { debugPdfSceneMap } = require('../services/sides.service');

/** GET /debug/versions/:versionId/scenes — scene-detection dump for a script version PDF. */
async function versionSceneDebug(req, res) {
  const v = await ScriptVersion.findById(req.params.versionId).populate('script', 'owner title');
  if (!v) return res.status(404).json({ error: 'Version not found' });
  if (!v.script || String(v.script.owner) !== String(req.user._id)) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  if (!v.pdfUrl) return res.status(404).json({ error: 'No PDF stored for this version' });
  try {
    const buf = await getFileBuffer(getScriptPdfKey(v.script._id, v._id));
    const dump = await debugPdfSceneMap(buf);
    res.json({ scriptTitle: v.script.title, versionLabel: v.versionLabel, ...dump });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

/** GET /debug/pages/:id/scenes — scene-detection dump for a page (scene folder) PDF. */
async function pageSceneDebug(req, res) {
  const p = await ScenePage.findById(req.params.id).populate('script', 'owner title');
  if (!p) return res.status(404).json({ error: 'Page not found' });
  if (!p.script || String(p.script.owner) !== String(req.user._id)) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  if (!p.pdfUrl) return res.status(404).json({ error: 'No PDF stored for this page' });
  try {
    const buf = await getFileBuffer(p.pdfUrl);
    const dump = await debugPdfSceneMap(buf);
    res.json({ scriptTitle: p.script.title, pageSceneNumber: p.sceneNumber, ...dump });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = { versionSceneDebug, pageSceneDebug };
