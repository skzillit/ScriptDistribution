import React from 'react';

export default function ScenesListSidebar({ scenes = [], currentSceneId, onSelectScene, collapsed, onToggleCollapse }) {
  if (collapsed) {
    return (
      <div style={{
        width: 36, borderRight: '1px solid var(--border)', background: 'var(--bg-secondary)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12, flexShrink: 0,
      }}>
        <button onClick={onToggleCollapse} title="Expand scenes list"
          style={{
            width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer',
          }}>
          {'\u2630'}
        </button>
        <div style={{
          writingMode: 'vertical-rl', marginTop: 16, fontSize: 10, color: 'var(--text-muted)',
          letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600,
        }}>
          Scenes ({scenes.length})
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: 280, borderRight: '1px solid var(--border)', background: 'var(--bg-secondary)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Scenes</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{scenes.length} total</div>
        </div>
        <button onClick={onToggleCollapse} title="Collapse"
          style={{
            width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
          }}>
          {'\u00AB'}
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 16px' }}>
        {scenes.map((s, idx) => {
          const isActive = s._id === currentSceneId;
          const sceneLabel = s.sceneNumbers?.length ? s.sceneNumbers.join(', ') : `P${s.pageNumber}`;
          return (
            <div key={s._id} onClick={() => onSelectScene(s._id)}
              style={{
                padding: '10px 12px', marginBottom: 6, borderRadius: 8, cursor: 'pointer',
                background: isActive ? 'var(--accent-glow)' : 'var(--bg-card)',
                border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                transition: 'all 0.15s',
              }}
              onMouseOver={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border-hover)'; }}
              onMouseOut={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border)'; }}>
              {/* Top row: Scene number + counts */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, background: isActive ? 'var(--accent)' : 'var(--bg-card-hover)',
                    color: isActive ? '#fff' : 'var(--text-secondary)', padding: '2px 6px', borderRadius: 4,
                  }}>
                    {s.int_ext ? `${s.int_ext}.` : ''} Sc {sceneLabel}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {s.tag_count > 0 && (
                    <span title={`${s.tag_count} tags`} style={{
                      fontSize: 9, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-glow)',
                      padding: '1px 5px', borderRadius: 8,
                    }}>
                      {s.tag_count}
                    </span>
                  )}
                </div>
              </div>

              {/* Set name / heading */}
              <div style={{
                fontSize: 12, fontWeight: 600, color: isActive ? 'var(--text-primary)' : 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4,
              }}>
                {s.set_name || 'Untitled scene'}
              </div>

              {/* Location */}
              <div style={{
                fontSize: 10, color: s.location ? 'var(--text-secondary)' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                <span>{'\uD83D\uDCCD'}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.location || 'No location'}
                </span>
              </div>

              {/* Cast chips */}
              {s.cast_names?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                  {s.cast_names.slice(0, 3).map((name, i) => (
                    <span key={i} style={{
                      fontSize: 9, padding: '1px 6px', borderRadius: 8,
                      background: 'var(--bg-card-hover)', color: 'var(--text-secondary)',
                      border: '1px solid var(--border)', fontWeight: 500,
                    }}>
                      {name}
                    </span>
                  ))}
                  {s.cast_names.length > 3 && (
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                      +{s.cast_names.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {scenes.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            No scenes yet
          </div>
        )}
      </div>
    </div>
  );
}
