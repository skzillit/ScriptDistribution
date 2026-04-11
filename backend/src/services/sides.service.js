const PDFDocument = require('pdfkit');
const ScriptPage = require('../models/ScriptPage');
const Sides = require('../models/Sides');
const { uploadFile, getFileBuffer, getScriptPdfKey } = require('./storage.service');

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
    data, disableFontFace: true, useSystemFonts: false, isEvalSupported: false,
  }).promise;

  const HEADING_RE = /\b(INT\.?|EXT\.?|INT\/EXT\.?|I\/E\.?)\s+/i;
  const SCENE_NUM_RE = /^(\d+[A-Za-z]{0,3})\.?$/;   // pure scene-number token
  const scenes = [];
  const totalPages = pdf.numPages;

  for (let p = 1; p <= totalPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();

    // Group items into lines by PDF-space Y (bottom-up).
    const linesMap = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const pdfY = it.transform ? it.transform[5] : 0;
      const pdfX = it.transform ? it.transform[4] : 0;
      const h = it.height || 12;
      const w = it.width || 0;
      let line = linesMap.find(l => Math.abs(l.pdfY - pdfY) < 2);
      if (!line) {
        line = { pdfY, items: [], maxHeight: h, text: '' };
        linesMap.push(line);
      }
      line.items.push({ str: it.str.trim(), pdfX, pdfW: w });
      if (h > line.maxHeight) line.maxHeight = h;
    }
    for (const l of linesMap) {
      l.items.sort((a, b) => a.pdfX - b.pdfX);
      l.text = l.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
    }
    linesMap.sort((a, b) => b.pdfY - a.pdfY); // top→bottom

    // Page width for margin detection (PDF units)
    const pageW = viewport.width || 612;
    const LEFT_MARGIN = pageW * 0.15;   // left 15% = left margin zone
    const RIGHT_MARGIN = pageW * 0.70;  // beyond 70% = right margin zone

    for (const line of linesMap) {
      const upper = line.text.toUpperCase();
      if (!HEADING_RE.test(upper)) continue;

      // SCENE NUMBER EXTRACTION — only trust digit-only items at LEFT or RIGHT margin
      // (inline numbers within heading text are NOT scene numbers — they could be years,
      // addresses, phone numbers, etc.)
      let num = null;

      // Check for a digit-only item at the left margin (before the heading's first non-digit text)
      // Scene number items are typically separated from the heading by significant whitespace.
      const leftMarginItem = line.items.find(it => it.pdfX < LEFT_MARGIN && SCENE_NUM_RE.test(it.str));
      if (leftMarginItem) {
        const m = leftMarginItem.str.match(SCENE_NUM_RE);
        if (m) num = m[1];
      }

      // Check for a digit-only item at the right margin
      if (!num) {
        const rightMarginItem = line.items.find(it => it.pdfX > RIGHT_MARGIN && SCENE_NUM_RE.test(it.str));
        if (rightMarginItem) {
          const m = rightMarginItem.str.match(SCENE_NUM_RE);
          if (m) num = m[1];
        }
      }

      // Fallback: text-level leading (only if leading is BEFORE any INT./EXT. and is followed
      // by whitespace, meaning it's clearly a scene number not part of the heading text)
      if (!num) {
        const leadingMatch = line.text.match(/^(\d+[A-Za-z]{0,3})\s+(INT|EXT|INT\/EXT|I\/E)/i);
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

      if (!num) continue;

      // Strip PT (part) suffix — "107PT" → "107"
      num = num.toUpperCase().replace(/PT$/, '');
      if (!num) continue;

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
  return scenes;
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
async function renderSceneImages(pdfBuffer, renderSpecs) {
  const pdfjs = await loadPdfjs();
  const { createCanvas } = require('@napi-rs/canvas');
  const SCALE = 2;
  const PADDING_TOP = 18;
  const PADDING_BOTTOM = 6;
  const PADDING_FOOTER = 10;

  const data = bufferToUint8(pdfBuffer);
  const pdf = await pdfjs.getDocument({
    data, disableFontFace: true, useSystemFonts: false, isEvalSupported: false,
  }).promise;
  const totalPages = pdf.numPages;

  // Detect the page's content area (exclude page headers, page numbers, and page footers).
  // Uses POSITION-based detection: every text line in the top ~10% or bottom ~8% of the page
  // is treated as header/footer regardless of its content. This handles mixed-format headers
  // like "SHOW DOGS DIRECTOR'S CUT SCRIPT 07.09.2017                  2." that don't match
  // simple regex patterns.
  // Returns { contentTop, contentBottom } in canvas pixels (scaled).
  async function detectPageContentBounds(page, viewport, tc) {
    const TOP_ZONE_RATIO = 0.10;    // top 10% → header zone
    const BOTTOM_ZONE_RATIO = 0.08; // bottom 8% → footer zone

    // Group items into lines by PDF-space Y
    const lines = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const pdfY = it.transform ? it.transform[5] : 0;
      const pdfX = it.transform ? it.transform[4] : 0;
      const h = it.height || 12;
      let line = lines.find(l => Math.abs(l.pdfY - pdfY) < 2);
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
    const bottomZoneBoundary = viewport.height * (1 - BOTTOM_ZONE_RATIO);

    // Push contentTop BELOW every text line in the top zone
    let contentTop = 0;
    for (const line of lines) {
      const baselineY = viewport.height - line.pdfY * SCALE;
      if (baselineY > topZoneBoundary) break; // out of top zone
      // Push contentTop past this line (below its baseline + small pad)
      const lineBottom = baselineY + 4;
      if (lineBottom > contentTop) contentTop = lineBottom;
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
 * Build render specs from the PDF scene map, filtered by requested scene numbers.
 * Each spec describes EXACTLY what to render for one requested scene:
 *   - startPage, startPdfY, startFontHeightPdf — where the scene begins
 *   - endPage, endPdfY, endFontHeightPdf — where to stop (the next scene's heading, or end of PDF)
 * Deduplicates: keeps only the FIRST occurrence of each scene number in the PDF.
 */
function buildRenderSpecs(pdfSceneMap, requestedSceneNumbers, totalPages) {
  const specs = [];
  const seen = new Set();
  const requested = new Set(
    Array.from(requestedSceneNumbers).map(s => String(s).toUpperCase().replace(/PT$/, ''))
  );

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
    data, disableFontFace: true, useSystemFonts: false, isEvalSupported: false,
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
      let line = linesMap.find(l => Math.abs(l.pdfY - pdfY) < 2);
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
async function extractSides(sidesId, versionId, sceneNumbers) {
  const sides = await Sides.findById(sidesId);
  if (!sides) return;

  try {
    sides.status = 'generating';
    await sides.save();

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

    if (sceneMap.length === 0) {
      throw new Error('No scenes detected in the script. Ensure the script has standard scene headings (INT./EXT.).');
    }

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
        disableFontFace: true, useSystemFonts: false, isEvalSupported: false,
      }).promise;
      const pdfTotalPages = probeDoc.numPages;
      await probeDoc.destroy();

      // Build render specs from PDF scene map
      const renderSpecs = buildRenderSpecs(pdfSceneMap, requestedScenes, pdfTotalPages);

      console.log('[sides] PDF scene map found:', pdfSceneMap.map(s => `${s.sceneNumber}@p${s.pageNumber}`).join(', '));
      console.log('[sides] Requested scenes:', Array.from(requestedScenes).join(', '));
      console.log('[sides] Render specs:', renderSpecs.map(s => `${s.sceneNumber}(p${s.startPage}-${s.endPage})`).join(', '));
      // Verbose: show each found heading's full text
      console.log('[sides] Heading details:');
      for (const s of pdfSceneMap) {
        console.log(`  p${s.pageNumber} scene=${s.sceneNumber} heading="${s.heading.slice(0, 80)}"`);
      }

      if (renderSpecs.length > 0) {
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

    // If neither the PDF-based nor text-based scene detection found anything, fail.
    if (!imageRenderingSucceeded && matchedScenes.length === 0) {
      const available = sceneMap.map(s => s.sceneNumber).join(', ');
      throw new Error(
        `No matching scenes found for: ${[...requestedScenes].join(', ')}. `
        + `Available scenes in script: ${available}`
      );
    }

    // Render shooting schedule scenes as images from the original schedule PDF.
    // Same image-based approach as script scenes — falls back to text rendering on error.
    try {
      if (sides.shootingSchedule) {
        const ShootingSchedule = require('../models/ShootingSchedule');
        const schedule = await ShootingSchedule.findById(sides.shootingSchedule);
        if (schedule?.pdfUrl) {
          const schedPdfBuffer = await getFileBuffer(schedule.pdfUrl);
          const schedSceneMap = await buildSchedulePdfSceneMap(schedPdfBuffer);

          // Probe total page count
          const pdfjsMod = await loadPdfjs();
          const schedProbe = await pdfjsMod.getDocument({
            data: bufferToUint8(schedPdfBuffer),
            disableFontFace: true, useSystemFonts: false, isEvalSupported: false,
          }).promise;
          const schedTotalPages = schedProbe.numPages;
          await schedProbe.destroy();

          // Collect ALL scene numbers from shootDayInfo (primary + extra days)
          const schedRequestedScenes = new Set();
          for (const day of sides.shootDayInfo || []) {
            for (const s of day.scenes || []) {
              if (s.sceneNumber) {
                schedRequestedScenes.add(String(s.sceneNumber).toUpperCase().replace(/PT$/, ''));
              }
            }
          }

          const schedSpecs = buildRenderSpecs(schedSceneMap, schedRequestedScenes, schedTotalPages);
          console.log('[sides] Schedule scene map:', schedSceneMap.map(s => `${s.sceneNumber}@p${s.pageNumber}`).join(', '));
          console.log('[sides] Schedule requested:', Array.from(schedRequestedScenes).join(', '));
          console.log('[sides] Schedule render specs:', schedSpecs.map(s => `${s.sceneNumber}(p${s.startPage}-${s.endPage})`).join(', '));

          if (schedSpecs.length > 0) {
            const schedImages = await renderSceneImages(schedPdfBuffer, schedSpecs);
            sides._scheduleImages = schedImages;
          } else {
            console.warn('[sides] Schedule render specs empty — text fallback will be used');
            sides._scheduleImages = null;
          }
        }
      }
    } catch (err) {
      console.warn('[sides] Schedule image rendering failed, falling back to text:', err.message);
      sides._scheduleImages = null;
    }

    // Generate PDF
    const { buffer: pdfBuffer, scheduleStartPage: schedPage } = await generateSidesPdf(sides);
    const s3Key = `sides/${sides.script}/${sides._id}/sides.pdf`;
    await uploadFile(s3Key, pdfBuffer, 'application/pdf');
    sides.scheduleStartPage = schedPage;
    sides.pdfUrl = s3Key;

    sides.status = 'ready';
    await sides.save();
  } catch (error) {
    sides.status = 'error';
    sides.error = error.message;
    await sides.save();
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

    // No title page — sides content starts directly on page 1 (auto-created)
    doc.font('Courier-Bold').fontSize(9).fillColor('#999999');
    doc.text('SIDES', 60, 30);
    doc.text(sides.title, 200, 30, { align: 'right', width: 340 });
    doc.fillColor('#000000');
    doc.moveTo(60, 45).lineTo(552, 45).stroke('#CCCCCC');

    doc.font('Courier').fontSize(12);
    let y = 55;

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

    // Build a quick lookup of pre-rendered scene images by sceneNumber
    const imagesBySceneNumber = {};
    if (Array.isArray(sides._sceneImages)) {
      for (const si of sides._sceneImages) imagesBySceneNumber[si.sceneNumber] = si.images || [];
    }

    const PAGE_BOTTOM = 750;
    const TARGET_W = 492;
    let prevType = '';

    for (const scene of sides.scenes) {
      const sceneImages = imagesBySceneNumber[scene.sceneNumber];

      if (sceneImages && sceneImages.length > 0) {
        // ─── IMAGE PATH: embed cropped page images ───
        for (const imgBuffer of sceneImages) {
          // openImage gives us natural width/height
          let img;
          try {
            img = doc.openImage(imgBuffer);
          } catch (e) {
            console.error('openImage failed for scene', scene.sceneNumber, e.message);
            continue;
          }
          const targetH = (img.height / img.width) * TARGET_W;
          // If image is taller than a single page, scale down to fit one page max
          const remaining = PAGE_BOTTOM - y;
          if (targetH > PAGE_BOTTOM - 55) {
            // Fits on its own page — start a fresh page
            if (y > 55) {
              doc.addPage();
              doc.font('Courier-Bold').fontSize(9).fillColor('#999999');
              doc.text('SIDES (cont.)', 60, 30);
              doc.fillColor('#000000');
              doc.moveTo(60, 45).lineTo(552, 45).stroke('#CCCCCC');
              y = 55;
            }
            // Scale to fit page height
            const maxH = PAGE_BOTTOM - 55;
            const scaledH = Math.min(targetH, maxH);
            const scaledW = (img.width / img.height) * scaledH;
            const xCentered = 60 + (TARGET_W - scaledW) / 2;
            doc.image(imgBuffer, xCentered, y, { width: scaledW, height: scaledH });
            y += scaledH + 8;
          } else {
            if (targetH > remaining) {
              doc.addPage();
              doc.font('Courier-Bold').fontSize(9).fillColor('#999999');
              doc.text('SIDES (cont.)', 60, 30);
              doc.fillColor('#000000');
              doc.moveTo(60, 45).lineTo(552, 45).stroke('#CCCCCC');
              y = 55;
            }
            doc.image(imgBuffer, 60, y, { width: TARGET_W });
            y += targetH + 8;
          }
        }
      } else {
        // ─── FALLBACK TEXT PATH: original line-by-line text rendering ───
        const lines = scene.rawText.split('\n');
        for (const line of lines) {
          if (y > 720) {
            doc.addPage();
            doc.font('Courier-Bold').fontSize(9).fillColor('#999999');
            doc.text('SIDES (cont.)', 60, 30);
            doc.fillColor('#000000');
            doc.moveTo(60, 45).lineTo(552, 45).stroke('#CCCCCC');
            doc.font('Courier').fontSize(12);
            y = 55;
          }
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

      // Separator line between scenes
      y += 8;
      if (y > PAGE_BOTTOM) {
        doc.addPage();
        y = 55;
      }
      doc.moveTo(60, y).lineTo(552, y).stroke('#CCCCCC');
      y += 16;
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

    // Build a lookup: sceneNumber → schedule images (normalized via PT strip)
    const scheduleImagesLookup = {};
    if (Array.isArray(sides._scheduleImages)) {
      for (const si of sides._scheduleImages) {
        scheduleImagesLookup[si.sceneNumber] = si.images || [];
      }
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
          const normSceneNum = String(s.sceneNumber || '').toUpperCase().replace(/PT$/, '');
          const sceneImages = scheduleImagesLookup[normSceneNum];

          if (sceneImages && sceneImages.length > 0) {
            // ─── IMAGE PATH: embed cropped schedule pages ───
            const TARGET_W = 492;
            const PAGE_BOTTOM = 750;
            for (const imgBuffer of sceneImages) {
              let img;
              try {
                img = doc.openImage(imgBuffer);
              } catch (e) {
                console.error('Schedule openImage failed for scene', normSceneNum, e.message);
                continue;
              }
              const targetH = (img.height / img.width) * TARGET_W;
              const remaining = PAGE_BOTTOM - doc.y;
              if (targetH > PAGE_BOTTOM - 55) {
                // Larger than a single page — start fresh page and scale down
                if (doc.y > 55) doc.addPage();
                const maxH = PAGE_BOTTOM - 55;
                const scaledH = Math.min(targetH, maxH);
                const scaledW = (img.width / img.height) * scaledH;
                const xCentered = 60 + (TARGET_W - scaledW) / 2;
                doc.image(imgBuffer, xCentered, doc.y, { width: scaledW, height: scaledH });
                doc.y += scaledH + 8;
              } else {
                if (targetH > remaining) doc.addPage();
                doc.image(imgBuffer, 60, doc.y, { width: TARGET_W });
                doc.y += targetH + 8;
              }
            }
            if (doc.y > PAGE_BOTTOM) doc.addPage();
            doc.moveTo(60, doc.y).lineTo(552, doc.y).stroke('#DDDDDD');
            doc.moveDown(0.5);
          } else {
            // ─── FALLBACK TEXT PATH: original text-based rendering per scene ───
            if (doc.y > 680) { doc.addPage(); }

            doc.font('Courier-Bold').fontSize(12);
            doc.text(s.sceneNumber || '', { continued: false });
            doc.font('Courier').fontSize(11);
            doc.text(`${s.intExt || ''}  ${s.location || ''}  ${s.timeOfDay || ''}  ${s.pages || ''}`);
            if (s.synopsis) { doc.fontSize(10).text(s.synopsis); }
            doc.moveDown(0.3);

            const activeSections = schedSections.filter(sec => s[sec.key]?.length > 0);
            const colX1 = 60;
            const colX2 = 310;
            const colW = 230;

            for (let si = 0; si < activeSections.length; si += 2) {
              if (doc.y > 680) { doc.addPage(); }
              const startY = doc.y;
              let maxY = startY;

              const left = activeSections[si];
              doc.font('Courier-Bold').fontSize(10);
              doc.text(left.label, colX1, startY, { width: colW, underline: true });
              doc.font('Courier').fontSize(10);
              left.items = s[left.key];
              left.items.forEach(item => doc.text(item, colX1, doc.y, { width: colW }));
              maxY = Math.max(maxY, doc.y);

              if (si + 1 < activeSections.length) {
                const right = activeSections[si + 1];
                doc.font('Courier-Bold').fontSize(10);
                doc.text(right.label, colX2, startY, { width: colW, underline: true });
                doc.font('Courier').fontSize(10);
                s[right.key].forEach(item => doc.text(item, colX2, doc.y, { width: colW }));
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

    doc.moveDown(2);
    doc.font('Courier').fontSize(9).fillColor('#999999');
    doc.text('*** END OF SIDES ***', { align: 'center' });

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
        disableFontFace: true, useSystemFonts: false, isEvalSupported: false,
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
    const { buffer: pdfBuffer, scheduleStartPage: schedPage } = await generateSidesPdf(sides);
    const s3Key = `sides/${sides.script}/${sides._id}/sides.pdf`;
    await uploadFile(s3Key, pdfBuffer, 'application/pdf');
    sides.scheduleStartPage = schedPage;
    sides.pdfUrl = s3Key;

    sides.status = 'ready';
    await sides.save();
  } catch (error) {
    sides.status = 'error';
    sides.error = error.message;
    await sides.save();
    console.error('AI Sides extraction error:', error);
  }
}

module.exports = { extractSides, extractSidesWithAI, generateSidesPdf, buildSceneMap };
