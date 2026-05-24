/**
 * Final Draft (.fdx) support.
 *
 * FDX is an XML screenplay format. Our sides pipeline renders cropped images
 * from a real PDF, so we convert FDX → a screenplay-formatted PDF (via pdfkit)
 * and feed that PDF through the existing upload/extraction/sides pipeline.
 *
 * Scene headings are rendered with their scene number at BOTH the left and
 * right margins so `buildPdfSceneMap` (which trusts digit tokens in the margin
 * zones) reliably detects them. When the FDX has no scene numbers, we
 * auto-number scene headings sequentially (1, 2, 3 …).
 */

const PDFDocument = require('pdfkit');

function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&'); // last, so we don't double-decode
}

/**
 * Parse an FDX XML string into an ordered list of paragraphs:
 *   [{ type, text, sceneNumber? }]
 * type ∈ Scene Heading | Action | Character | Parenthetical | Dialogue | Transition | General
 */
function parseFdx(xml) {
  // Restrict to the script body (ignore TitlePage paragraphs).
  const contentMatch = xml.match(/<Content\b[^>]*>([\s\S]*?)<\/Content>/i);
  const body = contentMatch ? contentMatch[1] : xml;

  const paragraphs = [];
  let autoScene = 0;
  const paraRe = /<Paragraph\b([^>]*)>([\s\S]*?)<\/Paragraph>/gi;
  let m;
  while ((m = paraRe.exec(body)) !== null) {
    const attrs = m[1] || '';
    const inner = m[2] || '';

    const typeMatch = attrs.match(/\bType="([^"]*)"/i);
    const type = typeMatch ? typeMatch[1] : 'Action';

    // Concatenate all <Text>…</Text> runs, strip inner tags, decode entities.
    let text = '';
    const textRe = /<Text\b[^>]*>([\s\S]*?)<\/Text>/gi;
    let t;
    while ((t = textRe.exec(inner)) !== null) {
      text += t[1];
    }
    text = decodeEntities(text.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

    if (!text) continue;

    let sceneNumber;
    if (/scene heading/i.test(type)) {
      const snMatch = inner.match(/<SceneProperties\b[^>]*\bNumber="([^"]*)"/i)
        || attrs.match(/\bNumber="([^"]*)"/i);
      autoScene += 1;
      sceneNumber = (snMatch && snMatch[1].trim()) ? snMatch[1].trim() : String(autoScene);
    }

    paragraphs.push({ type, text, sceneNumber });
  }

  return paragraphs;
}

/**
 * Convert an FDX XML string to a screenplay-formatted PDF Buffer.
 * Returns { buffer, sceneCount }.
 */
function fdxToPdf(xml) {
  const paragraphs = parseFdx(xml);

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 72, bottom: 72, left: 54, right: 54 } });
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve({
      buffer: Buffer.concat(chunks),
      sceneCount: paragraphs.filter(p => p.sceneNumber).length,
    }));
    doc.on('error', reject);

    // LETTER = 612pt wide. Content band 54..558. Margin zones for detection:
    // left < 91.8 (15%), right > 428 (70%). We place scene numbers at x=54 and x=560.
    const LEFT = 54;
    const RIGHT_NUM_X = 560;
    const PAGE_BOTTOM = 720;
    const HEADING_X = 90;       // heading text indented past the left scene number
    const CHAR_X = 230;
    const PAREN_X = 190;
    const DIAL_X = 150;
    const DIAL_W = 270;
    const FULL_W = 504;

    doc.font('Courier').fontSize(12);
    let y = 72;

    const ensure = (need) => {
      if (y + need > PAGE_BOTTOM) { doc.addPage(); y = 72; }
    };

    for (const p of paragraphs) {
      const type = (p.type || '').toLowerCase();

      if (type.includes('scene heading')) {
        ensure(28);
        y += 8; // blank line before scene
        doc.font('Courier-Bold').fontSize(12);
        const num = p.sceneNumber || '';
        // Left margin scene number
        if (num) doc.text(num, LEFT, y, { lineBreak: false, width: 30 });
        // Heading text
        doc.text(p.text.toUpperCase(), HEADING_X, y, { width: FULL_W - (HEADING_X - LEFT), lineBreak: false });
        // Right margin scene number
        if (num) doc.text(num, RIGHT_NUM_X, y, { lineBreak: false, width: 30 });
        const h = doc.heightOfString(p.text.toUpperCase(), { width: FULL_W - (HEADING_X - LEFT) });
        y += Math.max(h, 14) + 6;
        doc.font('Courier').fontSize(12);
      } else if (type.includes('character')) {
        ensure(18);
        y += 6;
        doc.text(p.text.toUpperCase(), CHAR_X, y, { width: FULL_W - (CHAR_X - LEFT), lineBreak: false });
        y += 14;
      } else if (type.includes('parenthetical')) {
        ensure(16);
        doc.text(p.text, PAREN_X, y, { width: 200 });
        y += doc.heightOfString(p.text, { width: 200 }) + 2;
      } else if (type.includes('dialogue')) {
        ensure(16);
        doc.text(p.text, DIAL_X, y, { width: DIAL_W });
        y += doc.heightOfString(p.text, { width: DIAL_W }) + 4;
      } else if (type.includes('transition')) {
        ensure(18);
        y += 6;
        doc.text(p.text.toUpperCase(), LEFT, y, { width: FULL_W, align: 'right' });
        y += 16;
      } else {
        // Action / General
        ensure(16);
        doc.text(p.text, LEFT, y, { width: FULL_W });
        y += doc.heightOfString(p.text, { width: FULL_W }) + 6;
      }
    }

    doc.end();
  });
}

module.exports = { parseFdx, fdxToPdf };
