const PDFDocument = require('pdfkit');
const ScriptPage = require('../models/ScriptPage');
const Sides = require('../models/Sides');
const { uploadFile, getFileBuffer, getScriptPdfKey } = require('./storage.service');
const realtime = require('../realtime');

function emitSidesUpdated(sides) {
  if (!sides) return;
  realtime.broadcast('sides:updated', {
    id: String(sides._id),
    script: sides.script ? String(sides.script) : null,
    callSheet: sides.callSheet ? String(sides.callSheet) : null,
    status: sides.status,
    title: sides.title || null,
    error: sides.error || null,
    updatedAt: new Date().toISOString(),
  });
}

// pdfjs needs the standard-font data to RENDER standard-14 fonts (e.g. Courier)
// to a canvas. Without it, PDFs that reference non-embedded standard fonts —
// like our FDX→PDF output — render completely blank (text extraction still
// works, which is why scene detection passes but the cropped images are empty).
// Resolve the standard_fonts directory shipped with pdfjs-dist.
const STANDARD_FONT_DATA_URL = (() => {
  const path = require('path');
  return path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;
})();

// pdfjs v4 legacy build requires a worker script path even in Node.
// Point it at the worker module shipped with the package.
let _pdfjsModule = null;
async function loadPdfjs() {
  if (_pdfjsModule) return _pdfjsModule;
  _pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (_pdfjsModule.GlobalWorkerOptions) {
    // Resolve the worker path via Node's require.resolve so it works on any install location
    const path = require('path');
    const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    _pdfjsModule.GlobalWorkerOptions.workerSrc = workerPath;
  }
  return _pdfjsModule;
}

function bufferToUint8(pdfBuffer) {
  return new Uint8Array(pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength));
}

/**
 * Build a reliable scene map from the actual PDF using pdfjs.
 * Returns array of scene headings sorted in script order (top→bottom, page by page):
 *   [{ sceneNumber, heading, pageNumber, pdfY, fontHeightPdf }]
 *
 * Uses PDF-space coordinates (bottom-up Y) so callers can compute canvas Y
 * at any scale via: canvasY = viewport.height - pdfY * scale
 */
async function buildPdfSceneMap(pdfBuffer) {
  const pdfjs = await loadPdfjs();
  const data = bufferToUint8(pdfBuffer);
  const pdf = await pdfjs.getDocument({
    data, disableFontFace: true, useSystemFonts: false, isEvalSupported: false, standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;

  // Standard slugs (INT./EXT./I/E) OR bare "SCENE 33" style headings.
  const HEADING_RE = /\b(?:INT\.?|EXT\.?|INT\/EXT\.?|I\/E\.?)\s+|\bSCENE\b/i;
  const SCENE_NUM_RE = /^(\d+[A-Za-z]{0,3})\.?$/;   // pure scene-number token
  const scenes = [];
  const totalPages = pdf.numPages;

  for (let p = 1; p <= totalPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();

    // Group items into lines by PDF-space Y (bottom-up). Keep whitespace items
    // and raw strings — some PDFs emit text glyph-by-glyph (e.g. "I","N","T")
    // with separate space glyphs, so the line text must be rebuilt positionally.
    const linesMap = [];
    for (const it of tc.items) {
      if (!it.str) continue;
      const pdfY = it.transform ? it.transform[5] : 0;
      const pdfX = it.transform ? it.transform[4] : 0;
      const h = it.height || 12;
      const w = it.width || 0;
      let line = linesMap.find(l => Math.abs(l.pdfY - pdfY) < 4);
      if (!line) {
        line = { pdfY, items: [], maxHeight: h, text: '' };
        linesMap.push(line);
      }
      line.items.push({ str: it.str, pdfX, pdfW: w });
      if (h > line.maxHeight) line.maxHeight = h;
    }
    for (const l of linesMap) {
      l.items.sort((a, b) => a.pdfX - b.pdfX);
      // Rebuild line text: concatenate glyphs/words, inserting a space for
      // explicit space glyphs OR a positional gap wider than ~¼ of the font size.
      const spaceThresh = (l.maxHeight || 12) * 0.25;
      let text = '';
      let prevEnd = null;
      for (const it of l.items) {
        if (/^\s+$/.test(it.str)) {
          if (text && !text.endsWith(' ')) text += ' ';
          prevEnd = it.pdfX + (it.pdfW || 0);
          continue;
        }
        if (prevEnd !== null) {
          const gap = it.pdfX - prevEnd;
          if (gap > spaceThresh && text && !text.endsWith(' ')) text += ' ';
        }
        text += it.str;
        prevEnd = it.pdfX + (it.pdfW || 0);
      }
      l.text = text.replace(/\s+/g, ' ').trim();
      // Trimmed token list for margin scene-number detection.
      l.items = l.items.map(i => ({ ...i, str: i.str.trim() })).filter(i => i.str);
    }
    linesMap.sort((a, b) => b.pdfY - a.pdfY); // top→bottom

    // Page width for margin detection (PDF units)
    const pageW = viewport.width || 612;
    const LEFT_MARGIN = pageW * 0.15;   // left 15% = left margin zone
    const RIGHT_MARGIN = pageW * 0.70;  // beyond 70% = right margin zone

    for (const line of linesMap) {
      const upper = line.text.toUpperCase();

      // Compute margin scene-number tokens first — they're both a strong
      // signal that this line IS a heading (used as a fallback admission rule)
      // AND the most authoritative source for the scene number itself.
      const leftMarginItem = line.items.find(it => it.pdfX < LEFT_MARGIN && SCENE_NUM_RE.test(it.str));
      const rightMarginItem = line.items.find(it => it.pdfX > RIGHT_MARGIN && SCENE_NUM_RE.test(it.str));
      const leftMatch = leftMarginItem && leftMarginItem.str.match(SCENE_NUM_RE);
      const rightMatch = rightMarginItem && rightMarginItem.str.match(SCENE_NUM_RE);
      const marginPair = leftMatch && rightMatch
        && leftMatch[1].toUpperCase() === rightMatch[1].toUpperCase();

      // Admit a line as a heading if it matches a slug (INT./EXT./I/E./SCENE)
      // OR it carries the same scene number in BOTH left and right margins —
      // a convention used by stylized headings like:
      //   2A   INTERCUT: TV INSERT.            2A
      //   4    "TEN YEARS AGO"                  4
      //   7    - UNIVERSITY LECTURE HALL...     7
      // Plain body text never has matching digit tokens at both margins.
      if (!HEADING_RE.test(upper) && !marginPair) continue;

      let num = null;

      // 1) Left-margin number
      if (leftMatch) num = leftMatch[1];
      // 2) Right-margin number
      if (!num && rightMatch) num = rightMatch[1];

      // Fallback: text-level leading (only if leading is BEFORE any INT./EXT. and is followed
      // by whitespace, meaning it's clearly a scene number not part of the heading text)
      if (!num) {
        const leadingMatch = line.text.match(/^(\d+[A-Za-z]{0,3})\s+(?:INT|EXT|INT\/EXT|I\/E|SCENE)/i);
        if (leadingMatch) num = leadingMatch[1];
      }

      // Fallback: trailing digit-only item at end of line (any X position), but require
      // it to be separated by whitespace from the heading text (not concatenated)
      if (!num) {
        const lastItem = line.items[line.items.length - 1];
        if (lastItem && SCENE_NUM_RE.test(lastItem.str)) {
          const m = lastItem.str.match(SCENE_NUM_RE);
          if (m) num = m[1];
        }
      }

      // Strip PT (part) suffix — "107PT" → "107"
      if (num) num = num.toUpperCase().replace(/PT$/, '') || null;

      // Keep every detected INT/EXT heading (numbered or not). Numbering is
      // resolved after all pages are scanned (see below).
      scenes.push({
        sceneNumber: num,
        heading: line.text,
        pageNumber: p,
        pdfY: line.pdfY,
        fontHeightPdf: line.maxHeight,
      });
    }

    page.cleanup();
  }

  await pdf.cleanup();
  await pdf.destroy();

  // If the script carries real scene numbers, keep only the numbered headings
  // (unnumbered lines are continuations). If NOTHING is numbered — e.g. a spec
  // or draft script with bare INT./EXT. slugs — auto-number the detected
  // headings sequentially so sides can still be generated from them.
  const numbered = scenes.filter(s => s.sceneNumber);
  if (numbered.length > 0) return numbered;
  return scenes.map((s, i) => ({ ...s, sceneNumber: String(i + 1) }));
}

/**
 * Render scenes from the original script PDF as cropped page images.
 * Returns: [{ sceneNumber, images: [Buffer<PNG>, ...] }]
 *
 * Smart-crops each page to the vertical region containing the scene:
 *   - First page of scene: from the heading line down to bottom (or next heading)
 *   - Middle pages: full page
 *   - Last page: from top down to next scene heading (if any)
 */
async function renderSceneImages(pdfBuffer, renderSpecs, options = {}) {
  const pdfjs = await loadPdfjs();
  const { createCanvas } = require('@napi-rs/canvas');
  const SCALE = 2;
  const PADDING_TOP = 18;
  const PADDING_BOTTOM = 6;
  const PADDING_FOOTER = 10;

  const data = bufferToUint8(pdfBuffer);
  const pdf = await pdfjs.getDocument({
    data, disableFontFace: true, useSystemFonts: false, isEvalSupported: false, standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;
  const totalPages = pdf.numPages;

  // Detect the page's content area (exclude page headers, page numbers, and page footers).
  // Uses POSITION-based detection: every text line in the top ~10% or bottom ~8% of the page
  // is treated as header/footer regardless of its content. This handles mixed-format headers
  // like "SHOW DOGS DIRECTOR'S CUT SCRIPT 07.09.2017                  2." that don't match
  // simple regex patterns.
  // Returns { contentTop, contentBottom } in canvas pixels (scaled).
  async function detectPageContentBounds(page, viewport, tc) {
    const TOP_ZONE_RATIO = options.topZoneRatio ?? 0.03;    // default 3% for script
    const BOTTOM_ZONE_RATIO = options.bottomZoneRatio ?? 0.04; // default 4%

    // Group items into lines by PDF-space Y
    const lines = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const pdfY = it.transform ? it.transform[5] : 0;
      const pdfX = it.transform ? it.transform[4] : 0;
      const h = it.height || 12;
      let line = lines.find(l => Math.abs(l.pdfY - pdfY) < 4);
      if (!line) {
        line = { pdfY, items: [], text: '', maxHeight: h };
        lines.push(line);
      }
      line.items.push({ str: it.str, pdfX });
      if (h > line.maxHeight) line.maxHeight = h;
    }
    for (const l of lines) {
      l.items.sort((a, b) => a.pdfX - b.pdfX);
      l.text = l.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
    }
    // Sort top→bottom (PDF Y bottom-up, so higher pdfY = higher on page)
    lines.sort((a, b) => b.pdfY - a.pdfY);

    const topZoneBoundary = viewport.height * TOP_ZONE_RATIO;       // canvas Y
    const EXTENDED_TOP_ZONE = viewport.height * 0.08;               // extended zone for pattern-based detection
    const bottomZoneBoundary = viewport.height * (1 - BOTTOM_ZONE_RATIO);

    // Detect running headers / page numbers and push contentTop below them.
    // Two passes:
    //   1. Within the small top zone (3%), skip ALL lines unconditionally (like before)
    //   2. Within the extended zone (8%), skip ONLY lines matching header patterns:
    //      - Page numbers: "4.", "19.", standalone digits
    //      - Running headers: title + date + page number (e.g., "SHOW DOGS GREEN SHOOTING SCRIPT 23.01.2017 4.")
    //      - Continuation markers: "CONTINUED:", "5 CONTINUED: 5"
    //      - "Printed on..." footer-style text at top (rare)
    const HEADER_PATTERN = /\d+\.\s*$|^CONTINUED|^\d+\s+CONTINUED|\bPrinted on\b|\b\d{2}\.\d{2}\.\d{4}\b|\b\d{2}\/\d{2}\/\d{4}\b/i;

    let contentTop = 0;
    for (const line of lines) {
      const baselineY = viewport.height - line.pdfY * SCALE;
      if (baselineY > EXTENDED_TOP_ZONE) break; // beyond extended zone, stop

      const lineBottom = baselineY + 4;

      if (baselineY <= topZoneBoundary) {
        // Small zone: skip everything unconditionally
        if (lineBottom > contentTop) contentTop = lineBottom;
      } else if (HEADER_PATTERN.test(line.text)) {
        // Extended zone: skip only lines that look like headers/page numbers
        if (lineBottom > contentTop) contentTop = lineBottom;
      }
      // Else: in extended zone but NOT a header → this is real content, don't push contentTop
    }

    // Push contentBottom ABOVE every text line in the bottom zone
    let contentBottom = viewport.height;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const baselineY = viewport.height - line.pdfY * SCALE;
      if (baselineY < bottomZoneBoundary) break; // out of bottom zone
      const lineTop = baselineY - line.maxHeight * SCALE - 4;
      if (lineTop < contentBottom) contentBottom = lineTop;
    }

    return {
      contentTop: Math.max(0, contentTop),
      contentBottom: Math.min(viewport.height, contentBottom),
    };
  }

  const result = [];
  for (const spec of renderSpecs) {
    const images = [];
    const pStart = Math.max(1, Math.min(spec.startPage || 1, totalPages));
    const pEnd = Math.max(pStart, Math.min(spec.endPage || pStart, totalPages));

    for (let p = pStart; p <= pEnd; p++) {
      try {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: SCALE });
        const tc = await page.getTextContent();

        // Render to canvas
        const canvas = createCanvas(viewport.width, viewport.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, viewport.width, viewport.height);
        await page.render({ canvasContext: ctx, viewport, background: 'white' }).promise;

        // Detect content bounds (skip page headers / numbers / footers)
        const { contentTop, contentBottom } = await detectPageContentBounds(page, viewport, tc);

        // Compute crop region from the pre-computed PDF-space coordinates
        let yTop = contentTop;
        let yBottom = contentBottom;

        // On the first page, crop from just above the scene's heading.
        // The scene heading itself IS content, so we use its Y directly (ignore contentTop).
        if (p === pStart && spec.startPdfY != null) {
          const baselineY = viewport.height - spec.startPdfY * SCALE;
          const topY = baselineY - (spec.startFontHeightPdf || 12) * SCALE;
          yTop = Math.max(0, topY - PADDING_TOP);
        }

        // On the LAST page, crop to just above the next scene's heading (if provided)
        let skipThisPage = false;
        if (p === pEnd && spec.endPdfY != null && spec.endPage === p) {
          const nextBaselineY = viewport.height - spec.endPdfY * SCALE;
          const nextTopY = nextBaselineY - (spec.endFontHeightPdf || 12) * SCALE;
          const candidateBottom = Math.max(0, Math.min(contentBottom, nextTopY - PADDING_BOTTOM));

          if (candidateBottom <= yTop + 30) {
            // The next scene starts at/near the TOP of this page → our scene has
            // essentially NO content here. Skip rendering this page entirely
            // (unless it's also pStart — i.e. a single-page scene, where we use
            // whatever we have).
            if (p !== pStart) {
              skipThisPage = true;
            } else {
              // Single-page scene too tight — keep minimum 60px crop starting from heading
              yBottom = Math.max(candidateBottom, yTop + 60);
            }
          } else {
            yBottom = candidateBottom;
          }
        }

        if (skipThisPage) {
          page.cleanup();
          continue;
        }

        // Never include the footer area
        yBottom = Math.min(yBottom, contentBottom);

        // Clamp + ensure minimum height
        yTop = Math.max(0, Math.floor(yTop));
        yBottom = Math.min(viewport.height, Math.ceil(yBottom));
        const cropH = Math.max(60, yBottom - yTop);

        // Crop
        const cropCanvas = createCanvas(viewport.width, cropH);
        const cropCtx = cropCanvas.getContext('2d');
        cropCtx.fillStyle = '#ffffff';
        cropCtx.fillRect(0, 0, viewport.width, cropH);
        cropCtx.drawImage(canvas, 0, yTop, viewport.width, cropH, 0, 0, viewport.width, cropH);

        images.push(cropCanvas.toBuffer('image/png'));
        page.cleanup();
      } catch (err) {
        console.error(`renderSceneImages: failed to render scene ${spec.sceneNumber} page ${p}:`, err.message);
      }
    }
    result.push({ sceneNumber: spec.sceneNumber, images });
  }

  await pdf.cleanup();
  await pdf.destroy();
  return result;
}

