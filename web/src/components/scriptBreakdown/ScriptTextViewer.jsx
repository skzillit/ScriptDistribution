import { useCallback, useRef } from 'react';

function classifyLine(line, prevType) {
  const trimmed = line.trim();
  if (!trimmed) return 'empty';
  if (/^(INT\.|EXT\.|INT\/EXT\.|EXT\/INT\.|I\/E\.)/.test(trimmed)) return 'scene_heading';
  if (/^\d+[A-Za-z]?\s+(INT\.|EXT\.|INT\/EXT\.)/.test(trimmed)) return 'scene_heading';
  if (/^(FADE\s*(IN|OUT|TO)|CUT\s+TO|DISSOLVE\s+TO|SMASH\s+CUT)/i.test(trimmed)) return 'transition';
  if (/^\(.*\)$/.test(trimmed)) return 'parenthetical';
  const cleaned = trimmed.replace(/\*+$/, '').trim();
  if (/^[A-Z][A-Z\s\-'.()]+$/.test(cleaned) && cleaned.length < 45 && cleaned.length > 1
    && !/^(INT\.|EXT\.|CONTINUED|FADE|THE END)/.test(cleaned)) return 'character';
  if (prevType === 'character' || prevType === 'parenthetical' || prevType === 'dialogue') {
    if (line.startsWith('  ') || line.startsWith('\t')) return 'dialogue';
    if (prevType === 'character' || prevType === 'parenthetical') return 'dialogue';
  }
  return 'action';
}

const TYPE_STYLES = {
  scene_heading: { fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid var(--border)', marginTop: 22, marginBottom: 12, paddingBottom: 8 },
  character: { marginLeft: '35%', marginTop: 12, fontWeight: 600, textTransform: 'uppercase' },
  parenthetical: { marginLeft: '28%', maxWidth: '35%', fontStyle: 'italic', color: 'var(--text-secondary)' },
  dialogue: { marginLeft: '22%', maxWidth: '45%' },
  transition: { textAlign: 'right', fontWeight: 600, textTransform: 'uppercase', marginTop: 12, marginBottom: 12, paddingRight: 40, color: 'var(--text-secondary)' },
  action: { marginTop: 6, marginBottom: 4 },
  empty: { height: 12 },
};

export default function ScriptTextViewer({ scriptText = [], tags = [], onTextSelected, sceneNumber }) {
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

  const lineTypes = [];
  let prevType = 'action';
  for (const line of scriptText) {
    const type = classifyLine(line, prevType);
    lineTypes.push(type);
    prevType = type;
  }

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    if (!text) return;

    // Find the line element (div with data-line-index)
    let startNode = range.startContainer;
    while (startNode && !startNode.dataset?.lineIndex) startNode = startNode.parentElement;
    let endNode = range.endContainer;
    while (endNode && !endNode.dataset?.lineIndex) endNode = endNode.parentElement;
    if (!startNode || !endNode) return;

    const lineIndex = parseInt(startNode.dataset.lineIndex, 10);
    const endLineIndex = parseInt(endNode.dataset.lineIndex, 10);
    if (lineIndex !== endLineIndex) { selection.removeAllRanges(); return; }

    // Calculate char offset within the line's content span only
    // The content is inside the span[data-content="true"]
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
        padding: '40px 50px 50px 65px', margin: '16px auto 24px',
        fontFamily: "'Courier New', Courier, monospace", fontSize: 14, lineHeight: '22px',
        color: 'var(--text-primary)', position: 'relative', flex: 1,
        boxShadow: 'var(--shadow-sm)',
      }}>
        {scriptText.map((line, i) => {
          const type = lineTypes[i];
          const trimmed = line.trim();
          const typeStyle = TYPE_STYLES[type] || {};
          const segments = buildSegments(trimmed || '', tagsByLine[i]);

          if (type === 'empty') return <div key={i} data-line-index={i} style={{ height: 12 }} />;

          return (
            <div key={i} data-line-index={i} style={{ ...typeStyle, position: 'relative', padding: '2px 0' }}>
              {/* Line number — outside content span, not selectable */}
              <span style={{
                position: 'absolute', left: -42, color: 'var(--text-muted)', fontSize: 10,
                userSelect: 'none', width: 28, textAlign: 'right', lineHeight: '22px', opacity: 0.4,
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}>
                {i + 1}
              </span>
              {/* Scene number badge — outside content span, not selectable */}
              {type === 'scene_heading' && sceneNumber && (
                <span style={{
                  position: 'absolute', right: -40, fontWeight: 700, fontSize: 11,
                  color: '#fff', background: 'var(--accent)', padding: '1px 6px', borderRadius: 4,
                  userSelect: 'none',
                }}>
                  {sceneNumber}
                </span>
              )}
              {/* Content span — this is what we measure char offsets against */}
              <span data-content="true">
                {segments.map((seg, j) =>
                  seg.tag ? (
                    <mark key={j}
                      title={`${seg.tag.element_name} (${(seg.tag.category_slug || '').replace(/_/g, ' ')})`}
                      style={{
                        backgroundColor: seg.tag.category_color ? `${seg.tag.category_color}35` : 'rgba(255,140,0,0.2)',
                        borderBottom: `2px solid ${seg.tag.category_color || 'var(--accent)'}`,
                        borderRadius: 3, padding: '1px 2px', cursor: 'pointer',
                        color: 'inherit', transition: 'background-color 0.2s',
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
