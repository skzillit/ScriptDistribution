const ScenePage = require('../models/ScenePage');
const Script = require('../models/Script');
const { uploadFile, getDownloadUrl, deleteFile } = require('../services/storage.service');

function pageKey(scriptId, pageId) {
  return `scripts/${scriptId}/pages/${pageId}/page.pdf`;
}

/** Count pages in a PDF buffer (best-effort, non-fatal). */
async function countPdfPages(buffer) {
  try {
    const { PDFDocument } = require('pdf-lib');
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch (_) {
    return 0;
  }
}

// GET /scripts/:scriptId/pages
async function listScenePages(req, res) {
  const pages = await ScenePage.find({ script: req.params.scriptId })
    .sort({ createdAt: -1 })
    .lean();
  res.json({ scenePages: pages });
}

// POST /scripts/:scriptId/pages   (multipart: pdf + sceneNumber, color, description)
async function createScenePage(req, res) {
  const { scriptId } = req.params;
  const script = await Script.findById(scriptId);
  if (!script) return res.status(404).json({ error: 'Script not found' });

  const { sceneNumber, color, description } = req.body;
  if (!sceneNumber || !String(sceneNumber).trim()) {
    return res.status(400).json({ error: 'Scene number (title) is required.' });
  }
  if (!req.file) return res.status(400).json({ error: 'A PDF file is required.' });

  const page = await ScenePage.create({
    script: scriptId,
    sceneNumber: String(sceneNumber).trim(),
    color: color || '#9e9e9e',
    description: description || '',
    createdBy: req.user?._id,
  });

  const key = pageKey(scriptId, page._id);
  await uploadFile(key, req.file.buffer);
  page.pdfUrl = key;
  page.pageCount = await countPdfPages(req.file.buffer);
  await page.save();

  res.status(201).json({ scenePage: page });
}

// PUT /pages/:id   (metadata; optional replacement pdf)
async function updateScenePage(req, res) {
  const page = await ScenePage.findById(req.params.id);
  if (!page) return res.status(404).json({ error: 'Scene page not found' });

  const { sceneNumber, color, description } = req.body;
  if (sceneNumber !== undefined) page.sceneNumber = String(sceneNumber).trim();
  if (color !== undefined) page.color = color;
  if (description !== undefined) page.description = description;

  if (req.file) {
    const key = pageKey(page.script, page._id);
    await uploadFile(key, req.file.buffer);
    page.pdfUrl = key;
    page.pageCount = await countPdfPages(req.file.buffer);
  }

  await page.save();
  res.json({ scenePage: page });
}

// DELETE /pages/:id
async function deleteScenePage(req, res) {
  const page = await ScenePage.findById(req.params.id);
  if (!page) return res.status(404).json({ error: 'Scene page not found' });
  if (page.pdfUrl) {
    try { await deleteFile(page.pdfUrl); } catch (_) { /* non-fatal */ }
  }
  await page.deleteOne();
  res.json({ ok: true });
}

// GET /pages/:id/download  → signed URL to the folder PDF
async function downloadScenePage(req, res) {
  const page = await ScenePage.findById(req.params.id);
  if (!page || !page.pdfUrl) return res.status(404).json({ error: 'Scene page PDF not found' });
  const url = await getDownloadUrl(page.pdfUrl);
  res.json({ downloadUrl: url });
}

// GET /pages/:id/scenes  → scenes detected in the page's PDF (like script scenes)
async function listScenePageScenes(req, res) {
  const page = await ScenePage.findById(req.params.id);
  if (!page || !page.pdfUrl) return res.status(404).json({ error: 'Scene page PDF not found' });

  try {
    const { getFileBuffer } = require('../services/storage.service');
    const { buildPdfSceneMap } = require('../services/sides.service');
    const buffer = await getFileBuffer(page.pdfUrl);
    const map = await buildPdfSceneMap(buffer);

    // Dedupe by scene number (keep first occurrence), mirror getScriptScenes shape.
    const seen = new Set();
    const scenes = [];
    for (const s of map) {
      if (seen.has(s.sceneNumber)) continue;
      seen.add(s.sceneNumber);
      const heading = (s.heading || '').replace(/\s+\d+[A-Za-z]?\s*$/, '').trim();
      scenes.push({ sceneNumber: s.sceneNumber, heading: heading || `Scene ${s.sceneNumber}`, pageStart: s.pageNumber });
    }
    res.json({ pageId: String(page._id), totalScenes: scenes.length, scenes });
  } catch (err) {
    console.error('listScenePageScenes failed:', err.message);
    res.json({ pageId: String(req.params.id), totalScenes: 0, scenes: [] });
  }
}

module.exports = {
  listScenePages, createScenePage, updateScenePage, deleteScenePage, downloadScenePage, listScenePageScenes,
};
