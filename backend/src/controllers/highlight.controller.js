const ScriptPage = require('../models/ScriptPage');
const Breakdown = require('../models/Breakdown');
const { generateFullPageHtml } = require('../services/highlight.service');

async function getHighlightedScript(req, res) {
  const { versionId } = req.params;
  const { categories, page: pageNum } = req.query;

  const pages = await ScriptPage.find({ scriptVersion: versionId }).sort({ pageNumber: 1 });
  if (!pages.length) return res.status(404).json({ error: 'No pages found' });

  const breakdown = await Breakdown.findOne({ scriptVersion: versionId });

  let filteredPages = pages;
  if (pageNum) {
    filteredPages = pages.filter(p => p.pageNumber === Number(pageNum));
    if (!filteredPages.length) return res.status(404).json({ error: 'Page not found' });
  }

  const html = generateFullPageHtml(filteredPages, breakdown, versionId);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}

async function getHighlightedPage(req, res) {
  const { versionId, pageNumber } = req.params;

  const page = await ScriptPage.findOne({
    scriptVersion: versionId,
    pageNumber: Number(pageNumber),
  });
  if (!page) return res.status(404).json({ error: 'Page not found' });

  const breakdown = await Breakdown.findOne({ scriptVersion: versionId });
  const html = generateFullPageHtml([page], breakdown, versionId);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}

module.exports = { getHighlightedScript, getHighlightedPage };
