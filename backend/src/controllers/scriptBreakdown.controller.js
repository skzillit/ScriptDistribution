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
  const pages = await ScriptPage.find({ scriptVersion: req.params.versionId })
    .select('pageNumber sceneNumbers rawText')
    .sort({ pageNumber: 1 });

  const scenes = pages.map(p => ({
    _id: p._id,
    pageNumber: p.pageNumber,
    sceneNumbers: p.sceneNumbers,
    lineCount: (p.rawText || '').split('\n').length,
    preview: (p.rawText || '').split('\n').slice(0, 3).join(' ').substring(0, 100),
  }));
  res.json({ scenes });
}

module.exports = { getCategories, getBreakdownSheet, tagText, removeTag, getElements, bulkDecisions, aiAnalyze, getScenesList };
