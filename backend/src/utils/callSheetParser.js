/**
 * Parses call sheet text to extract scene numbers and metadata.
 * Only extracts scenes from pages 1-2 (the scene listing area).
 * Pages 3+ (crew, transport, etc.) are ignored for scene extraction.
 */

// Page break markers — call sheets typically repeat a confidential header on each page
const PAGE_BREAK_PATTERNS = [
  /This\s+Document\s+is\s+highly\s+confidential/i,
  /All\s+callsheets\s+are\s+to\s+be\s+shredded/i,
];

/**
 * Split raw text into pages by detecting repeated headers.
 */
function splitIntoPages(rawText) {
  const lines = rawText.split('\n');
  const pages = [];
  let currentPage = [];
  let pageNum = 1;

  for (const line of lines) {
    // Check if this line starts a new page (confidential header repeats)
    if (pageNum > 1 || currentPage.length > 20) {
      const isPageBreak = PAGE_BREAK_PATTERNS.some(p => p.test(line));
      if (isPageBreak && currentPage.length > 10) {
        pages.push({ pageNum, text: currentPage.join('\n') });
        pageNum++;
        currentPage = [line];
        continue;
      }
    }
    currentPage.push(line);
  }
  if (currentPage.length > 0) {
    pages.push({ pageNum, text: currentPage.join('\n') });
  }
  return pages;
}

/**
 * Extract scenes ONLY from the scene listing section on pages 1-2.
 */
function parseCallSheetText(rawText) {
  const pages = splitIntoPages(rawText);

  // Only use pages 1 and 2 for scene extraction
  let sceneText = pages
    .filter(p => p.pageNum <= 2)
    .map(p => p.text)
    .join('\n');

  // Cut off at "Advanced Schedule" if present — scenes after this are for future days
  const advIdx = sceneText.search(/Advanced\s+Schedule/i);
  if (advIdx > 0) {
    sceneText = sceneText.substring(0, advIdx);
  }

  const scenes = extractScenesFromText(sceneText);
  const metadata = extractMetadata(rawText); // metadata from full text is ok
  const sceneNumbers = scenes.map(s => s.sceneNumber);

  return { scenes, metadata, sceneNumbers };
}

/**
 * Extract scene entries from the scene listing section text.
 * Call sheet format typically:
 *   SC. SET / SYNOPSIS D/N PAGE CAST# DOGS# LOC
 *   109
 *   INT CARGO HANGAR
 *   Description text
 *   Night
 *   6
 *   3/8
 * Or: "SC. 25" or "Sc. 12A"
 */