/**
 * Render "cross out" sides. Visual spec (matches the client's sample):
 *   - Render the FULL page (page number + margins kept), not a per-scene crop.
 *   - Every UNSELECTED scene gets a light-grey shaded background.
 *   - Each contiguous run of unselected scenes gets ONE big "X" drawn
 *     corner-to-corner across the run.
 *   - Selected scenes stay clean/white and fully readable.
 *
 * Pages rendered = every page touched by a selected scene (heading page → the
 * page where the next scene begins); full pages in between are kept for
 * continuity. Returns a SINGLE combined entry { sceneNumber, images } so the
 * generateSidesPdf image path renders the pages in document order.
 */
async function renderCrossoutImages(pdfBuffer, pdfSceneMap, requestedSceneNumbers, totalPages, options = {}) {
  const pdfjs = await loadPdfjs();
  const { createCanvas } = require('@napi-rs/canvas');
  const SCALE = 2;
  const norm = (s) => String(s).toUpperCase().replace(/PT$/, '');
  const requested = new Set(Array.from(requestedSceneNumbers).map(norm));
  // Scenes that stay clean (not greyed/X'd). Defaults to `requested` for the
  // common case where the page-keep filter and "don't cross out" set are the
  // same. When rearrange-in-crossout is active, the caller passes the FULL
  // user selection here so that other selected scenes aren't crossed out
  // when we're focused on rendering one specific scene's chunk.
  const cleanSet = options.allSelectedScenes
    ? new Set(Array.from(options.allSelectedScenes).map(norm))
    : requested;

  // Build full scene "blocks" (every scene, selected or not). Each block spans
  // from its heading down to the next different scene's heading.
  const blocks = [];
  for (let i = 0; i < pdfSceneMap.length; i++) {
    const s = pdfSceneMap[i];
    if (!s.sceneNumber || s.sceneNumber === '__DAYBREAK__') continue;
    let next = null;
    for (let j = i + 1; j < pdfSceneMap.length; j++) {
      if (pdfSceneMap[j].sceneNumber !== s.sceneNumber) { next = pdfSceneMap[j]; break; }
    }
    blocks.push({
      sceneNumber: s.sceneNumber,
      selected: requested.has(s.sceneNumber),     // drives the page-keep test
      clean: cleanSet.has(s.sceneNumber),          // drives the grey/X test
      startPage: s.pageNumber,
      startPdfY: s.pdfY,
      startFontHeightPdf: s.fontHeightPdf || 12,
      endPage: next ? next.pageNumber : totalPages,
      endPdfY: next ? next.pdfY : null,
      // Height of the NEXT scene's heading — needed so the grey/X stops just
      // above that heading instead of swallowing it.
      endFontHeightPdf: next ? (next.fontHeightPdf || 12) : 0,
    });
  }

  const selectedBlocks = blocks.filter(b => b.selected);
  if (!selectedBlocks.length) return [];

  const startPage = Math.max(1, Math.min(...selectedBlocks.map(b => b.startPage)));
  const endPage = Math.min(totalPages, Math.max(...selectedBlocks.map(b => b.endPage)));

  const data = bufferToUint8(pdfBuffer);
  const pdf = await pdfjs.getDocument({
    data, disableFontFace: true, useSystemFonts: false, isEvalSupported: false, standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;

  const skipPages = options.skipPages instanceof Set ? options.skipPages : null;
  const images = [];
  const pageNumbers = [];
  for (let p = startPage; p <= endPage; p++) {
    if (skipPages && skipPages.has(p)) continue;
    try {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: SCALE });
      const W = viewport.width;
      const H = viewport.height;

      // Only keep a page that actually contains a SELECTED scene's content.
      // (A page holding only unselected scenes — e.g. a gap between two far-apart
      // picked scenes — is dropped entirely rather than shown fully crossed out.)
      const MIN_SELECTED_PX = 24; // ~12pt of real content
      let selectedHeightOnPage = 0;
      for (const b of selectedBlocks) {
        if (p < b.startPage || p > b.endPage) continue;
        // Measure the selected block's full vertical extent on this page —
        // from its heading down to the next scene's heading baseline.
        let top = (p === b.startPage) ? (H - b.startPdfY * SCALE - b.startFontHeightPdf * SCALE) : 0;
        let bottom = (p === b.endPage && b.endPdfY != null) ? (H - b.endPdfY * SCALE) : H;
        top = Math.max(0, top);
        bottom = Math.min(H, bottom);
        if (bottom > top) selectedHeightOnPage += (bottom - top);
      }
      if (selectedHeightOnPage < MIN_SELECTED_PX) { page.cleanup(); continue; }

      // Render the full page.
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      await page.render({ canvasContext: ctx, viewport, background: 'white' }).promise;

      // Vertical spans (canvas px) of unselected scenes on THIS page.
      // The bottom of an unselected block is pushed WELL ABOVE the next
      // (selected) scene's heading so the diagonal X and grey shading never
      // touch the heading text.
      const HEADING_CLEAR = 22; // canvas px of clearance above the next heading's TOP
      const segs = [];
      for (const b of blocks) {
        if (b.clean) continue;                   // user-selected scenes stay clean
        if (p < b.startPage || p > b.endPage) continue;
        // Top: at the heading (this page) or the page top (continuation from a prior page).
        let top = (p === b.startPage)
          ? (H - b.startPdfY * SCALE - b.startFontHeightPdf * SCALE)
          : 0;
        // Bottom: stop a generous gap ABOVE the next heading's top so the X tips
        // and grey rectangle don't reach the kept scene's heading.
        let bottom = (p === b.endPage && b.endPdfY != null)
          ? (H - b.endPdfY * SCALE - (b.endFontHeightPdf || 12) * SCALE - HEADING_CLEAR)
          : H;
        top = Math.max(0, top - 4);
        bottom = Math.min(H, bottom);
        if (bottom - top > 4) segs.push({ top, bottom });
      }

      // Merge adjacent/overlapping spans into contiguous crossed-out runs.
      segs.sort((a, b) => a.top - b.top);
      const runs = [];
      for (const s of segs) {
        const lastRun = runs[runs.length - 1];
        if (lastRun && s.top <= lastRun.bottom + 6) lastRun.bottom = Math.max(lastRun.bottom, s.bottom);
        else runs.push({ top: s.top, bottom: s.bottom });
      }

      // Grey shading + one big X per run.
      for (const r of runs) {
        ctx.save();
        ctx.fillStyle = 'rgba(178,178,178,0.45)';
        ctx.fillRect(0, r.top, W, r.bottom - r.top);
        ctx.strokeStyle = 'rgba(0,0,0,0.88)';
        ctx.lineWidth = 1.6 * SCALE;
        ctx.beginPath();
        ctx.moveTo(0, r.top); ctx.lineTo(W, r.bottom);
        ctx.moveTo(W, r.top); ctx.lineTo(0, r.bottom);
        ctx.stroke();
        ctx.restore();
      }

      images.push(canvas.toBuffer('image/png'));
      pageNumbers.push(p);
      page.cleanup();
    } catch (err) {
      console.error(`renderCrossoutImages: failed page ${p}:`, err.message);
    }
  }

  await pdf.cleanup();
  await pdf.destroy();
  return [{ sceneNumber: selectedBlocks[0].sceneNumber, images, pageNumbers }];
}

