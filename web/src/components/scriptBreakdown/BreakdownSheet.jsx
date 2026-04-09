import React, { useState } from 'react';

export default function BreakdownSheet({ categories = [], onRemoveTag, sceneInfo }) {
  const [collapsed, setCollapsed] = useState({});

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

  const toggleCollapse = (slug) => {
    setCollapsed(prev => ({ ...prev, [slug]: !prev[slug] }));
  };

  return (
    <div style={{ overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)', flexShrink: 0,
      }}>
        {sceneInfo && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Page {sceneInfo.pageNumber}
              </div>
              {sceneInfo.sceneNumbers?.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Scene {sceneInfo.sceneNumbers.join(', ')}
                </div>
              )}
            </div>
            <div style={{
              padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
              background: totalElements > 0 ? 'var(--accent-glow)' : 'var(--bg-card)',
              color: totalElements > 0 ? 'var(--accent)' : 'var(--text-muted)',
              border: `1px solid ${totalElements > 0 ? 'var(--accent)' : 'var(--border)'}`,
            }}>
              {totalElements} element{totalElements !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>

      {/* Categories */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        {processedCategories.map(group => {
          const hasElements = group.elements.length > 0;
          const isCollapsed = collapsed[group.category.slug] ?? !hasElements;

          return (
            <div key={group.category.slug} style={{
              marginBottom: 6, borderRadius: 8,
              border: `1px solid ${hasElements ? 'var(--border)' : 'transparent'}`,
              background: hasElements ? 'var(--bg-card)' : 'transparent',
              overflow: 'hidden', transition: 'all 0.2s',
            }}>
              {/* Category header — clickable */}
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

              {/* Elements */}
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
