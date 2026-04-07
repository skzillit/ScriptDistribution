const Script = require('../models/Script');
const ScriptVersion = require('../models/ScriptVersion');
const ScriptPage = require('../models/ScriptPage');
const { uploadFile, getScriptPdfKey } = require('../services/storage.service');
const { extractPagesFromPdf } = require('../services/pdf.service');
const { parseScreenplayPage, extractSceneNumbers } = require('../utils/scriptParser');

async function listScripts(req, res) {
  const { page = 1, limit = 20, status } = req.query;
  const filter = { owner: req.user._id };
  if (status) filter.status = status;

  const scripts = await Script.find(filter)
    .populate('currentVersion', 'versionNumber versionLabel pageCount status')
    .sort({ updatedAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Script.countDocuments(filter);

  res.json({ scripts, total, page: Number(page), limit: Number(limit) });
}

async function createScript(req, res) {
  const { title, description, format, genre, tags } = req.body;

  // Only one active script allowed — move existing active scripts to archived (history)
  await Script.updateMany(
    { owner: req.user._id, status: { $ne: 'archived' } },
    { $set: { status: 'archived' } }
  );

  const script = await Script.create({
    title,
    description,
    format,
    genre,
    tags,
    owner: req.user._id,
    status: 'draft',
  });
  res.status(201).json({ script });
}

async function getActiveScript(req, res) {
  const script = await Script.findOne({ owner: req.user._id, status: { $ne: 'archived' } })
    .populate('owner', 'name email avatarUrl')
    .populate('currentVersion')
    .sort({ updatedAt: -1 });

  res.json({ script: script || null });
}

async function listHistory(req, res) {
  const { page = 1, limit = 20 } = req.query;
  const filter = { owner: req.user._id, status: 'archived' };

  const scripts = await Script.find(filter)
    .populate('currentVersion', 'versionNumber versionLabel pageCount status')
    .sort({ updatedAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Script.countDocuments(filter);
  res.json({ scripts, total, page: Number(page) });
}

async function restoreScript(req, res) {
  // Archive current active script first
  await Script.updateMany(
    { owner: req.user._id, status: { $ne: 'archived' } },
    { $set: { status: 'archived' } }
  );

  // Restore the requested one
  const script = await Script.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id },
    { $set: { status: 'draft' } },
    { new: true }
  ).populate('currentVersion');

  if (!script) return res.status(404).json({ error: 'Script not found' });
  res.json({ script });
}

async function getScript(req, res) {
  const script = await Script.findById(req.params.id)
    .populate('owner', 'name email avatarUrl')
    .populate('currentVersion')
    .populate('collaborators.user', 'name email avatarUrl');

  if (!script) return res.status(404).json({ error: 'Script not found' });
  res.json({ script });
}

async function updateScript(req, res) {
  const { title, description, status, format, genre, tags } = req.body;
  const script = await Script.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id },
    { $set: { title, description, status, format, genre, tags } },
    { new: true, runValidators: true }
  );
  if (!script) return res.status(404).json({ error: 'Script not found' });
  res.json({ script });
}

async function deleteScript(req, res) {
  const script = await Script.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
  if (!script) return res.status(404).json({ error: 'Script not found' });
  // Clean up versions and pages
  const versions = await ScriptVersion.find({ script: script._id });
  for (const v of versions) {
    await ScriptPage.deleteMany({ scriptVersion: v._id });
  }
  await ScriptVersion.deleteMany({ script: script._id });
  res.json({ success: true });
}

async function addCollaborator(req, res) {
  const { userId, role } = req.body;
  const script = await Script.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id },
    { $addToSet: { collaborators: { user: userId, role: role || 'viewer' } } },
    { new: true }
  );
  if (!script) return res.status(404).json({ error: 'Script not found' });
  res.json({ script });
}

async function uploadVersion(req, res) {
  if (!req.file) return res.status(400).json({ error: 'PDF file is required' });

  const script = await Script.findById(req.params.scriptId);
  if (!script) return res.status(404).json({ error: 'Script not found' });

  // Determine version number
  const lastVersion = await ScriptVersion.findOne({ script: script._id }).sort({ versionNumber: -1 });
  const versionNumber = lastVersion ? lastVersion.versionNumber + 1 : 1;

  // Create version record first
  const version = await ScriptVersion.create({
    script: script._id,
    versionNumber,
    versionLabel: req.body.versionLabel || `v${versionNumber}`,
    pdfUrl: '',
    uploadedBy: req.user._id,
    changeNotes: req.body.changeNotes,
    status: 'processing',
  });

  // Upload to S3
  const s3Key = getScriptPdfKey(script._id, version._id);
  await uploadFile(s3Key, req.file.buffer);
  version.pdfUrl = s3Key;

  // Extract pages
  try {
    const { pages, pageCount, fullText } = await extractPagesFromPdf(req.file.buffer);
    version.rawText = fullText;
    version.pageCount = pageCount;
    version.status = 'ready';
    await version.save();

    // Create page records (filter out empty pages)
    const pageDocs = pages
      .filter(p => p.rawText && p.rawText.trim().length > 0)
      .map(p => {
        const elements = parseScreenplayPage(p.rawText);
        const sceneNumbers = extractSceneNumbers(elements).map(s => s.sceneNumber);
        return {
          scriptVersion: version._id,
          pageNumber: p.pageNumber,
          rawText: p.rawText,
          elements,
          sceneNumbers,
        };
      });
    if (pageDocs.length > 0) {
      await ScriptPage.insertMany(pageDocs);
    }

    // Update script's current version
    script.currentVersion = version._id;
    await script.save();

    res.status(201).json({ version });
  } catch (error) {
    version.status = 'error';
    await version.save();
    res.status(500).json({ error: `PDF processing failed: ${error.message}` });
  }
}

async function listVersions(req, res) {
  const versions = await ScriptVersion.find({ script: req.params.scriptId })
    .populate('uploadedBy', 'name')
    .sort({ versionNumber: -1 });
  res.json({ versions });
}

async function getVersion(req, res) {
  const version = await ScriptVersion.findById(req.params.versionId)
    .populate('uploadedBy', 'name');
  if (!version) return res.status(404).json({ error: 'Version not found' });
  res.json({ version });
}

async function getPages(req, res) {
  const pages = await ScriptPage.find({ scriptVersion: req.params.versionId })
    .select('-htmlContent')
    .sort({ pageNumber: 1 });
  res.json({ pages });
}

async function getPage(req, res) {
  const page = await ScriptPage.findOne({
    scriptVersion: req.params.versionId,
    pageNumber: Number(req.params.pageNumber),
  });
  if (!page) return res.status(404).json({ error: 'Page not found' });
  res.json({ page });
}

module.exports = {
  listScripts, createScript, getScript, updateScript, deleteScript,
  addCollaborator, uploadVersion, listVersions, getVersion, getPages, getPage,
  getActiveScript, listHistory, restoreScript,
};