/**
 * Build render specs from the PDF scene map, filtered by requested scene numbers.
 * Each spec describes EXACTLY what to render for one requested scene:
 *   - startPage, startPdfY, startFontHeightPdf — where the scene begins
 *   - endPage, endPdfY, endFontHeightPdf — where to stop (the next scene's heading, or end of PDF)
 * Deduplicates: keeps only the FIRST occurrence of each scene number in the PDF.
 */
function buildRenderSpecs(pdfSceneMap, requestedSceneNumbers, totalPages, orderedSceneNumbers = null) {
  const specs = [];
  const seen = new Set();
  const norm = (s) => String(s).toUpperCase().replace(/PT$/, '');
  const requested = new Set(Array.from(requestedSceneNumbers).map(norm));

  for (let i = 0; i < pdfSceneMap.length; i++) {
    const s = pdfSceneMap[i];
    if (!requested.has(s.sceneNumber)) continue;
    if (seen.has(s.sceneNumber)) continue;
    seen.add(s.sceneNumber);

    // Find the NEXT scene in the map with a different scene number (end boundary).
    // Skip continuation headings (same scene number) when looking for the end.
    let next = null;
    for (let j = i + 1; j < pdfSceneMap.length; j++) {
      if (pdfSceneMap[j].sceneNumber !== s.sceneNumber) {
        next = pdfSceneMap[j];
        break;
      }
    }

    specs.push({
      sceneNumber: s.sceneNumber,
      heading: s.heading,
      startPage: s.pageNumber,
      startPdfY: s.pdfY,
      startFontHeightPdf: s.fontHeightPdf,
      endPage: next ? next.pageNumber : totalPages,
      endPdfY: next ? next.pdfY : null,
      endFontHeightPdf: next ? next.fontHeightPdf : null,
    });
  }

  // Optional: emit specs in the caller's requested order (e.g. a user-defined
  // scene sequence) instead of the default top→bottom script order.
  if (Array.isArray(orderedSceneNumbers) && orderedSceneNumbers.length) {
    const orderIdx = new Map();
    orderedSceneNumbers.forEach((sn, i) => {
      const k = norm(sn);
      if (!orderIdx.has(k)) orderIdx.set(k, i);
    });
    const rank = (sn) => (orderIdx.has(sn) ? orderIdx.get(sn) : Number.MAX_SAFE_INTEGER);
    specs.sort((a, b) => rank(a.sceneNumber) - rank(b.sceneNumber));
  }

  return specs;
}

/**
 * Build a scene map from a Movie Magic Scheduling PDF using pdfjs.
 * Returns scenes in script order: [{ sceneNumber, pageNumber, pdfY, fontHeightPdf, heading }].
 *
 * Movie Magic format:
 *   Line 1: scene number alone (e.g. "108", "107PT")
 *   Line 2: "<D/N><count><INT|EXT><location><Day|Night><pages>Scene #"
 */
async function buildSchedulePdfSceneMap(pdfBuffer) {
  const pdfjs = await loadPdfjs();
  const data = bufferToUint8(pdfBuffer);
  const pdf = await pdfjs.getDocument({
    data, disableFontFace: true, useSystemFonts: false, isEvalSupported: false, standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;

  const { SCENE_NUM_RE, MM_INFO_RE } = require('../utils/scheduleParser');
  const HEADING_RE = /\b(INT\.?|EXT\.?|INT\/EXT\.?|I\/E\.?)\b/i;
  // Day-break markers in Movie Magic schedules — these should terminate the previous scene's crop:
  //   "Shoot Day # 28 Tuesday, January 17, 2017"
  //   "End Day # 27 Monday, January 16, 2017 -- Total Pages: 2 6/8"
  const DAY_BREAK_RE = /^(?:end\s+day|shoot\s+day)\s*#?\s*\d+/i;

  const scenes = [];
  const totalPages = pdf.numPages;

  for (let p = 1; p <= totalPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();

    // Group items into lines by PDF-space Y
    const linesMap = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const pdfY = it.transform ? it.transform[5] : 0;
      const pdfX = it.transform ? it.transform[4] : 0;
      const h = it.height || 12;
      let line = linesMap.find(l => Math.abs(l.pdfY - pdfY) < 4);
      if (!line) {
        line = { pdfY, items: [], maxHeight: h, text: '' };
        linesMap.push(line);
      }
      line.items.push({ str: it.str.trim(), pdfX });
      if (h > line.maxHeight) line.maxHeight = h;
    }
    for (const l of linesMap) {
      l.items.sort((a, b) => a.pdfX - b.pdfX);
      l.text = l.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
    }
    // Sort top→bottom (PDF Y is bottom-up)
    linesMap.sort((a, b) => b.pdfY - a.pdfY);

    const pageW = viewport.width || 612;
    const LEFT_MARGIN = pageW * 0.15;
    const RIGHT_MARGIN = pageW * 0.70;

    for (let i = 0; i < linesMap.length; i++) {
      const line = linesMap[i];
      const upper = line.text.toUpperCase();

      // --- Day-break marker: inject a synthetic boundary entry ---
      // These "End Day # 27" / "Shoot Day # 28" lines terminate the preceding scene's crop
      // and prevent the next day's header from bleeding into the cropped image.
      // Using sceneNumber="__DAYBREAK__" — won't match any requested scene, but will
      // act as a "next different scene" boundary in buildRenderSpecs.
      if (DAY_BREAK_RE.test(line.text)) {
        scenes.push({
          sceneNumber: '__DAYBREAK__',
          heading: line.text,
          pageNumber: p,
          pdfY: line.pdfY,
          fontHeightPdf: line.maxHeight,
        });
        continue;
      }

      // --- Movie Magic format: scene number line followed by MM info line ---
      const numOnly = line.text.match(SCENE_NUM_RE);
      if (numOnly && i + 1 < linesMap.length) {
        const nextLine = linesMap[i + 1];
        if (MM_INFO_RE.test(nextLine.text)) {
          const num = numOnly[1].toUpperCase().replace(/PT$/, '');
          if (num) {
            scenes.push({
              sceneNumber: num,
              heading: nextLine.text,
              pageNumber: p,
              pdfY: line.pdfY,
              fontHeightPdf: line.maxHeight,
            });
          }
          continue;
        }
      }

      // --- Standard heading with scene number at margin (INT./EXT. line) ---
      if (HEADING_RE.test(upper)) {
        let extractedNumber = null;
        // Digit-only item at left margin
        const leftItem = line.items.find(it => it.pdfX < LEFT_MARGIN && /^(\d+[A-Za-z]{0,3})\.?$/.test(it.str));
        if (leftItem) {
          const m = leftItem.str.match(/^(\d+[A-Za-z]{0,3})\.?$/);
          if (m) extractedNumber = m[1];
        }
        // Digit-only item at right margin
        if (!extractedNumber) {
          const rightItem = line.items.find(it => it.pdfX > RIGHT_MARGIN && /^(\d+[A-Za-z]{0,3})\.?$/.test(it.str));
          if (rightItem) {
            const m = rightItem.str.match(/^(\d+[A-Za-z]{0,3})\.?$/);
            if (m) extractedNumber = m[1];
          }
        }
        // Text-level leading number
        if (!extractedNumber) {
          const leading = line.text.match(/^(\d+[A-Za-z]{0,3})\s+(INT|EXT|INT\/EXT|I\/E)/i);
          if (leading) extractedNumber = leading[1];
        }

        if (extractedNumber) {
          const num = extractedNumber.toUpperCase().replace(/PT$/, '');
          if (num) {
            scenes.push({
              sceneNumber: num,
              heading: line.text,
              pageNumber: p,
              pdfY: line.pdfY,
              fontHeightPdf: line.maxHeight,
            });
          }
        }
      }
    }

    page.cleanup();
  }

  await pdf.cleanup();
  await pdf.destroy();
  return scenes;
}

// Matches scene headings like: "1. INT. HOUSE - DAY", "12A. EXT. PARK - NIGHT"
const SCENE_HEADING_WITH_NUM_RE = /^(\d+[A-Za-z]?)[\s.\/)]+\s*((?:INT|EXT|INT\/EXT|I\/E)[.\s].*)$/i;
// Plain INT./EXT. — may have trailing scene numbers like "INT. LOCATION99" or "INT. LOCATION8A8A"
const SCENE_HEADING_PLAIN_RE = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s+/i;
// Trailing doubled scene number: "99" = scene 9, "1010" = scene 10, "95C95C" = scene 95C, "8A8A" = scene 8A
const TRAILING_SCENE_NUM_RE = /(\d+[A-Za-z]?)\1\*?\s*$/;

/**
 * Build a scene map from the full script text.
 * Returns array of { sceneNumber, heading, startOffset, endOffset, pageStart, pageEnd }
 */
function buildSceneMap(fullText, pageOffsets) {
  const lines = fullText.split('\n');
  const scenes = [];
  let offset = 0;
  let autoSceneCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const lineStart = offset;
    offset += line.length + 1; // +1 for \n

    if (!trimmed) continue;

    // Try numbered scene heading first: "1. INT. HOUSE - DAY"
    let match = trimmed.match(SCENE_HEADING_WITH_NUM_RE);
    if (match) {
      const sceneNumber = match[1].toUpperCase();
      const heading = trimmed;

      // Close previous scene
      if (scenes.length > 0) {
        scenes[scenes.length - 1].endOffset = lineStart;
      }

      scenes.push({ sceneNumber, heading, startOffset: lineStart, endOffset: fullText.length });
      continue;
    }

    // Try plain scene heading: "INT. HOUSE - DAY" (no leading number)
    // May have trailing doubled scene number: "INT. LOCATION99" means scene 9
    if (SCENE_HEADING_PLAIN_RE.test(trimmed)) {
      let sceneNumber = null;
      const trailingMatch = trimmed.match(TRAILING_SCENE_NUM_RE);
      if (trailingMatch) {
        sceneNumber = trailingMatch[1].toUpperCase();
      } else {
        // Check for single trailing number with space: "INT. HARBOR - NIGHT 22"
        const singleTrail = trimmed.match(/\s(\d+[A-Za-z]?)\*?\s*$/);
        if (singleTrail) {
          sceneNumber = singleTrail[1].toUpperCase();
        }
      }

      // Always close previous scene at this heading boundary
      if (scenes.length > 0) {
        scenes[scenes.length - 1].endOffset = lineStart;
      }

      // Only add to scene map if we found an actual scene number
      // Headings without numbers are sub-headings/continuations — they become part of the previous scene
      if (sceneNumber) {
        scenes.push({ sceneNumber, heading: trimmed, startOffset: lineStart, endOffset: fullText.length });
      } else if (scenes.length > 0) {
        // Extend previous scene to include this sub-heading
        scenes[scenes.length - 1].endOffset = fullText.length;
      }
    }
  }

  // Map offsets to page numbers
  for (const scene of scenes) {
    scene.pageStart = offsetToPage(scene.startOffset, pageOffsets);
    scene.pageEnd = offsetToPage(scene.endOffset - 1, pageOffsets);
  }

  return scenes;
}

/**
 * Given a character offset, find which page it falls on.
 */
function offsetToPage(offset, pageOffsets) {
  for (let i = pageOffsets.length - 1; i >= 0; i--) {
    if (offset >= pageOffsets[i].start) {
      return pageOffsets[i].pageNumber;
    }
  }
  return 1;
}