function extractScenesFromText(text) {
  const lines = text.split('\n');
  const scenes = [];
  let inSceneSection = false;

  // Find the scene section header: "SC." or "SCENE" header row
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Stop at CAST section header, Total Pages, or crew section — scenes are done.
    // "CAST#" and "CAST MEMBERS" in scene column headers should NOT trigger this cutoff.
    if (inSceneSection && (
      /^CAST\s*$/i.test(line) ||                    // standalone "CAST" line (section header)
      /^CAST\s+No\b/i.test(line) ||                 // "CAST No Artist..." table header
      /^Total\s+pages/i.test(line) ||                // "Total pages 2 6/8"
      /^CREW\s*$/i.test(line) ||                     // standalone "CREW" section
      /^EXTRAS\s*$/i.test(line) ||                   // standalone "EXTRAS" section
      /^STAND-?INS?\s*$/i.test(line)                 // standalone "STAND-INS" section
    )) {
      break;
    }

    // Detect start of scene listing section
    if (/^SC\.\s+SET/i.test(line) || /^SCENE\s+/i.test(line) || /^SC\.\s+.*D\/N/i.test(line)
        || /\bSC\b.*\bSET\b/i.test(line) || /\bSC\b.*\bD\/N\b/i.test(line) || /\bSCENE\b.*\bSYNOPSIS\b/i.test(line)) {
      inSceneSection = true;
      continue;
    }

    if (!inSceneSection) continue;

    // Scene RANGE: "60-66" or "60-66p/up" — expand to individual scene numbers
    const rangeMatch = line.match(/^(\d{1,4})\s*[-–]\s*(\d{1,4})\s*(p\/up|pt\d?|pickup)?\s*$/i);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1]);
      const end = parseInt(rangeMatch[2]);
      // Lookahead for INT/EXT heading
      let heading = '', intExt = '', location = '', timeOfDay = '';
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const peek = lines[j].trim();
        if (!peek || /^p\/up$/i.test(peek) || /^pt\d?$/i.test(peek)) continue;
        if (/^(INT|EXT|INT\/EXT|EXT\/INT|I\/E)[.\s]+/i.test(peek)) {
          heading = peek;
          const locMatch = peek.match(/^(INT|EXT|INT\/EXT|EXT\/INT|I\/E)[.\s]+(.+?)(?:\s*[-–]\s*(.+))?$/i);
          if (locMatch) { intExt = locMatch[1].toUpperCase(); location = locMatch[2].trim(); timeOfDay = locMatch[3]?.trim() || ''; }
          break;
        }
        break;
      }
      if (start <= end && end - start < 20) {
        for (let n = start; n <= end; n++) {
          scenes.push({ sceneNumber: String(n), heading, description: '', intExt, location, timeOfDay, pages: '', cast: [], notes: '' });
        }
      }
      continue;
    }

    // A scene number line: standalone number (2+ digits) optionally followed by letter suffix (pt, pt2, A, B)
    // MUST be followed within 1-3 lines by an INT/EXT heading to confirm it's a real scene
    const sceneNumMatch = line.match(/^(\d{2,4}[A-Za-z]{0,4})\s*$/);
    if (sceneNumMatch) {
      // Lookahead: check if INT/EXT appears within 5 non-empty lines
      // Skip "p/up", "pt2", "pickup" lines (they're markers, not headings)
      let hasHeading = false;
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const peek = lines[j].trim();
        if (!peek) continue;
        if (/^(p\/up|pt\d?|pickup)$/i.test(peek)) continue; // skip pickup/part markers
        if (/^(INT|EXT|INT\/EXT|EXT\/INT|I\/E)[.\s]+/i.test(peek)) { hasHeading = true; break; }
        if (/^\d{1,4}[A-Za-z]{0,4}\s*$/.test(peek)) break; // another number, not a heading
        break; // any other text — not a heading
      }
      if (!hasHeading) continue; // Skip — not a real scene number

      // Normalize: strip pt/pt2 suffix
      const sceneNumber = sceneNumMatch[1].replace(/pt\d?$/i, '');
      let heading = '', intExt = '', location = '', timeOfDay = '', description = '', pages = '';
      let cast = [];

      for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
        const nextLine = lines[j].trim();
        if (!nextLine) continue;

        // Another confirmed scene number — stop
        if (/^\d{2,4}[A-Za-z]{0,3}\s*$/.test(nextLine)) {
          // Only stop if this next number also has INT/EXT after it
          let nextHasHeading = false;
          for (let k = j + 1; k < Math.min(j + 5, lines.length); k++) {
            const pk = lines[k].trim();
            if (!pk) continue;
            if (/^(INT|EXT|INT\/EXT|EXT\/INT|I\/E)[.\s]+/i.test(pk)) { nextHasHeading = true; break; }
            break;
          }
          if (nextHasHeading) break;
        }

        // INT/EXT heading
        if (!heading && /^(INT|EXT|INT\/EXT|EXT\/INT|I\/E)[.\s]+/i.test(nextLine)) {
          heading = nextLine;
          const locMatch = nextLine.match(/^(INT|EXT|INT\/EXT|EXT\/INT|I\/E)[.\s]+(.+?)(?:\s*[-–]\s*(.+))?$/i);
          if (locMatch) {
            intExt = locMatch[1].toUpperCase();
            location = locMatch[2].trim();
            timeOfDay = locMatch[3]?.trim() || '';
          }
          continue;
        }

        // Day/Night standalone
        if (/^(Day|Night|Dawn|Dusk)$/i.test(nextLine)) { timeOfDay = nextLine; continue; }

        // Page fraction: "3/8", "2 4/8"
        if (/^\d+\s*\d*\/\d+\s*$/.test(nextLine)) { pages = nextLine.trim(); continue; }

        // Description: first long line after heading
        if (!description && heading && nextLine.length > 15 && !/^(Day|Night|\d)/.test(nextLine)) {
          description = nextLine;
        }
      }

      scenes.push({ sceneNumber, heading, description, intExt, location, timeOfDay, pages, cast, notes: '' });
      continue;
    }

    // Also handle single-digit scene numbers BUT only if preceded by a marker like "**If Time Permits"
    // or directly followed by INT/EXT on next line
    const singleDigitMatch = line.match(/^(\d{1}[A-Za-z]?)\s*$/);
    if (singleDigitMatch) {
      let hasHeading = false;
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const peek = lines[j].trim();
        if (!peek) continue;
        if (/^(INT|EXT|INT\/EXT|EXT\/INT|I\/E)[.\s]+/i.test(peek)) { hasHeading = true; break; }
        break;
      }
      if (!hasHeading) continue;

      const sceneNumber = singleDigitMatch[1];
      let heading = '', intExt = '', location = '', timeOfDay = '';

      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const nextLine = lines[j].trim();
        if (!nextLine) continue;
        if (!heading && /^(INT|EXT|INT\/EXT|EXT\/INT|I\/E)[.\s]+/i.test(nextLine)) {
          heading = nextLine;
          const locMatch = nextLine.match(/^(INT|EXT|INT\/EXT|EXT\/INT|I\/E)[.\s]+(.+?)(?:\s*[-–]\s*(.+))?$/i);
          if (locMatch) { intExt = locMatch[1].toUpperCase(); location = locMatch[2].trim(); timeOfDay = locMatch[3]?.trim() || ''; }
          continue;
        }
        if (/^(Day|Night|Dawn|Dusk)$/i.test(nextLine)) { timeOfDay = nextLine; continue; }
      }
      scenes.push({ sceneNumber, heading, description: '', intExt, location, timeOfDay, pages: '', cast: [], notes: '' });
      continue;
    }

    // Also match "Sc. 25" or "SC. 12A" inline format
    const inlineMatch = line.match(/^(?:sc\.?|scene)\s*#?\s*(\d{1,4}[A-Za-z]{0,3})[\s:]+(.+)/i);
    if (inlineMatch) {
      const desc = inlineMatch[2].trim();
      const locMatch = desc.match(/^(INT|EXT|INT\/EXT|EXT\/INT|I\/E)[.\s]+(.+?)(?:\s*[-–]\s*(.+))?$/i);
      scenes.push({
        sceneNumber: inlineMatch[1],
        heading: locMatch ? desc : '',
        description: locMatch ? '' : desc,
        intExt: locMatch ? locMatch[1].toUpperCase() : '',
        location: locMatch ? locMatch[2].trim() : '',
        timeOfDay: locMatch?.[3]?.trim() || '',
        pages: '', cast: [], notes: '',
      });
    }
  }

  // Sort by scene number
  scenes.sort((a, b) => {
    const numA = parseInt(a.sceneNumber) || 0;
    const numB = parseInt(b.sceneNumber) || 0;
    if (numA !== numB) return numA - numB;
    return a.sceneNumber.localeCompare(b.sceneNumber);
  });

  // Deduplicate — keep the entry with the most data
  const seen = new Map();
  for (const s of scenes) {
    const key = s.sceneNumber.toUpperCase();
    const existing = seen.get(key);
    if (!existing || (s.heading && !existing.heading) || (s.location && !existing.location)) {
      seen.set(key, s);
    }
  }

  return [...seen.values()];
}

