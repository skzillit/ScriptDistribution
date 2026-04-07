const PDFDocument = require('pdfkit');
const ScriptPage = require('../models/ScriptPage');
const Sides = require('../models/Sides');
const { uploadFile } = require('./storage.service');

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

    // Normalize requested scene numbers
    const requestedScenes = new Set(
      sceneNumbers.map(s => String(s).trim().toUpperCase())
    );

    // Extract only the requested scenes — exact match only
    const matchedScenes = sceneMap.filter(s => requestedScenes.has(s.sceneNumber));

    if (matchedScenes.length === 0) {
      const available = sceneMap.map(s => s.sceneNumber).join(', ');
      throw new Error(
        `No matching scenes found for: ${[...requestedScenes].join(', ')}. `
        + `Available scenes in script: ${available}`
      );
    }

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
        rawText,
        pageStart: scene.pageStart,
        pageEnd: scene.pageEnd,
      };
    });

    sides.scenes = extractedScenes;
    sides.totalScenes = extractedScenes.length;
    sides.sceneNumbers = extractedScenes.map(s => s.sceneNumber);

    // Generate PDF
    const pdfBuffer = await generateSidesPdf(sides);
    const s3Key = `sides/${sides.script}/${sides._id}/sides.pdf`;
    await uploadFile(s3Key, pdfBuffer, 'application/pdf');
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
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 50, bottom: 50, left: 60, right: 60 },
    });

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title page
    doc.font('Courier-Bold').fontSize(18);
    doc.text('SIDES', { align: 'center' });
    doc.moveDown(0.5);

    doc.font('Courier').fontSize(14);
    doc.text(sides.title, { align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(11);
    doc.text(`Scenes: ${sides.sceneNumbers.join(', ')}`, { align: 'center' });
    doc.moveDown(0.3);
    doc.text(`${sides.totalScenes} scene(s)`, { align: 'center' });
    doc.moveDown(0.3);

    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    doc.text(dateStr, { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(9).fillColor('#666666');
    doc.text('Generated by ScriptDistribution', { align: 'center' });
    doc.fillColor('#000000');

    // Scenes (continuous, no page break per scene)
    doc.addPage();
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

    // Positions matching HTML: char names at x=326 (37*7.2+60), dialogue at x=240 (25*7.2+60), paren at x=283 (31*7.2+60)
    const X_LEFT = 60;
    const X_CHAR = 240;   // character names
    const X_PAREN = 220;  // parentheticals
    const X_DIAL = 200;   // dialogue
    const W_CHAR = 200;
    const W_PAREN = 180;
    const W_DIAL = 240;

    let prevType = '';
    for (const scene of sides.scenes) {
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
          doc.text(trimmed, X_DIAL, y, { width: W_DIAL });
          y += doc.heightOfString(trimmed, { width: W_DIAL }) + 2;
          prevType = 'dialogue';
        } else {
          doc.text(trimmed, X_LEFT, y, { width: 492 });
          y += doc.heightOfString(trimmed, { width: 492 }) + 2;
          prevType = 'action';
        }
      }
      // Separator line between scenes
      y += 8;
      doc.moveTo(60, y).lineTo(552, y).stroke('#CCCCCC');
      y += 16;
    }

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
          if (doc.y > 680) { doc.addPage(); }

          // Scene heading
          doc.font('Courier-Bold').fontSize(12);
          doc.text(s.sceneNumber || '', { continued: false });
          doc.font('Courier').fontSize(11);
          doc.text(`${s.intExt || ''}  ${s.location || ''}  ${s.timeOfDay || ''}  ${s.pages || ''}`);
          if (s.synopsis) { doc.fontSize(10).text(s.synopsis); }
          doc.moveDown(0.3);

          // Sections in 2-column layout (matching HTML 48% width)
          const activeSections = schedSections.filter(sec => s[sec.key]?.length > 0);
          const colX1 = 60;
          const colX2 = 310;
          const colW = 230;

          for (let si = 0; si < activeSections.length; si += 2) {
            if (doc.y > 680) { doc.addPage(); }
            const startY = doc.y;
            let maxY = startY;

            // Left column
            const left = activeSections[si];
            doc.font('Courier-Bold').fontSize(10);
            doc.text(left.label, colX1, startY, { width: colW, underline: true });
            doc.font('Courier').fontSize(10);
            left.items = s[left.key];
            left.items.forEach(item => doc.text(item, colX1, doc.y, { width: colW }));
            maxY = Math.max(maxY, doc.y);

            // Right column (if exists)
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

    // Generate PDF
    const pdfBuffer = await generateSidesPdf(sides);
    const s3Key = `sides/${sides.script}/${sides._id}/sides.pdf`;
    await uploadFile(s3Key, pdfBuffer, 'application/pdf');
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