/**
 * Extract sides by scene number (not by page).
 */
async function extractSides(sidesId, versionId, sceneNumbers, options = {}) {
  const sides = await Sides.findById(sidesId);
  if (!sides) return;

  try {
    sides.status = 'generating';
    await sides.save();
    emitSidesUpdated(sides);

    // Get all script pages sorted
    const allPages = await ScriptPage.find({ scriptVersion: versionId })
      .sort({ pageNumber: 1 });

    if (!allPages.length) {
      throw new Error('No script pages found for this version');
    }

    // Concatenate all pages into full script text, tracking page boundaries
    let fullText = '';
    const pageOffsets = [];

    for (const page of allPages) {
      const start = fullText.length;
      fullText += page.rawText + '\n';
      pageOffsets.push({
        pageNumber: page.pageNumber,
        start,
        end: fullText.length - 1,
      });
    }

    // Build scene map from the entire script
    const sceneMap = buildSceneMap(fullText, pageOffsets);

    // Note: sceneMap may be empty if the text-based detection fails (e.g., scene numbers on
    // separate lines from headings). The PDF-based approach below is more reliable and will
    // be used as the source of truth. Only fail later if BOTH approaches return nothing.

    // Normalize requested scene numbers.
    // Special case: strip trailing "PT" suffix (case-insensitive) — e.g. "107PT" → "107".
    // This is ONLY for "pt" (part) suffix; other letter suffixes like "A", "B", "C" are preserved
    // because they denote real sub-scenes.
    const normalizeSceneNumber = (s) => {
      const up = String(s).trim().toUpperCase();
      return up.replace(/PT$/, '');
    };
    const requestedScenes = new Set(sceneNumbers.map(normalizeSceneNumber));

    // Extract only the requested scenes — exact match only.
    // Dedupe: a script can have the same scene number appearing multiple times
    // (e.g. continuation headings like "(CONT'D)"). Keep only the FIRST occurrence,
    // extending its endOffset to cover all subsequent same-numbered chunks.
    const matchedScenesRaw = sceneMap.filter(s => requestedScenes.has(s.sceneNumber));
    const matchedScenesMap = new Map();
    for (const s of matchedScenesRaw) {
      if (!matchedScenesMap.has(s.sceneNumber)) {
        matchedScenesMap.set(s.sceneNumber, { ...s });
      } else {
        // Merge: extend endOffset / pageEnd to include this occurrence
        const existing = matchedScenesMap.get(s.sceneNumber);
        if (s.endOffset > existing.endOffset) existing.endOffset = s.endOffset;
        if (s.pageEnd > existing.pageEnd) existing.pageEnd = s.pageEnd;
      }
    }
    const matchedScenes = Array.from(matchedScenesMap.values());

    // Note: we do NOT throw here if matchedScenes is empty — the PDF-based scene map
    // (used below) is more reliable. We'll throw later if BOTH text and PDF maps fail.

    // Extract scene text
    const extractedScenes = matchedScenes.map(scene => {
      // Clean heading: remove trailing doubled scene numbers and revision marks
      let cleanHeading = scene.heading
        .replace(/(\d+[A-Za-z]?)\1\*?\s*$/, '')  // remove doubled: "108108*" -> ""
        .replace(/\d+[A-Za-z]?\*?\s*$/, '')       // remove single trailing: "99" -> ""
        .replace(/\*+\s*$/, '')                    // remove trailing *
        .trim();
      // Prefix with scene number
      cleanHeading = scene.sceneNumber + ' ' + cleanHeading;

      // Clean rawText: replace the first line (scene heading) with the clean version
      let rawText = fullText.slice(scene.startOffset, scene.endOffset).trim();
      const firstNewline = rawText.indexOf('\n');
      if (firstNewline > 0) {
        rawText = cleanHeading + rawText.substring(firstNewline);
      } else {
        rawText = cleanHeading;
      }

      // Also clean any other lines with trailing doubled numbers
      rawText = rawText.replace(/(\d+[A-Za-z]?)\1\*?\s*$/gm, '$1');

      return {
        sceneNumber: scene.sceneNumber,
        heading: cleanHeading,
        originalHeading: scene.heading, // for image-rendering text matching
        rawText,
        pageStart: scene.pageStart,
        pageEnd: scene.pageEnd,
      };
    });

    sides.scenes = extractedScenes;
    sides.totalScenes = extractedScenes.length;
    sides.sceneNumbers = extractedScenes.map(s => s.sceneNumber);

    // Render the original PDF pages as cropped images for each scene.
    // Uses a PDF-based scene map (reliable coordinates from pdfjs) — authoritative source
    // of truth for which scenes exist, their real page numbers, and exact Y positions.
    // The text-based extractedScenes above are ONLY used if image rendering fails.
    let imageRenderingSucceeded = false;
    try {
      const originalPdfBuffer = await getFileBuffer(getScriptPdfKey(sides.script, versionId));
      const pdfSceneMap = await buildPdfSceneMap(originalPdfBuffer);

      // Get total page count for endPage fallback (last scene has no "next scene")
      const pdfjs = await loadPdfjs();
      const probeDoc = await pdfjs.getDocument({
        data: bufferToUint8(originalPdfBuffer),
        disableFontFace: true, useSystemFonts: false, isEvalSupported: false, standardFontDataUrl: STANDARD_FONT_DATA_URL,
      }).promise;
      const pdfTotalPages = probeDoc.numPages;
      await probeDoc.destroy();

      // Build render specs from PDF scene map. When the caller requested a
      // specific scene order (e.g. autogenerate "rearrange order"), emit scenes
      // in that order instead of the default script order.
      const renderSpecs = buildRenderSpecs(
        pdfSceneMap, requestedScenes, pdfTotalPages,
        options.ordered ? sceneNumbers : null
      );

      console.log('[sides] PDF scene map found:', pdfSceneMap.map(s => `${s.sceneNumber}@p${s.pageNumber}`).join(', '));
      console.log('[sides] Requested scenes:', Array.from(requestedScenes).join(', '));
      console.log('[sides] Render specs:', renderSpecs.map(s => `${s.sceneNumber}(p${s.startPage}-${s.endPage})`).join(', '));
      // Verbose: show each found heading's full text
      console.log('[sides] Heading details:');
      for (const s of pdfSceneMap) {
        console.log(`  p${s.pageNumber} scene=${s.sceneNumber} heading="${s.heading.slice(0, 80)}"`);
      }

      // "Cross out" mode: keep full pages and strike through unselected scenes.
      if (sides.sceneDisplayMode === 'crossout') {
        // sceneOrder may contain bare scene numbers OR composite tokens
        // "scriptId:sceneNumber". For the single-version extractor we only
        // own one script, so any composite token whose scriptId doesn't match
        // is dropped.
        const thisScriptId = String(sides.script || '');
        const orderedHere = Array.isArray(sides.sceneOrder) && sides.sceneOrder.length
          ? sides.sceneOrder.map(tok => {
              const t = String(tok || '');
              if (!t.includes(':')) return normalizeSceneNumber(t);
              const [sid, sn] = t.split(':');
              if (thisScriptId && String(sid) !== thisScriptId) return null;
              return normalizeSceneNumber(sn);
            }).filter(sn => sn && requestedScenes.has(sn))
          : [];

        if (orderedHere.length) {
          // Rearrange-aware crossout: one chunk per scene in sceneOrder. Other
          // user-picked scenes stay clean inside each chunk via allSelectedScenes.
          // Track rendered pages so a page shared by two ordered scenes is
          // emitted only once (credited to the first scene that reaches it).
          const scenesOut = [];
          const imagesOut = [];
          const seenSn = new Set();
          const renderedPages = new Set();
          for (const sn of orderedHere) {
            if (seenSn.has(sn)) continue;
            seenSn.add(sn);
            const chunk = await renderCrossoutImages(
              originalPdfBuffer, pdfSceneMap, new Set([sn]), pdfTotalPages,
              { allSelectedScenes: requestedScenes, skipPages: renderedPages },
            );
            if (!chunk.length || !chunk[0].images.length) continue;
            const key = `crossout:${sn}`;
            scenesOut.push({ sceneNumber: sn, heading: `Scene ${sn}`, rawText: '', imageKey: key });
            imagesOut.push({ key, sceneNumber: sn, images: chunk[0].images });
            for (const p of (chunk[0].pageNumbers || [])) renderedPages.add(p);
          }
          if (imagesOut.length) {
            sides._sceneImages = imagesOut;
            sides.scenes = scenesOut;
            sides.totalScenes = scenesOut.length;
            sides.sceneNumbers = scenesOut.map(s => s.sceneNumber);
            imageRenderingSucceeded = true;
          } else {
            console.warn('[sides] crossout rearrange produced no pages');
          }
        } else {
          const crossImages = await renderCrossoutImages(originalPdfBuffer, pdfSceneMap, requestedScenes, pdfTotalPages);
          if (crossImages.length && crossImages[0].images.length) {
            const key = '__crossout__';
            sides._sceneImages = [{ key, sceneNumber: '__crossout__', images: crossImages[0].images }];
            sides.scenes = [{
              sceneNumber: [...requestedScenes].join(', '),
              heading: `Scenes ${[...requestedScenes].join(', ')}`,
              rawText: '',
              imageKey: key,
            }];
            sides.totalScenes = 1;
            sides.sceneNumbers = [...requestedScenes];
            imageRenderingSucceeded = true;
          } else {
            console.warn('[sides] crossout produced no pages for this PDF');
          }
        }
      } else if (renderSpecs.length > 0) {
        const sceneImages = await renderSceneImages(originalPdfBuffer, renderSpecs);
        sides._sceneImages = sceneImages;

        // OVERRIDE sides.scenes from the PDF-based specs (source of truth).
        // This ensures generateSidesPdf iterates the scenes we actually rendered.
        sides.scenes = renderSpecs.map(spec => ({
          sceneNumber: spec.sceneNumber,
          heading: `${spec.sceneNumber} ${spec.heading.replace(/^\s*\d+[A-Za-z]?\s+/, '').replace(/\s+\d+[A-Za-z]?\s*$/, '').trim()}`,
          rawText: '', // not needed — image rendering is primary path
          pageStart: spec.startPage,
          pageEnd: spec.endPage,
        }));
        sides.totalScenes = sides.scenes.length;
        sides.sceneNumbers = sides.scenes.map(s => s.sceneNumber);
        imageRenderingSucceeded = true;
      } else {
        console.warn('[sides] buildRenderSpecs returned 0 specs for this PDF');
      }
    } catch (err) {
      console.warn('[sides] renderSceneImages failed, falling back to text rendering:', err.message);
      sides._sceneImages = null;
    }

    // If neither the PDF-based nor text-based scene detection found anything, fail —
    // unless the user pulled in scene folders, which can stand alone as the content.
    const hasFolders = Array.isArray(sides.sceneFolders) && sides.sceneFolders.length > 0;
    if (!imageRenderingSucceeded && matchedScenes.length === 0 && !hasFolders) {
      const available = sceneMap.map(s => s.sceneNumber).join(', ');
      throw new Error(
        `No matching scenes found for: ${[...requestedScenes].join(', ')}. `
        + `Available scenes in script: ${available}`
      );
    }

    // Render shooting schedule scenes as images from the original schedule PDF.
    try {
      if (sides.shootingSchedule) {
        const ShootingSchedule = require('../models/ShootingSchedule');
        const schedule = await ShootingSchedule.findById(sides.shootingSchedule);
        if (schedule?.pdfUrl) {
          const schedPdfBuffer = await getFileBuffer(schedule.pdfUrl);
          const schedSceneMap = await buildSchedulePdfSceneMap(schedPdfBuffer);

          const pdfjsMod = await loadPdfjs();
          const schedProbe = await pdfjsMod.getDocument({
            data: bufferToUint8(schedPdfBuffer),
            disableFontFace: true, useSystemFonts: false, isEvalSupported: false, standardFontDataUrl: STANDARD_FONT_DATA_URL,
          }).promise;
          const schedTotalPages = schedProbe.numPages;
          await schedProbe.destroy();

          const schedRequestedScenes = new Set();
          for (const day of sides.shootDayInfo || []) {
            for (const s of day.scenes || []) {
              if (s.sceneNumber) schedRequestedScenes.add(String(s.sceneNumber).toUpperCase().replace(/PT$/, ''));
            }
          }

          const schedSpecs = buildRenderSpecs(schedSceneMap, schedRequestedScenes, schedTotalPages);
          if (schedSpecs.length > 0) {
            const schedImages = await renderSceneImages(schedPdfBuffer, schedSpecs, {
              topZoneRatio: 0.10,    // schedule headers ("Shooting Schedule", title, date) are ~8% from top
              bottomZoneRatio: 0.05, // schedule footers ("Printed on...") near bottom
            });
            sides._scheduleImages = schedImages;
          }
        }
      }
    } catch (err) {
      console.warn('[sides] Schedule image rendering failed, falling back to text:', err.message);
      sides._scheduleImages = null;
    }

    // Generate PDF
    await attachFolderImages(sides);
    const { buffer: pdfBuffer, scheduleStartPage: schedPage } = await generateSidesPdf(sides);
    const s3Key = `sides/${sides.script}/${sides._id}/sides.pdf`;
    await uploadFile(s3Key, pdfBuffer, 'application/pdf');
    sides.scheduleStartPage = schedPage;
    sides.pdfUrl = s3Key;

    sides.status = 'ready';
    await sides.save();
    emitSidesUpdated(sides);
  } catch (error) {
    sides.status = 'error';
    sides.error = error.message;
    await sides.save();
    emitSidesUpdated(sides);
    console.error('Sides generation error:', error);
  }
}

