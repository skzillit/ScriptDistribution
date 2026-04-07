const { BREAKDOWN_CATEGORIES } = require('../utils/constants');

function generateHighlightedHtml(rawText, pageElements) {
  if (!pageElements || pageElements.length === 0) {
    return escapeHtml(rawText).replace(/\n/g, '<br>');
  }

  // Sort by startOffset descending so inserting spans doesn't shift earlier offsets
  const sorted = [...pageElements]
    .filter(el => el.startOffset != null && el.endOffset != null)
    .sort((a, b) => b.startOffset - a.startOffset);

  let html = rawText;

  for (const el of sorted) {
    const before = html.slice(0, el.startOffset);
    const match = html.slice(el.startOffset, el.endOffset);
    const after = html.slice(el.endOffset);

    const span = `<span class="breakdown-highlight" `
      + `data-category="${el.category}" `
      + `data-name="${escapeAttr(el.name)}" `
      + `data-element-id="${el.elementId || ''}" `
      + `style="background-color: ${el.color}40; border-bottom: 2px solid ${el.color}; cursor: pointer;" `
      + `onclick="onHighlightClick(this)">`
      + `${escapeHtml(match)}</span>`;

    html = before + span + after;
  }

  // Escape remaining non-highlighted text parts and convert newlines
  // Since we've already inserted HTML spans, we only convert newlines
  html = html.replace(/\n/g, '<br>');

  return html;
}

function generateFullPageHtml(pages, breakdown, versionId) {
  const categoryColors = Object.entries(BREAKDOWN_CATEGORIES)
    .map(([key, val]) => `  --color-${key.toLowerCase()}: ${val.color};`)
    .join('\n');

  const categoryLegend = Object.entries(BREAKDOWN_CATEGORIES)
    .map(([key, val]) => `
      <label class="category-toggle">
        <input type="checkbox" checked data-category="${key}" onchange="toggleCategory('${key}', this.checked)">
        <span class="color-dot" style="background: ${val.color}"></span>
        ${val.label}
      </label>`)
    .join('');

  const pagesHtml = pages.map(page => `
    <div class="script-page" data-page="${page.pageNumber}" id="page-${page.pageNumber}">
      <div class="page-header">Page ${page.pageNumber}</div>
      <div class="page-content">${page.htmlContent || escapeHtml(page.rawText).replace(/\n/g, '<br>')}</div>
    </div>`).join('\n    <div class="page-break"></div>\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Script Breakdown</title>
  <link rel="stylesheet" href="/shared/highlight/highlight.css">
  <style>
:root {
${categoryColors}
}
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="category-filters">
      ${categoryLegend}
    </div>
  </div>
  <div class="script-container">
    ${pagesHtml}
  </div>
  <div class="element-tooltip" id="tooltip" style="display:none;">
    <div class="tooltip-category" id="tooltip-category"></div>
    <div class="tooltip-name" id="tooltip-name"></div>
  </div>
  <script src="/shared/highlight/highlight.js"></script>
</body>
</html>`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(text) {
  return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = { generateHighlightedHtml, generateFullPageHtml };
