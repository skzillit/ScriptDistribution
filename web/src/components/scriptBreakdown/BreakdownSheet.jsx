import React, { useState, useEffect, useRef } from 'react';

export default function BreakdownSheet({
  categories = [],
  onRemoveTag,
  sceneInfo,
  sceneMeta,         // { location, locationAddress, synopsis, int_ext, set_name, day_night, cast_count }
  onSynopsisChange,  // (text) => void — auto-save on blur
  onOpenLocationPicker,  // (anchorEl) => void
  onOpenCastPicker,      // (anchorEl) => void
}) {
  const [collapsed, setCollapsed] = useState({});
  const [showEmpty, setShowEmpty] = useState(false);
  const [synopsisValue, setSynopsisValue] = useState(sceneMeta?.synopsis || '');
  const locationBtnRef = useRef(null);
  const castBtnRef = useRef(null);

  useEffect(() => {
    setSynopsisValue(sceneMeta?.synopsis || '');
  }, [sceneMeta?.synopsis, sceneInfo?._id]);

  // Count total unique elements
  let totalElements = 0;
  const processedCategories = categories.map(group => {
    const uniqueElements = {};
    group.tags.forEach(tag => {
      if (!uniqueElements[tag.element_id]) {
        uniqueElements[tag.element_id] = { name: tag.element_name, tags: [], ai: tag.ai_generated };
      }
      uniqueElements[tag.element_id].tags.push(tag);
    });
    const elements = Object.values(uniqueElements);
    totalElements += elements.length;
    return { ...group, elements };
  });

  const visibleCategories = showEmpty
    ? processedCategories
    : processedCategories.filter(g => g.elements.length > 0);

  const toggleCollapse = (slug) => {
    setCollapsed(prev => ({ ...prev, [slug]: !prev[slug] }));
  };

  const handleSynopsisBlur = () => {
    if (synopsisValue !== (sceneMeta?.synopsis || '')) {
      onSynopsisChange?.(synopsisValue);
    }
  };

  return (
    <div style={{ overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Scene metadata header */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)', flexShrink: 0,
      }}>
        {sceneInfo && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {sceneInfo.sceneNumbers?.length > 0
                    ? `Scene ${sceneInfo.sceneNumbers.join(', ')}`
                    : `Page ${sceneInfo.pageNumber}`}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {sceneMeta?.int_ext ? `${sceneMeta.int_ext}.` : ''}{' '}
                  {sceneMeta?.set_name || '—'}
                  {sceneMeta?.day_night ? ` — ${sceneMeta.day_night}` : ''}
                </div>
              </div>
              <div style={{
                padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                background: totalElements > 0 ? 'var(--accent-glow)' : 'var(--bg-card)',
                color: totalElements > 0 ? 'var(--accent)' : 'var(--text-muted)',
                border: `1px solid ${totalElements > 0 ? 'var(--accent)' : 'var(--border)'}`,
              }}>
                {totalElements} tag{totalElements !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Location + Cast buttons */}
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button ref={locationBtnRef}
                onClick={() => onOpenLocationPicker?.(locationBtnRef.current?.getBoundingClientRect())}
                title={sceneMeta?.location || 'Assign location'}
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: 7,
                  background: sceneMeta?.location ? 'var(--accent-glow)' : 'var(--bg-card)',
                  border: `1px solid ${sceneMeta?.location ? 'var(--accent)' : 'var(--border)'}`,
                  color: sceneMeta?.location ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                <span>{'\uD83D\uDCCD'}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {sceneMeta?.location || 'Location'}
                </span>
              </button>
              <button ref={castBtnRef}
                onClick={() => onOpenCastPicker?.(castBtnRef.current?.getBoundingClientRect())}
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: 7,
                  background: (sceneMeta?.cast_count || 0) > 0 ? 'var(--accent-glow)' : 'var(--bg-card)',
                  border: `1px solid ${(sceneMeta?.cast_count || 0) > 0 ? 'var(--accent)' : 'var(--border)'}`,
                  color: (sceneMeta?.cast_count || 0) > 0 ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center',
                }}>
                <span>{'\uD83D\uDC65'}</span>
                <span>Cast{sceneMeta?.cast_count ? ` (${sceneMeta.cast_count})` : ''}</span>
              </button>
            </div>

            {/* Synopsis */}
            <div style={{ marginTop: 10 }}>
              <label style={{
                fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 4,
                fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px',
              }}>
                Synopsis
              </label>
              <textarea
                value={synopsisValue}
                onChange={(e) => setSynopsisValue(e.target.value)}
                onBlur={handleSynopsisBlur}
                placeholder="Scene description..."
                rows={2}
                style={{
                  width: '100%', padding: '6px 10px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg-primary)',
                  color: 'var(--text-primary)', fontSize: 12, outline: 'none',
                  resize: 'vertical', fontFamily: 'inherit', minHeight: 40,
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* Show empty categories toggle */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
        fontSize: 11, color: 'var(--text-muted)', flexShrink: 0,
      }}>
        <span>Categories</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <span>Show empty</span>
          <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)}
            style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
        </label>
      </div>

      {/* Categories list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        {visibleCategories.length === 0 && (
          <div style={{ textAlign: 'center', padding: 30, fontSize: 12, color: 'var(--text-muted)' }}>
            No elements tagged yet.<br />
            <span style={{ fontSize: 10 }}>Select text in the script to add tags.</span>
          </div>
        )}
        {visibleCategories.map(group => {
          const hasElements = group.elements.length > 0;
          const isCollapsed = collapsed[group.category.slug] ?? false;

          return (
            <div key={group.category.slug} style={{
              marginBottom: 6, borderRadius: 8,
              border: `1px solid ${hasElements ? 'var(--border)' : 'transparent'}`,
              background: hasElements ? 'var(--bg-card)' : 'transparent',
              overflow: 'hidden', transition: 'all 0.2s',
            }}>
              <button onClick={() => toggleCollapse(group.category.slug)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: hasElements ? '8px 12px' : '4px 12px',
                  border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.15s',
                }}
                onMouseOver={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                onMouseOut={e => e.currentTarget.style.background = 'none'}>
                <span style={{
                  width: 10, height: 10, borderRadius: '50%', background: group.category.color, flexShrink: 0,
                  boxShadow: hasElements ? `0 0 6px ${group.category.color}40` : 'none',
                }} />
                <span style={{
                  fontSize: 12, fontWeight: 600, color: hasElements ? 'var(--text-primary)' : 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.3px', flex: 1,
                }}>
                  {group.category.name}
                </span>
                {hasElements && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: group.category.color,
                    background: `${group.category.color}18`, padding: '2px 7px', borderRadius: 10,
                  }}>
                    {group.elements.length}
                  </span>
                )}
                <span style={{ fontSize: 10, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)' }}>
                  &#9660;
                </span>
              </button>

              {!isCollapsed && hasElements && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '0 12px 10px' }}>
                  {group.elements.map((el, i) => (
                    <span key={i} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                      background: `${group.category.color}15`, color: group.category.color,
                      border: `1px solid ${group.category.color}28`,
                      transition: 'all 0.15s',
                    }}>
                      {el.name}
                      {el.tags.length > 1 && (
                        <span style={{ fontSize: 10, opacity: 0.7 }}>({el.tags.length})</span>
                      )}
                      {el.ai && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, background: 'var(--accent-glow)', color: 'var(--accent)',
                          padding: '1px 4px', borderRadius: 3, letterSpacing: '0.3px',
                        }}>AI</span>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); el.tags.forEach(tag => onRemoveTag(tag._id)); }}
                        title={`Remove all ${el.tags.length} tag(s)`}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--text-muted)', fontSize: 13, padding: '0 1px', lineHeight: 1,
                          transition: 'color 0.15s',
                        }}
                        onMouseOver={e => e.currentTarget.style.color = 'var(--error)'}
                        onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {!isCollapsed && !hasElements && (
                <div style={{ padding: '0 12px 8px', fontSize: 11, color: 'var(--text-muted)' }}>No elements tagged</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