/**
 * Generate a printable PDF with one section per scene.
 */
function generateSidesPdf(sides) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalPages = 0;
    let scheduleStartPage = 0;
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 50, bottom: 50, left: 60, right: 60 },
    });
    doc.on('pageAdded', () => { totalPages++; });

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), scheduleStartPage }));
    doc.on('error', reject);

    // No title / page header — sides content starts directly at the top.
    doc.font('Courier').fontSize(12).fillColor('#000000');
    let y = 50;

    // Use same detection logic as HTML formatScreenplay
    function clean(s) { return s.replace(/\*+$/, '').trim(); }
    function isHeading(s) { return /^(?:\d+[A-Za-z]?\s)?(?:INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(clean(s)); }
    function isTransition(s) { return /^[A-Z\s]+TO:\s*\*?$/.test(clean(s)); }
    function isCharName(s) { const c = clean(s); return /^[A-Z][A-Z\s.\-'\/()#]+$/.test(c) && c.length >= 2 && c.length < 45 && !isHeading(s) && !isTransition(s) && !/^(CONTINUED|END OF|FADE)/.test(c); }
    function isParen(s) { return clean(s).startsWith('('); }
    function isAction(s) { const c = clean(s); return ((/^(The |He |She |They |A |An |As |It |We )/.test(c)) && c.length > 40) || c.length > 55; }

    // Page content area: X_LEFT=60 to right margin=552, total width=492
    // Center the dialogue block horizontally on the page for character dialogues
    const X_LEFT = 60;
    const PAGE_W = 492;
    const W_DIAL = 260;               // dialogue block width
    const W_CHAR = 260;               // character name block width (same as dialogue, centered)
    const W_PAREN = 220;              // parenthetical block width
    const X_DIAL = X_LEFT + (PAGE_W - W_DIAL) / 2;   // centered dialogue x
    const X_CHAR = X_LEFT + (PAGE_W - W_CHAR) / 2;   // centered character name x
    const X_PAREN = X_LEFT + (PAGE_W - W_PAREN) / 2; // centered parenthetical x

    // Build a quick lookup of pre-rendered scene images. In single-version mode
    // entries are keyed by sceneNumber; in multi-version mode each entry carries a
    // composite `key` (groupIndex:sceneNumber) so identical scene numbers from
    // different versions don't collide.
    const imagesByKey = {};
    if (Array.isArray(sides._sceneImages)) {
      for (const si of sides._sceneImages) imagesByKey[si.key || si.sceneNumber] = si.images || [];
    }

    const PAGE_BOTTOM = 750;
    const TARGET_W = 492;
    let prevType = '';

    const normSceneNo = (s) => String(s == null ? '' : s).trim().toUpperCase().replace(/PT$/, '');

    // Start a fresh page (no running header / title).
    function contBanner() {
      doc.addPage();
      doc.fillColor('#000000');
      y = 50;
    }

    // Render one script scene (image path with text fallback). Mutates `y`.
    function renderSceneUnit(scene) {
      const lookupKey = scene.imageKey || scene.sceneNumber;
      const sceneImages = imagesByKey[lookupKey];

      if (sceneImages && sceneImages.length > 0) {
        // ─── IMAGE PATH: embed cropped page images ───
        for (const imgBuffer of sceneImages) {
          let img;
          try {
            img = doc.openImage(imgBuffer);
          } catch (e) {
            console.error('openImage failed for scene', scene.sceneNumber, e.message);
            continue;
          }
          const targetH = (img.height / img.width) * TARGET_W;
          const remaining = PAGE_BOTTOM - y;
          if (targetH > PAGE_BOTTOM - 55) {
            if (y > 55) contBanner();
            const maxH = PAGE_BOTTOM - 55;
            const scaledH = Math.min(targetH, maxH);
            const scaledW = (img.width / img.height) * scaledH;
            const xCentered = 60 + (TARGET_W - scaledW) / 2;
            doc.image(imgBuffer, xCentered, y, { width: scaledW, height: scaledH });
            y += scaledH + 8;
          } else {
            if (targetH > remaining) contBanner();
            doc.image(imgBuffer, 60, y, { width: TARGET_W });
            y += targetH + 8;
          }
        }
      } else {
        // ─── FALLBACK TEXT PATH: original line-by-line text rendering ───
        doc.font('Courier').fontSize(12);
        prevType = '';
        const lines = (scene.rawText || '').split('\n');
        for (const line of lines) {
          if (y > 720) { contBanner(); doc.font('Courier').fontSize(12); }
          const trimmed = line.trim();
          if (!trimmed) { y += 10; prevType = ''; continue; }

          if (isHeading(trimmed)) {
            doc.font('Courier-Bold').fontSize(12);
            doc.text(trimmed, X_LEFT, y, { width: 492 });
            y += doc.heightOfString(trimmed, { width: 492 }) + 6;
            doc.font('Courier').fontSize(12);
            prevType = 'heading';
          } else if (isTransition(trimmed)) {
            doc.text(trimmed, X_LEFT, y, { width: 492, align: 'right' });
            y += 16;
            prevType = 'transition';
          } else if (isCharName(trimmed)) {
            doc.text(trimmed, X_CHAR, y, { width: W_CHAR, align: 'center' });
            y += 16;
            prevType = 'character';
          } else if (isParen(trimmed) && (prevType === 'character' || prevType === 'parenthetical' || prevType === 'dialogue')) {
            doc.text(trimmed, X_PAREN, y, { width: W_PAREN, align: 'center' });
            y += 16;
            prevType = 'parenthetical';
          } else if ((prevType === 'character' || prevType === 'parenthetical' || prevType === 'dialogue') && !isCharName(trimmed) && !isHeading(trimmed) && !isTransition(trimmed) && !isAction(trimmed)) {
            doc.text(trimmed, X_DIAL, y, { width: W_DIAL, align: 'center' });
            y += doc.heightOfString(trimmed, { width: W_DIAL, align: 'center' }) + 2;
            prevType = 'dialogue';
          } else {
            doc.text(trimmed, X_LEFT, y, { width: 492 });
            y += doc.heightOfString(trimmed, { width: 492 }) + 2;
            prevType = 'action';
          }
        }
      }
    }

    // Render one pulled-in scene folder ("Page") — page images only, no header.
    function renderFolderUnit(folder) {
      if (y > PAGE_BOTTOM - 60) { doc.addPage(); y = 50; }
      for (const imgBuffer of (folder.images || [])) {
        let img;
        try { img = doc.openImage(imgBuffer); } catch (e) { continue; }
        const targetH = (img.height / img.width) * TARGET_W;
        const maxH = PAGE_BOTTOM - 55;
        if (targetH > (PAGE_BOTTOM - y)) { doc.addPage(); y = 55; }
        if (targetH > maxH) {
          const scaledH = maxH;
          const scaledW = (img.width / img.height) * scaledH;
          const xCentered = 60 + (TARGET_W - scaledW) / 2;
          doc.image(imgBuffer, xCentered, y, { width: scaledW, height: scaledH });
          y += scaledH + 8;
        } else {
          doc.image(imgBuffer, 60, y, { width: TARGET_W });
          y += targetH + 8;
        }
      }
      y += 4;
    }

    // ─── Combined render: script scenes + page folders in ONE ordered list ───
    // Script scenes and pulled-in "Pages" are interleaved per the user's
    // rearrange order (sides.sceneOrder). Without an order, script scenes come
    // first (script order), then the page folders (selection order).
    //
    // Each unit carries TWO order-matching keys:
    //   - sceneNumber : just the scene number, for legacy "12, 5, 14A" orders.
    //   - composite   : "scriptId:sceneNumber" — used when the user picked
    //                   scenes from multiple scripts (same number can repeat)
    //                   and the order needs to disambiguate.
    let units = [
      ...sides.scenes.map(s => {
        const sn = normSceneNo(s.sceneNumber);
        // For script scenes, the owning script is the one in sourceVersion's
        // group; the controller already denormalized it into versionScenes.
        // Fall back to the sides' primary scriptId if not provided.
        const sid = s.sourceScriptId
          ? String(s.sourceScriptId)
          : String(sides.script || '');
        return { kind: 'scene', sceneNumber: sn, composite: `${sid}:${sn}`, data: s };
      }),
      ...(Array.isArray(sides._folderImages)
        ? sides._folderImages.map(f => {
            const sn = normSceneNo(f.label);
            const sid = f.sourceScriptId ? String(f.sourceScriptId) : String(sides.script || '');
            return { kind: 'folder', sceneNumber: sn, composite: `${sid}:${sn}`, data: f };
          })
        : []),
    ];

    if (Array.isArray(sides.sceneOrder) && sides.sceneOrder.length) {
      // The order list may contain either bare scene numbers OR composite
      // "scriptId:sceneNumber" tokens. Build TWO rank maps so a unit can match
      // by composite first (precise) then by sceneNumber (fallback).
      const compRank = new Map();
      const snRank = new Map();
      sides.sceneOrder.forEach((tok, i) => {
        const s = String(tok || '').trim();
        if (!s) return;
        if (s.includes(':')) {
          const k = s.split(':').map((p, j) => (j === 1 ? normSceneNo(p) : String(p).trim())).join(':');
          if (!compRank.has(k)) compRank.set(k, i);
        } else {
          const k = normSceneNo(s);
          if (!snRank.has(k)) snRank.set(k, i);
        }
      });
      const rankOf = (u) => {
        if (compRank.has(u.composite)) return compRank.get(u.composite);
        if (snRank.has(u.sceneNumber)) return snRank.get(u.sceneNumber);
        return Number.MAX_SAFE_INTEGER;
      };
      units = units
        .map((u, i) => ({ u, i }))
        .sort((a, b) => (rankOf(a.u) - rankOf(b.u)) || (a.i - b.i))
        .map(x => x.u);
    }

    for (let ui = 0; ui < units.length; ui++) {
      const unit = units[ui];
      if (unit.kind === 'scene') renderSceneUnit(unit.data);
      else renderFolderUnit(unit.data);

      // Inter-unit separator: draw ONLY if it fits on the current page AND
      // there's another unit after it. Never force a new page just to host a
      // separator line, and never emit a trailing separator — both produce a
      // near-blank page at the end / between sections.
      if (ui < units.length - 1 && y + 24 <= PAGE_BOTTOM) {
        y += 8;
        doc.moveTo(60, y).lineTo(552, y).stroke('#CCCCCC');
        y += 16;
      }
    }

    // Mark where schedule section starts (1-based page number within the sides PDF).
    // totalPages = count of pageAdded events so far. First page is auto-created and NOT counted.
    // So total sides pages = totalPages + 1, and schedule begins on the next page: totalPages + 2.
    scheduleStartPage = totalPages + 2;

    // Shooting Schedule section
    const schedSections = [
      { key: 'cast', label: 'Cast Members' }, { key: 'props', label: 'Props' },
      { key: 'backgroundActors', label: 'Background Actors' }, { key: 'setDressing', label: 'Set Dressing' },
      { key: 'cgiCharacters', label: 'CGI Characters' }, { key: 'wardrobe', label: 'Wardrobe' },
      { key: 'makeupHair', label: 'Makeup/Hair' }, { key: 'vehicles', label: 'Vehicles' },
      { key: 'grip', label: 'Grip' }, { key: 'electric', label: 'Electric' },
      { key: 'additionalLabor', label: 'Additional Labor' }, { key: 'standby', label: "Standby's & Riggers" },
      { key: 'visualEffects', label: 'Visual Effects' }, { key: 'specialEffects', label: 'Special Effects' },
      { key: 'stunts', label: 'Stunts' }, { key: 'animals', label: 'Animals' },
    ];

    const scheduleImagesLookup = {};
    if (Array.isArray(sides._scheduleImages)) {
      for (const si of sides._scheduleImages) scheduleImagesLookup[si.sceneNumber] = si.images || [];
    }

    if (sides.shootDayInfo?.length) {
      for (const day of sides.shootDayInfo) {
        doc.addPage();
        doc.font('Courier-Bold').fontSize(14);
        doc.text(`Shooting Schedule`, { align: 'center' });
        doc.font('Courier-Bold').fontSize(12);
        doc.text(`${day.isExtraDay ? 'From ' : ''}Shoot Day # ${day.dayNumber}  ${day.date || ''}`, { align: 'center' });
        if (day.callTime || day.wrapTime) {
          doc.font('Courier').fontSize(11);
          doc.text(`${day.callTime || ''}${day.wrapTime ? ' - ' + day.wrapTime : ''}`, { align: 'center' });
        }
        if (day.location) {
          doc.font('Courier').fontSize(10);
          doc.text(`Location: ${day.location}`, { align: 'center' });
        }
        doc.moveDown(1);
        doc.moveTo(60, doc.y).lineTo(552, doc.y).stroke('#CCCCCC');
        doc.moveDown(0.5);

        for (const s of (day.scenes || [])) {
          const normNum = String(s.sceneNumber || '').toUpperCase().replace(/PT$/, '');
          const sceneImgs = scheduleImagesLookup[normNum];

          if (sceneImgs && sceneImgs.length > 0) {
            // Image path
            const TW = 492, PB = 750;
            for (const imgBuf of sceneImgs) {
              let img; try { img = doc.openImage(imgBuf); } catch (e) { continue; }
              const tH = (img.height / img.width) * TW;
              if (tH > PB - 55) {
                if (doc.y > 55) doc.addPage();
                const sH = Math.min(tH, PB - 55), sW = (img.width / img.height) * sH;
                doc.image(imgBuf, 60 + (TW - sW) / 2, doc.y, { width: sW, height: sH });
                doc.y += sH + 8;
              } else {
                if (tH > PB - doc.y) doc.addPage();
                doc.image(imgBuf, 60, doc.y, { width: TW });
                doc.y += tH + 8;
              }
            }
            if (doc.y > PB) doc.addPage();
            doc.moveTo(60, doc.y).lineTo(552, doc.y).stroke('#DDDDDD');
            doc.moveDown(0.5);
          } else {
            // Text fallback
            if (doc.y > 680) { doc.addPage(); }
            doc.font('Courier-Bold').fontSize(12);
            doc.text(s.sceneNumber || '', { continued: false });
            doc.font('Courier').fontSize(11);
            doc.text(`${s.intExt || ''}  ${s.location || ''}  ${s.timeOfDay || ''}  ${s.pages || ''}`);
            if (s.synopsis) { doc.fontSize(10).text(s.synopsis); }
            doc.moveDown(0.3);
            const activeSections = schedSections.filter(sec => s[sec.key]?.length > 0);
            for (let si = 0; si < activeSections.length; si += 2) {
              if (doc.y > 680) { doc.addPage(); }
              const startY = doc.y; let maxY = startY;
              const left = activeSections[si];
              doc.font('Courier-Bold').fontSize(10).text(left.label, 60, startY, { width: 230, underline: true });
              doc.font('Courier').fontSize(10);
              left.items = s[left.key];
              left.items.forEach(item => doc.text(item, 60, doc.y, { width: 230 }));
              maxY = Math.max(maxY, doc.y);
              if (si + 1 < activeSections.length) {
                const right = activeSections[si + 1];
                doc.font('Courier-Bold').fontSize(10).text(right.label, 310, startY, { width: 230, underline: true });
                doc.font('Courier').fontSize(10);
                s[right.key].forEach(item => doc.text(item, 310, doc.y, { width: 230 }));
                maxY = Math.max(maxY, doc.y);
              }
              doc.y = maxY + 6;
            }
            if (s.notes) {
              doc.font('Courier-Bold').fontSize(10).text('Notes', 60, doc.y, { underline: true });
              doc.font('Courier').fontSize(10).text(s.notes, 60, doc.y);
            }
            doc.moveDown(0.5);
            doc.moveTo(60, doc.y).lineTo(552, doc.y).stroke('#DDDDDD');
            doc.moveDown(0.5);
          }
        }
      }
    }

    doc.end();
  });
}