function extractMetadata(rawText) {
  const metadata = {};

  const callMatch = rawText.match(
    /(?:UNIT\s*CALL|crew\s*call|call\s*time)\s*:?\s*(\d{1,2}[:.]\d{2}\s*(?:AM|PM|ON SET)?)/i
  );
  if (callMatch) metadata.crewCall = callMatch[1].trim();

  const locMatch = rawText.match(/(?:LOCATION|UNIT BASE)\s*:?\s*\n?\s*(.{5,80})/i);
  if (locMatch) metadata.location = locMatch[1].trim().split('\n')[0];

  const weatherMatch = rawText.match(/Weather\s*:?\s*(.{3,80})/i);
  if (weatherMatch) metadata.weather = weatherMatch[1].trim().split('\n')[0].split('/')[0].trim();

  const dateMatch = rawText.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*(\d{1,2})\s*/i);
  if (dateMatch) {
    // Try to get full date from surrounding text
    const fullDateMatch = rawText.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*\d{1,2}\s*(?:th|st|nd|rd)?\s*\w+\s*'?\d{2,4}/i);
    if (fullDateMatch) metadata.date = fullDateMatch[0].trim();
  }

  const callsheetNum = rawText.match(/CALLSHEET\s+(\d+)\s+of\s+(\d+)/i);
  if (callsheetNum) {
    metadata.callsheetNumber = callsheetNum[1];
    metadata.totalCallsheets = callsheetNum[2];
  }

  return metadata;
}

function parseSceneNumberInput(input) {
  const numbers = new Set();
  const parts = input.split(/[,;\s]+/).filter(Boolean);
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1]);
      const end = parseInt(rangeMatch[2]);
      for (let i = start; i <= end && i <= start + 200; i++) {
        numbers.add(String(i));
      }
    } else {
      numbers.add(part.trim());
    }
  }
  return [...numbers];
}

module.exports = { parseCallSheetText, parseSceneNumberInput };
