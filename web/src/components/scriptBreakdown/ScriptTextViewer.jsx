import { useCallback, useRef } from 'react';

function classifyLine(trimmed, prevType) {
  if (!trimmed) return 'empty';
  const cleaned = trimmed.replace(/\*+$/, '').trim();

  // Scene heading
  if (/^(INT\.|EXT\.|INT\/EXT\.|EXT\/INT\.|I\/E\.)/.test(cleaned)) return 'scene_heading';
  if (/^\d+[A-Za-z]?\s+(INT\.|EXT\.|INT\/EXT\.)/.test(cleaned)) return 'scene_heading';

  // Transition
  if (/^(FADE\s*(IN|OUT|TO)|CUT\s+TO|DISSOLVE\s+TO|SMASH\s+CUT)/i.test(cleaned)) return 'transition';
  if (/^[A-Z\s]+TO:\s*$/.test(cleaned)) return 'transition';

  // Parenthetical — must follow character or dialogue
  if (/^\(/.test(cleaned) && (prevType === 'character' || prevType === 'dialogue' || prevType === 'parenthetical')) {
    return 'parenthetical';
  }

  // Character name: ALL CAPS, short, not a heading/transition
  if (/^[A-Z][A-Z\s.\-'\/()#]+$/.test(cleaned) && cleaned.length >= 2 && cleaned.length < 45
    && !/^(INT\.|EXT\.|CONTINUED|FADE|THE END|ACT )/.test(cleaned)
    && (prevType === 'action' || prevType === 'empty' || prevType === '' || prevType === 'scene_heading' || prevType === 'dialogue')) {
    return 'character';
  }

  // Dialogue: anything following character, parenthetical, or previous dialogue
  if (prevType === 'character' || prevType === 'parenthetical' || prevType === 'dialogue') {
    // Only break out of dialogue for scene headings (already caught above),
    // transitions (already caught above), or clear character names followed by empty line
    return 'dialogue';
  }

  return 'action';
}

// Indentation using padding-left so wrapped lines stay indented
const TYPE_STYLES = {
  scene_heading: { fontWeight: 700, textTransform: 'uppercase', marginTop: 18, marginBottom: 4, paddingLeft: 0 },
  character: { marginTop: 12, fontWeight: 600, textTransform: 'uppercase', paddingLeft: '35%', textAlign: 'left' },
  parenthetical: { paddingLeft: '30%', textAlign: 'left' },
  dialogue: { paddingLeft: '23%', paddingRight: '15%', textAlign: 'left' },
  transition: { textAlign: 'right', fontWeight: 600, textTransform: 'uppercase', marginTop: 10, marginBottom: 10, paddingRight: 20 },
  action: { marginTop: 4, marginBottom: 2, paddingLeft: 0 },
  empty: {},
};

export default function ScriptTextViewer({ scriptText = [], tags = [], onTextSelected, onRemoveTag, sceneNumber }) {
  const containerRef = useRef(null);

  const tagsByLine = {};
  for (const tag of tags) {
    if (!tagsByLine[tag.line_index]) tagsByLine[tag.line_index] = [];
    tagsByLine[tag.line_index].push(tag);
  }

  const buildSegments = (lineText, lineTags) => {
    if (!lineTags || lineTags.length === 0) return [{ text: lineText, tag: null }];
    const sorted = [...lineTags].sort((a, b) => a.char_start - b.char_start);
    const segments = [];
    let cursor = 0;
    for (const tag of sorted) {
      const start = Math.max(tag.char_start, cursor);
      const end = Math.min(tag.char_end, lineText.length);
      if (start > end) continue;
      if (cursor < start) segments.push({ text: lineText.slice(cursor, start), tag: null });
      segments.push({ text: lineText.slice(start, end), tag });
      cursor = end;
    }
    if (cursor < lineText.length) segments.push({ text: lineText.slice(cursor), tag: null });
    return segments;
  };

  // Classify all lines
  const lineTypes = [];
  let prevType = '';
  for (let i = 0; i < scriptText.length; i++) {
    const trimmed = scriptText[i].trim();
    const type = classifyLine(trimmed, prevType);
    lineTypes.push(type);
    prevType = type;
  }

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    if (!text) return;

    let startNode = range.startContainer;
    while (startNode && !startNode.dataset?.lineIndex) startNode = startNode.parentElement;
    let endNode = range.endContainer;
    while (endNode && !endNode.dataset?.lineIndex) endNode = endNode.parentElement;
    if (!startNode || !endNode) return;

    const lineIndex = parseInt(startNode.dataset.lineIndex, 10);
    const endLineIndex = parseInt(endNode.dataset.lineIndex, 10);
    if (lineIndex !== endLineIndex) { selection.removeAllRanges(); return; }

    const contentSpan = startNode.querySelector('[data-content="true"]');
    if (!contentSpan) return;

    let charStart = 0;
    const walker = document.createTreeWalker(contentSpan, NodeFilter.SHOW_TEXT, null);
    let node;
    let foundStart = false;
    while ((node = walker.nextNode())) {
      if (node === range.startContainer) {
        charStart += range.startOffset;
        foundStart = true;
        break;
      }
      charStart += node.textContent.length;
    }
    if (!foundStart) return;
    const charEnd = charStart + text.length;

    const rect = range.getBoundingClientRect();
    onTextSelected?.({ lineIndex, charStart, charEnd, text, rect });
  }, [onTextSelected]);

  if (!scriptText.length) {
    return (
      <div style={{ padding: 60, color: 'var(--text-muted)', textAlign: 'center', fontSize: 14, background: 'var(--bg-primary)', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{'\uD83D\uDCDC'}</div>
        No script text available for this scene.
      </div>
    );
  }

  return (
    <div ref={containerRef} onMouseUp={handleMouseUp}
      style={{ background: 'var(--bg-primary)', overflowY: 'auto', height: '100%', minHeight: '100%', cursor: 'text', userSelect: 'text', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 12px' }}>

      {/* Instruction banner */}
      <div style={{
        width: '100%', maxWidth: 720, margin: '16px auto 0',
        padding: '8px 16px', borderRadius: 8,
        background: 'var(--accent-glow)', border: '1px solid var(--accent)',
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 12, color: 'var(--accent)', fontWeight: 500, flexShrink: 0,
      }}>
        <span style={{ fontSize: 15 }}>{'\u2728'}</span>
        Select any text to tag breakdown elements — highlight a word or phrase, then pick a category.
      </div>

      {/* Script page */}
      <div style={{
        width: '100%', maxWidth: 720, background: 'var(--bg-card)',
        border: '1px solid var(--border)', borderRadius: 10,
        padding: '40px 30px 50px 30px', margin: '16px auto 24px',
        fontFamily: "'Courier New', Courier, monospace", fontSize: 13, lineHeight: '20px',
        color: 'var(--text-primary)', position: 'relative', flex: 1,
        boxShadow: 'var(--shadow-sm)',
      }}>
        {scriptText.map((line, i) => {
          const type = lineTypes[i];
          const trimmed = line.trim();
          const typeStyle = TYPE_STYLES[type] || {};
          const segments = buildSegments(trimmed || '', tagsByLine[i]);

          if (type === 'empty') return <div key={i} data-line-index={i} style={{ height: 20 }} />;

          return (
            <div key={i} data-line-index={i} style={{ ...typeStyle, position: 'relative' }}>
              {/* Content span */}
              <span data-content="true">
                {segments.map((seg, j) =>
                  seg.tag ? (
                    <mark key={j}
                      title={`${seg.tag.element_name} (${(seg.tag.category_slug || '').replace(/_/g, ' ')}) — click to remove`}
                      onClick={(e) => {
                        e.stopPropagation();
                        window.getSelection()?.removeAllRanges();
                        onRemoveTag?.(seg.tag._id);
                      }}
                      style={{
                        backgroundColor: seg.tag.category_color ? `${seg.tag.category_color}35` : 'rgba(255,140,0,0.2)',
                        borderBottom: `2px solid ${seg.tag.category_color || 'var(--accent)'}`,
                        borderRadius: 3, padding: '1px 2px', cursor: 'pointer',
                        color: 'inherit', transition: 'all 0.15s',
                      }}
                      onMouseOver={e => {
                        e.currentTarget.style.backgroundColor = seg.tag.category_color ? `${seg.tag.category_color}60` : 'rgba(255,140,0,0.4)';
                        e.currentTarget.style.textDecoration = 'line-through';
                      }}
                      onMouseOut={e => {
                        e.currentTarget.style.backgroundColor = seg.tag.category_color ? `${seg.tag.category_color}35` : 'rgba(255,140,0,0.2)';
                        e.currentTarget.style.textDecoration = 'none';
                      }}>
                      {seg.text}
                    </mark>
                  ) : <span key={j}>{seg.text}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