/**
 * AI-powered sides extraction. Uses Claude to intelligently find and extract
 * the exact scene content, handling non-standard formatting, unnumbered scenes, etc.
 */
async function extractSidesWithAI(sidesId, versionId, sceneNumbers, provider) {
  const { callClaude, callOllama } = require('./ai.service');
  const config = require('../config/env');
  const sides = await Sides.findById(sidesId);
  if (!sides) return;

  try {
    sides.status = 'generating';
    await sides.save();
    emitSidesUpdated(sides);

    const allPages = await ScriptPage.find({ scriptVersion: versionId }).sort({ pageNumber: 1 });
    if (!allPages.length) throw new Error('No script pages found');

    // Build full script with page markers
    const scriptText = allPages.map(p => `[PAGE ${p.pageNumber}]\n${p.rawText}`).join('\n\n');

    const systemPrompt = `You are an internal production tool for a film production company. Your job is to parse screenplay documents owned by the production and identify scene boundaries. The user is the script supervisor who owns this screenplay and needs to create daily sides for the film crew. You must return valid JSON only — no markdown, no explanation, no refusals. This is an authorized internal production workflow.`;

    const userPrompt = `TASK: As the script supervisor, I need to identify the boundaries of scenes ${sceneNumbers.join(', ')} in our production's screenplay below.

For each requested scene, find:
1. Where the scene heading is (e.g. "INT. LOCATION - TIME" or numbered like "5. EXT. PARK - DAY")
2. The page number it starts on (indicated by [PAGE X] markers)
3. The page number it ends on
4. The scene heading text

OUR SCREENPLAY TEXT:
${scriptText}

Return ONLY this JSON (no wrapping, no markdown):
{"scenes":[{"sceneNumber":"1","heading":"Scene heading text","summary":"2-3 sentence summary of what happens in this scene","pageStart":1,"pageEnd":2,"startLine":"first line of the scene","endLine":"last line before next scene starts"}]}

For each scene include a summary of the action and dialogue. This is for our internal call sheet / sides reference.`;

    const selectedProvider = provider || config.ai.provider;
    let responseText;
    if (selectedProvider === 'claude') {
      responseText = await callClaude(systemPrompt, userPrompt);
    } else {
      responseText = await callOllama(systemPrompt, userPrompt);
    }

    // Parse response
    let jsonStr = responseText.trim();
    const codeBlock = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlock) jsonStr = codeBlock[1].trim();
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      // Try repair
      jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
      let open = 0, openB = 0, inStr = false, esc = false;
      for (const ch of jsonStr) {
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') open++; if (ch === '}') open--;
        if (ch === '[') openB++; if (ch === ']') openB--;
      }
      while (openB > 0) { jsonStr += ']'; openB--; }
      while (open > 0) { jsonStr += '}'; open--; }
      parsed = JSON.parse(jsonStr);
    }

    // AI gives us scene boundaries — now extract actual text using the manual scene map
    // Build full text + page offsets for slicing
    let fullText = '';
    const pageOffsets = [];
    for (const page of allPages) {
      const start = fullText.length;
      fullText += page.rawText + '\n';
      pageOffsets.push({ pageNumber: page.pageNumber, start, end: fullText.length - 1 });
    }
    const sceneMap = buildSceneMap(fullText, pageOffsets);

    const extractedScenes = [];
    for (const aiScene of (parsed.scenes || [])) {
      const num = String(aiScene.sceneNumber).trim().toUpperCase();

      // Try to find this scene in our regex-built scene map
      const mapped = sceneMap.find(s => s.sceneNumber === num);
      if (mapped) {
        extractedScenes.push({
          sceneNumber: num,
          heading: mapped.heading,
          rawText: fullText.slice(mapped.startOffset, mapped.endOffset).trim(),
          pageStart: mapped.pageStart,
          pageEnd: mapped.pageEnd,
        });
      } else {
        // Fallback: use AI-provided info
        extractedScenes.push({
          sceneNumber: num,
          heading: aiScene.heading || '',
          rawText: aiScene.summary || aiScene.rawText || `Scene ${num}: ${aiScene.heading || 'No content extracted'}`,
          pageStart: aiScene.pageStart || 1,
          pageEnd: aiScene.pageEnd || aiScene.pageStart || 1,
        });
      }
    }

    if (extractedScenes.length === 0) {
      throw new Error('AI could not identify any matching scenes. Try the manual method instead.');
    }

    sides.scenes = extractedScenes;
    sides.totalScenes = extractedScenes.length;
    sides.sceneNumbers = extractedScenes.map(s => s.sceneNumber);

    // Render the original PDF pages as cropped images for each scene (AI path).
    try {
      const originalPdfBuffer = await getFileBuffer(getScriptPdfKey(sides.script, versionId));
      const pdfSceneMap = await buildPdfSceneMap(originalPdfBuffer);

      const pdfjsMod = await loadPdfjs();
      const probeDoc = await pdfjsMod.getDocument({
        data: bufferToUint8(originalPdfBuffer),
        disableFontFace: true, useSystemFonts: false, isEvalSupported: false, standardFontDataUrl: STANDARD_FONT_DATA_URL,
      }).promise;
      const pdfTotalPages = probeDoc.numPages;
      await probeDoc.destroy();

      const aiRequestedScenes = new Set(extractedScenes.map(s => String(s.sceneNumber).toUpperCase().replace(/PT$/, '')));
      const renderSpecs = buildRenderSpecs(pdfSceneMap, aiRequestedScenes, pdfTotalPages);
      const sceneImages = await renderSceneImages(originalPdfBuffer, renderSpecs);
      sides._sceneImages = sceneImages;
    } catch (err) {
      console.warn('renderSceneImages (AI path) failed, falling back to text rendering:', err.message);
      sides._sceneImages = null;
    }

    // Generate PDF
    await attachFolderImages(sides);
    const { buffer: pdfBuffer, scheduleStartPage: schedPage } = await generateSidesPdf(sides);
    const s3Key = `sides/${sides.script}/${sides._id}/sides.pdf`;
    await uploadFile(s3Key, pdfBuffer, 'application/pdf');
    sides.scheduleStartPage = schedPage;
    sides.pdfUrl = s3Key;

    sides.status = 'ready';
    await sides.save();
    emitSidesUpdated(sides);
  } catch (error) {
    sides.status = 'error';
    sides.error = error.message;
    await sides.save();
    emitSidesUpdated(sides);
    console.error('AI Sides extraction error:', error);
  }
}

