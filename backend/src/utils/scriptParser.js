const SCENE_HEADING_RE = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s+/i;
const TRANSITION_RE = /^[A-Z\s]+TO:$/;
const CHARACTER_RE = /^[A-Z][A-Z\s.\-']+$/;

function parseScreenplayPage(rawText) {
  const lines = rawText.split('\n');
  const elements = [];
  let offset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const startOffset = offset;
    const endOffset = offset + line.length;

    if (!trimmed) {
      offset = endOffset + 1;
      continue;
    }

    let type;
    if (SCENE_HEADING_RE.test(trimmed)) {
      type = 'scene_heading';
    } else if (TRANSITION_RE.test(trimmed)) {
      type = 'transition';
    } else if (
      CHARACTER_RE.test(trimmed) &&
      trimmed.length < 40 &&
      i + 1 < lines.length &&
      lines[i + 1].trim().length > 0
    ) {
      type = 'character';
    } else if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      type = 'parenthetical';
    } else {
      // Check if previous line was character or parenthetical -> dialogue
      const prevElement = elements[elements.length - 1];
      if (prevElement && (prevElement.type === 'character' || prevElement.type === 'parenthetical')) {
        type = 'dialogue';
      } else {
        type = 'action';
      }
    }

    elements.push({ type, text: trimmed, startOffset, endOffset });
    offset = endOffset + 1;
  }

  return elements;
}

function extractSceneNumbers(elements) {
  let sceneCount = 0;
  return elements
    .filter(el => el.type === 'scene_heading')
    .map(el => {
      sceneCount++;
      const match = el.text.match(/^(?:INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s+(.+?)(?:\s*-\s*(.+))?$/i);
      return {
        sceneNumber: String(sceneCount),
        heading: el.text,
        location: match ? match[1].trim() : el.text,
        timeOfDay: match && match[2] ? match[2].trim() : '',
      };
    });
}

module.exports = { parseScreenplayPage, extractSceneNumbers };
