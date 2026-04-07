const ScriptVersion = require('../models/ScriptVersion');
const ScriptPage = require('../models/ScriptPage');
const Breakdown = require('../models/Breakdown');
const { analyzeScript } = require('./ai.service');
const { chunkScript } = require('../utils/chunkStrategy');
const { generateHighlightedHtml } = require('./highlight.service');
const { BREAKDOWN_CATEGORIES } = require('../utils/constants');

async function processBreakdown(breakdownId, versionId, provider) {
  const breakdown = await Breakdown.findById(breakdownId);
  if (!breakdown) return;

  try {
    breakdown.status = 'processing';
    await breakdown.save();

    const pages = await ScriptPage.find({ scriptVersion: versionId }).sort({ pageNumber: 1 });
    if (!pages.length) throw new Error('No pages found for this version');

    const chunks = chunkScript(pages);
    let allElements = [];
    let allScenes = [];

    for (const chunk of chunks) {
      const { result, provider: usedProvider } = await analyzeScript(chunk.text, provider);
      breakdown.aiProvider = usedProvider;

      if (result.elements) allElements.push(...result.elements);
      if (result.scenes) allScenes.push(...result.scenes);
    }

    // Deduplicate elements
    const deduped = deduplicateElements(allElements);

    // Convert new format (scenes array) to occurrences, and find text offsets
    for (const element of deduped) {
      // Handle new format: element.scenes = ["1","2"] instead of element.occurrences
      if (element.scenes && !element.occurrences?.length) {
        const sceneList = Array.isArray(element.scenes) ? element.scenes : [];
        element.occurrences = [];
        for (const sceneNum of sceneList) {
          // Find the page that has this scene
          const page = pages.find(p => (p.sceneNumbers || []).includes(String(sceneNum)));
          if (page) {
            // Search for the element name in the page text
            const name = element.name;
            const idx = page.rawText.indexOf(name);
            if (idx >= 0) {
              element.occurrences.push({
                pageNumber: page.pageNumber,
                sceneNumber: String(sceneNum),
                startOffset: idx,
                endOffset: idx + name.length,
                contextSnippet: page.rawText.slice(Math.max(0, idx - 30), idx + name.length + 30),
              });
            } else {
              // Case-insensitive search
              const lowerIdx = page.rawText.toLowerCase().indexOf(name.toLowerCase());
              if (lowerIdx >= 0) {
                element.occurrences.push({
                  pageNumber: page.pageNumber,
                  sceneNumber: String(sceneNum),
                  startOffset: lowerIdx,
                  endOffset: lowerIdx + name.length,
                  contextSnippet: page.rawText.slice(Math.max(0, lowerIdx - 30), lowerIdx + name.length + 30),
                });
              } else {
                // Still record the occurrence without offset
                element.occurrences.push({
                  pageNumber: page.pageNumber,
                  sceneNumber: String(sceneNum),
                });
              }
            }
          }
        }
        delete element.scenes; // Remove the scenes shorthand
      }

      // Handle old format with textMatch occurrences
      if (element.occurrences) {
        for (const occ of element.occurrences) {
          if (occ.textMatch && occ.startOffset == null) {
            const page = pages.find(p => p.pageNumber === occ.pageNumber);
            if (page) {
              const idx = page.rawText.indexOf(occ.textMatch);
              if (idx >= 0) {
                occ.startOffset = idx;
                occ.endOffset = idx + occ.textMatch.length;
              }
            }
          }
        }
      }
    }

    // Assign colors
    for (const element of deduped) {
      const cat = BREAKDOWN_CATEGORIES[element.category];
      element.color = cat ? cat.color : '#CCCCCC';
    }

    breakdown.elements = deduped;
    breakdown.scenes = allScenes;
    breakdown.summary = {
      totalScenes: allScenes.length,
      totalPages: pages.length,
      castCount: deduped.filter(e => e.category === 'CAST_MEMBER').length,
      locationCount: deduped.filter(e => e.category === 'LOCATION').length,
      estimatedShootDays: Math.ceil(allScenes.length / 5),
    };
    breakdown.status = 'complete';
    breakdown.processedAt = new Date();
    await breakdown.save();

    // Generate highlighted HTML for each page
    for (const page of pages) {
      const pageElements = deduped.flatMap(el =>
        el.occurrences
          .filter(o => o.pageNumber === page.pageNumber)
          .map(o => ({ ...o, category: el.category, name: el.name, elementId: el._id, color: el.color }))
      );
      page.htmlContent = generateHighlightedHtml(page.rawText, pageElements);
      await page.save();
    }
  } catch (error) {
    breakdown.status = 'error';
    breakdown.error = error.message;
    await breakdown.save();
    console.error('Breakdown processing error:', error);
  }
}

function deduplicateElements(elements) {
  const map = new Map();
  for (const el of elements) {
    const key = `${el.category}::${el.name.trim().toUpperCase()}`;
    if (map.has(key)) {
      const existing = map.get(key);
      existing.occurrences.push(...(el.occurrences || []));
      if (el.description && !existing.description) existing.description = el.description;
    } else {
      map.set(key, { ...el, occurrences: [...(el.occurrences || [])] });
    }
  }
  return Array.from(map.values());
}

module.exports = { processBreakdown };