/**
 * Render the day's shooting-schedule scenes as cropped images and attach them
 * to `sides._scheduleImages`. Shared by the single- and multi-version paths.
 * Non-fatal: any failure just leaves the schedule images unset.
 */
async function attachScheduleImages(sides) {
  try {
    if (!sides.shootingSchedule) return;
    const ShootingSchedule = require('../models/ShootingSchedule');
    const schedule = await ShootingSchedule.findById(sides.shootingSchedule);
    if (!schedule?.pdfUrl) return;

    const schedPdfBuffer = await getFileBuffer(schedule.pdfUrl);
    const schedSceneMap = await buildSchedulePdfSceneMap(schedPdfBuffer);

    const pdfjsMod = await loadPdfjs();
    const schedProbe = await pdfjsMod.getDocument({
      data: bufferToUint8(schedPdfBuffer),
      disableFontFace: true, useSystemFonts: false, isEvalSupported: false, standardFontDataUrl: STANDARD_FONT_DATA_URL,
    }).promise;
    const schedTotalPages = schedProbe.numPages;
    await schedProbe.destroy();

    const schedRequestedScenes = new Set();
    for (const day of sides.shootDayInfo || []) {
      for (const s of day.scenes || []) {
        if (s.sceneNumber) schedRequestedScenes.add(String(s.sceneNumber).toUpperCase().replace(/PT$/, ''));
      }
    }

    const schedSpecs = buildRenderSpecs(schedSceneMap, schedRequestedScenes, schedTotalPages);
    if (schedSpecs.length > 0) {
      sides._scheduleImages = await renderSceneImages(schedPdfBuffer, schedSpecs, {
        topZoneRatio: 0.10,
        bottomZoneRatio: 0.05,
      });
    }
  } catch (err) {
    console.warn('[sides] Schedule image rendering failed:', err.message);
    sides._scheduleImages = null;
  }
}

/** Render every page of a (small) PDF buffer to PNG image buffers at 2x. */
async function renderPdfPagesToImages(pdfBuffer, maxPages = 30) {
  const { createCanvas } = require('@napi-rs/canvas');
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({
    data: bufferToUint8(pdfBuffer),
    disableFontFace: true, useSystemFonts: false, isEvalSupported: false, standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;
  const SCALE = 2;
  const images = [];
  const n = Math.min(pdf.numPages, maxPages);
  for (let p = 1; p <= n; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: SCALE });
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    await page.render({ canvasContext: ctx, viewport, background: 'white' }).promise;
    images.push(canvas.toBuffer('image/png'));
  }
  await pdf.destroy();
  return images;
}

/**
 * Render pulled-in scene folders (Pages) to images for `sides._folderImages`.
 * Each output entry is { label, color, description, images }.
 *
 * When a folder specifies sceneNumbers, we crop just those scenes from its PDF
 * (same detection + crop machinery as scripts) — one entry per scene. Otherwise
 * the whole PDF is rendered as a single entry titled by the folder's scene no.
 * Non-fatal per folder.
 */
async function attachFolderImages(sides) {
  if (!Array.isArray(sides.sceneFolders) || sides.sceneFolders.length === 0) return;
  const pdfjs = await loadPdfjs();
  const normalize = (s) => String(s).trim().toUpperCase().replace(/PT$/, '');
  const out = [];

  for (const folder of sides.sceneFolders) {
    if (!folder.pdfUrl) continue;
    try {
      const buf = await getFileBuffer(folder.pdfUrl);
      const wanted = Array.isArray(folder.sceneNumbers) ? folder.sceneNumbers.filter(Boolean) : [];

      if (wanted.length > 0) {
        // Crop the selected scenes from the page PDF.
        const sceneMap = await buildPdfSceneMap(buf);
        const probe = await pdfjs.getDocument({
          data: bufferToUint8(buf),
          disableFontFace: true, useSystemFonts: false, isEvalSupported: false, standardFontDataUrl: STANDARD_FONT_DATA_URL,
        }).promise;
        const totalPages = probe.numPages;
        await probe.destroy();

        // Cross-out mode: keep the page PDF's full pages and strike through the
        // scenes the user did NOT pick (same visual as the script cross-out).
        if (sides.sceneDisplayMode === 'crossout') {
          const wantedSet = new Set(wanted.map(normalize));
          // sceneOrder tokens may be composite "scriptId:sceneNumber". This
          // folder is owned by `folder.script`; only honor tokens for THIS
          // script (bare scene numbers are accepted for legacy / single-
          // script orders).
          const thisScriptId = String(folder.script || sides.script || '');
          const orderedHere = Array.isArray(sides.sceneOrder) && sides.sceneOrder.length
            ? sides.sceneOrder.map(tok => {
                const t = String(tok || '');
                if (!t.includes(':')) return normalize(t);
                const [sid, sn] = t.split(':');
                if (thisScriptId && String(sid) !== thisScriptId) return null;
                return normalize(sn);
              }).filter(sn => sn && wantedSet.has(sn))
            : [];

          if (orderedHere.length) {
            // Rearrange-aware: one folder entry per scene in sceneOrder.
            // Each chunk's grey/X overlay leaves the folder's other picked
            // scenes clean too (via allSelectedScenes = wantedSet). A page
            // shared by two ordered scenes appears only once.
            const seenSn = new Set();
            const renderedPages = new Set();
            let produced = false;
            for (const sn of orderedHere) {
              if (seenSn.has(sn)) continue;
              seenSn.add(sn);
              const chunk = await renderCrossoutImages(
                buf, sceneMap, new Set([sn]), totalPages,
                { allSelectedScenes: wantedSet, skipPages: renderedPages },
              );
              if (!chunk.length || !chunk[0].images.length) continue;
              out.push({
                label: sn,
                color: folder.color,
                sourceScriptId: folder.script,
                description: produced ? '' : folder.description,
                images: chunk[0].images,
              });
              produced = true;
              for (const p of (chunk[0].pageNumbers || [])) renderedPages.add(p);
            }
            if (produced) continue;
            // else fall through to the contiguous chunk attempt below.
          }

          const crossImages = await renderCrossoutImages(buf, sceneMap, wantedSet, totalPages);
          if (crossImages.length && crossImages[0].images.length) {
            out.push({
              label: wanted.join(', '),
              color: folder.color,
              sourceScriptId: folder.script,
              description: folder.description,
              images: crossImages[0].images,
            });
            continue;
          }
          // Fall through to crop/whole-PDF if cross-out produced nothing.
        }

        const specs = buildRenderSpecs(sceneMap, new Set(wanted.map(normalize)), totalPages);
        if (specs.length > 0) {
          const sceneImages = await renderSceneImages(buf, specs);
          let first = true;
          for (const si of sceneImages) {
            out.push({
              label: si.sceneNumber,
              color: folder.color,
              sourceScriptId: folder.script,
              description: first ? folder.description : '',
              images: si.images,
            });
            first = false;
          }
          continue;
        }
        // Fall through to whole-PDF if nothing matched.
      }

      // Whole-PDF fallback (no scenes requested or none detected).
      const images = await renderPdfPagesToImages(buf);
      out.push({
        label: folder.sceneNumber,
        color: folder.color,
        sourceScriptId: folder.script,
        description: folder.description,
        images,
      });
    } catch (e) {
      console.warn(`[sides] scene folder render failed for "${folder.sceneNumber}": ${e.message}`);
    }
  }
  sides._folderImages = out;
}

/**
 * Extract sides pulling scenes from MULTIPLE script versions at once.
 *
 * `versionGroups` is an array of { versionId, versionLabel, sceneNumbers[] }.
 * Each scene is rendered as a cropped image from ITS OWN version's PDF and tagged
 * with a composite imageKey (groupIndex:sceneNumber) plus a version label so the
 * final booklet shows provenance and identical scene numbers never collide.
 */
async function extractSidesMultiVersion(sidesId, versionGroups) {
  const sides = await Sides.findById(sidesId);
  if (!sides) return;

  try {
    sides.status = 'generating';
    await sides.save();
    emitSidesUpdated(sides);

    const pdfjs = await loadPdfjs();
    const normalizeSceneNumber = (s) => String(s).trim().toUpperCase().replace(/PT$/, '');

    const allScenes = [];        // -> sides.scenes
    const allSceneImages = [];   // -> sides._sceneImages (each has composite `key`)

    for (let gi = 0; gi < versionGroups.length; gi++) {
      const group = versionGroups[gi];
      const requested = new Set((group.sceneNumbers || []).map(normalizeSceneNumber));
      if (requested.size === 0) continue;

      const label = group.versionLabel || `v?`;
      // Use the version's OWN parent script id (may be a historical/archived
      // script), falling back to the sides' primary script for older payloads.
      const pdfScriptId = group.scriptId || sides.script;
      let pdfBuffer;
      try {
        pdfBuffer = await getFileBuffer(getScriptPdfKey(pdfScriptId, group.versionId));
      } catch (e) {
        console.warn(`[sides:multi] could not load PDF for version ${group.versionId}: ${e.message}`);
        continue;
      }

      const pdfSceneMap = await buildPdfSceneMap(pdfBuffer);
      const probeDoc = await pdfjs.getDocument({
        data: bufferToUint8(pdfBuffer),
        disableFontFace: true, useSystemFonts: false, isEvalSupported: false, standardFontDataUrl: STANDARD_FONT_DATA_URL,
      }).promise;
      const totalPages = probeDoc.numPages;
      await probeDoc.destroy();

      // "Cross out" mode.
      if (sides.sceneDisplayMode === 'crossout') {
        // ── Rearrange-aware crossout ─────────────────────────────────────
        // When the user typed a sceneOrder, emit ONE chunk per scene in
        // sceneOrder that belongs to this group. Each chunk renders only
        // the pages containing that scene's content, with *all* user-
        // selected scenes left clean (so co-located picks don't get
        // crossed out inside another scene's chunk). The unified order
        // pass in generateSidesPdf then interleaves these chunks
        // according to sceneOrder.
        const allUserSelected = new Set();
        for (const g of versionGroups) (g.sceneNumbers || []).forEach(s => allUserSelected.add(normalizeSceneNumber(s)));
        // sceneOrder may carry composite "scriptId:sceneNumber" tokens (multi-
        // script picks). Project them to bare scene numbers, BUT keep only
        // tokens whose script matches THIS group (so chunks aren't emitted in
        // a group they don't belong to).
        const thisScriptId = String(group.scriptId || '');
        const orderedHere = Array.isArray(sides.sceneOrder) && sides.sceneOrder.length
          ? sides.sceneOrder.map(tok => {
              const t = String(tok || '');
              if (!t.includes(':')) return normalizeSceneNumber(t);
              const [sid, sn] = t.split(':');
              if (thisScriptId && String(sid) !== thisScriptId) return null;
              return normalizeSceneNumber(sn);
            }).filter(sn => sn && requested.has(sn))
          : [];

        if (orderedHere.length) {
          // Dedup while preserving first-occurrence order. Track every page
          // already rendered in this version's PDF so a page shared by two
          // ordered scenes (e.g. scene 1 ends and scene 2A begins on the same
          // page) is rendered ONLY ONCE — credited to whichever scene reaches
          // it first in sceneOrder.
          const seenSn = new Set();
          const renderedPages = new Set();
          for (const sn of orderedHere) {
            if (seenSn.has(sn)) continue;
            seenSn.add(sn);
            const chunk = await renderCrossoutImages(
              pdfBuffer, pdfSceneMap, new Set([sn]), totalPages,
              { allSelectedScenes: allUserSelected, skipPages: renderedPages },
            );
            if (!chunk.length || !chunk[0].images.length) {
              console.warn(`[sides:multi] crossout rearrange: no fresh pages for scene ${sn} in ${label}`);
              continue;
            }
            const key = `${gi}:crossout:${sn}`;
            allScenes.push({
              sceneNumber: sn,
              heading: `Scene ${sn} (${label})`,
              rawText: '',
              sourceVersion: group.versionId, sourceScriptId: group.scriptId,
              sourceVersionLabel: label,
              imageKey: key,
            });
            allSceneImages.push({ key, sceneNumber: sn, images: chunk[0].images });
            for (const p of (chunk[0].pageNumbers || [])) renderedPages.add(p);
          }
          continue;
        }

        // Default crossout (no rearrange): one combined chunk per group.
        const crossImages = await renderCrossoutImages(pdfBuffer, pdfSceneMap, requested, totalPages);
        if (!crossImages.length || !crossImages[0].images.length) {
          console.warn(`[sides:multi] crossout produced no pages for version ${label}`);
          continue;
        }
        const key = `${gi}:__crossout__`;
        allScenes.push({
          sceneNumber: [...requested].join(', '),
          heading: `Scenes ${[...requested].join(', ')} (${label})`,
          rawText: '',
          sourceVersion: group.versionId, sourceScriptId: group.scriptId,
          sourceVersionLabel: label,
          imageKey: key,
        });
        allSceneImages.push({ key, sceneNumber: '__crossout__', images: crossImages[0].images });
        continue;
      }

      const renderSpecs = buildRenderSpecs(pdfSceneMap, requested, totalPages);
      if (renderSpecs.length === 0) {
        console.warn(`[sides:multi] no specs for version ${label}, requested ${[...requested].join(', ')}`);
        continue;
      }

      const sceneImages = await renderSceneImages(pdfBuffer, renderSpecs);

      for (const spec of renderSpecs) {
        const key = `${gi}:${spec.sceneNumber}`;
        allScenes.push({
          sceneNumber: spec.sceneNumber,
          heading: `${spec.sceneNumber} ${spec.heading.replace(/^\s*\d+[A-Za-z]?\s+/, '').replace(/\s+\d+[A-Za-z]?\s*$/, '').trim()}`,
          rawText: '',
          pageStart: spec.startPage,
          pageEnd: spec.endPage,
          sourceVersion: group.versionId, sourceScriptId: group.scriptId,
          sourceVersionLabel: label,
          imageKey: key,
        });
      }
      for (const si of sceneImages) {
        allSceneImages.push({ key: `${gi}:${si.sceneNumber}`, sceneNumber: si.sceneNumber, images: si.images });
      }
    }

    if (allScenes.length === 0) {
      throw new Error('No matching scenes found in the selected versions.');
    }

    sides.scenes = allScenes;
    sides.totalScenes = allScenes.length;
    sides.sceneNumbers = allScenes.map(s => s.sceneNumber);
    sides._sceneImages = allSceneImages;

    await attachScheduleImages(sides);

    await attachFolderImages(sides);
    const { buffer: pdfBuffer, scheduleStartPage: schedPage } = await generateSidesPdf(sides);
    const s3Key = `sides/${sides.script}/${sides._id}/sides.pdf`;
    await uploadFile(s3Key, pdfBuffer, 'application/pdf');
    sides.scheduleStartPage = schedPage;
    sides.pdfUrl = s3Key;

    sides.status = 'ready';
    await sides.save();
    emitSidesUpdated(sides);
  } catch (error) {
    sides.status = 'error';
    sides.error = error.message;
    await sides.save();
    emitSidesUpdated(sides);
    console.error('Multi-version sides extraction error:', error);
  }
}

/**
 * Diagnostic version of buildPdfSceneMap. Returns the same scene list AND
 * a per-line dump showing: every text line per page, whether it matched
 * the heading regex, the items breakdown (str + pdfX), and which detection
 * strategy produced the scene number (or none). Used by the debug endpoint.
 */
async function debugPdfSceneMap(pdfBuffer) {
  const pdfjs = await loadPdfjs();
  const data = bufferToUint8(pdfBuffer);
  const pdf = await pdfjs.getDocument({
    data, disableFontFace: true, useSystemFonts: false, isEvalSupported: false, standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;

  const HEADING_RE = /\b(?:INT\.?|EXT\.?|INT\/EXT\.?|I\/E\.?)\s+|\bSCENE\b/i;
  const SCENE_NUM_RE = /^(\d+[A-Za-z]{0,3})\.?$/;

  const pages = [];
  let scenesFound = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();

    // Group items into lines by Y coordinate (same algorithm as buildPdfSceneMap).
    const linesMap = [];
    for (const it of tc.items) {
      const str = (it.str || '').replace(/\s+/g, ' ');
      if (!str.trim()) continue;
      const pdfY = it.transform ? it.transform[5] : 0;
      const pdfX = it.transform ? it.transform[4] : 0;
      const h = it.height || 12;
      let line = linesMap.find(l => Math.abs(l.pdfY - pdfY) < 4);
      if (!line) {
        line = { pdfY, items: [], maxHeight: h, text: '' };
        linesMap.push(line);
      }
      line.items.push({ str: str.trim(), pdfX: Number(pdfX.toFixed(1)) });
      if (h > line.maxHeight) line.maxHeight = h;
    }
    for (const l of linesMap) {
      l.items.sort((a, b) => a.pdfX - b.pdfX);
      l.text = l.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
    }
    linesMap.sort((a, b) => b.pdfY - a.pdfY);

    const pageW = viewport.width || 612;
    const LEFT_MARGIN = pageW * 0.15;
    const RIGHT_MARGIN = pageW * 0.70;

    const pageDump = { page: p, pageWidth: pageW, leftMarginCutoff: LEFT_MARGIN, rightMarginCutoff: RIGHT_MARGIN, lines: [] };

    for (const line of linesMap) {
      const upper = line.text.toUpperCase();

      const leftMarginItem = line.items.find(it => it.pdfX < LEFT_MARGIN && SCENE_NUM_RE.test(it.str));
      const rightMarginItem = line.items.find(it => it.pdfX > RIGHT_MARGIN && SCENE_NUM_RE.test(it.str));
      const leftMatch = leftMarginItem && leftMarginItem.str.match(SCENE_NUM_RE);
      const rightMatch = rightMarginItem && rightMarginItem.str.match(SCENE_NUM_RE);
      const marginPair = leftMatch && rightMatch && leftMatch[1].toUpperCase() === rightMatch[1].toUpperCase();
      const matchesSlug = HEADING_RE.test(upper);
      const matchesHeading = matchesSlug || marginPair;

      const dump = {
        text: line.text,
        pdfY: Number(line.pdfY.toFixed(1)),
        items: line.items,
        matchesSlug,
        marginPair,
        matchesHeading,
      };

      if (matchesHeading) {
        let num = null;
        let detectedBy = null;

        if (leftMatch) { num = leftMatch[1]; detectedBy = 'leftMargin'; }
        if (!num && rightMatch) { num = rightMatch[1]; detectedBy = 'rightMargin'; }
        if (!num) {
          const leadingMatch = line.text.match(/^(\d+[A-Za-z]{0,3})\s+(?:INT|EXT|INT\/EXT|I\/E|SCENE)/i);
          if (leadingMatch) { num = leadingMatch[1]; detectedBy = 'inlineLead'; }
        }
        if (!num) {
          const lastItem = line.items[line.items.length - 1];
          if (lastItem && SCENE_NUM_RE.test(lastItem.str)) {
            const m = lastItem.str.match(SCENE_NUM_RE);
            if (m) { num = m[1]; detectedBy = 'trailingItem'; }
          }
        }

        if (num) num = num.toUpperCase().replace(/PT$/, '') || null;

        dump.sceneNumber = num;
        dump.detectedBy = detectedBy || 'none';
        scenesFound.push({ page: p, sceneNumber: num, heading: line.text, detectedBy: detectedBy || 'none' });
      }
      pageDump.lines.push(dump);
    }
    pages.push(pageDump);
    page.cleanup();
  }
  await pdf.cleanup();
  await pdf.destroy();

  const numbered = scenesFound.filter(s => s.sceneNumber);
  const survivors = numbered.length > 0 ? numbered : scenesFound.map((s, i) => ({ ...s, sceneNumber: String(i + 1), detectedBy: 'autoNumber' }));
  const dropped = numbered.length > 0 ? scenesFound.filter(s => !s.sceneNumber) : [];

  // Detection-strategy counts (helps spot patterns at a glance).
  const counts = scenesFound.reduce((acc, s) => {
    const k = s.detectedBy || 'none';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  return {
    summary: {
      totalPages: pdf.numPages,
      headingsDetected: scenesFound.length,
      numbered: numbered.length,
      droppedAsUnnumbered: dropped.length,
      autoNumberedFallback: numbered.length === 0 && scenesFound.length > 0,
      finalSceneCount: survivors.length,
      detectionStrategies: counts,
    },
    headings: scenesFound,
    dropped,
    survivors,
    pages, // every line on every page (verbose; useful for "why was X not detected as a heading?")
  };
}

/**
 * Shared post-processor used by BOTH the script-version scenes endpoint and
 * the Page (scene folder) scenes endpoint. Guarantees the two surfaces return
 * structurally identical scene lists — same dedup rule, same heading parse,
 * same intExt / location / timeOfDay / pageStart / pageEnd fields.
 *
 * Returns an array of:
 *   { sceneNumber, heading, intExt, location, timeOfDay, pageStart, pageEnd }
 */
function flattenPdfSceneMap(pdfSceneMap) {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < pdfSceneMap.length; i++) {
    const s = pdfSceneMap[i];
    if (!s.sceneNumber || seen.has(s.sceneNumber)) continue;
    seen.add(s.sceneNumber);

    // Find next different scene → pageEnd.
    let nextPage = s.pageNumber;
    for (let j = i + 1; j < pdfSceneMap.length; j++) {
      if (pdfSceneMap[j].sceneNumber !== s.sceneNumber) {
        nextPage = pdfSceneMap[j].pageNumber;
        break;
      }
    }

    const heading = s.heading || '';
    const match = heading.match(
      /^(?:\d+[A-Za-z]?[\s.\/)]+\s*)?(INT|EXT|INT\/EXT|I\/E)[.\s]+(.+?)(?:\s*[-–—]\s*(.+))?$/i
    );

    out.push({
      sceneNumber: s.sceneNumber,
      heading: heading.replace(/\s+\d+[A-Za-z]?\s*$/, '').trim() || `Scene ${s.sceneNumber}`,
      intExt: match ? match[1].toUpperCase() : '',
      location: match ? match[2].trim() : '',
      timeOfDay: match && match[3] ? match[3].trim() : '',
      pageStart: s.pageNumber,
      pageEnd: nextPage,
    });
  }
  return out;
}

module.exports = { extractSides, extractSidesWithAI, extractSidesMultiVersion, generateSidesPdf, buildSceneMap, buildPdfSceneMap, debugPdfSceneMap, flattenPdfSceneMap };
