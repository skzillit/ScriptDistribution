import React, { useState } from 'react';

export default function AISuggestionReview({ suggestions = [], onDecide, onClose }) {
  const [decisions, setDecisions] = useState({});

  const grouped = {};
  suggestions.forEach(s => {
    const slug = s.tag?.category_slug || 'misc';
    if (!grouped[slug]) grouped[slug] = [];
    grouped[slug].push(s);
  });

  const setDecision = (tagId, action) => {
    setDecisions(prev => ({ ...prev, [tagId]: action }));
  };

  const handleApply = () => {
    const list = Object.entries(decisions).map(([tagId, action]) => ({ tagId, action }));
    onDecide(list);
  };

  const acceptAll = () => {
    const d = {};
    suggestions.forEach(s => { d[s.tag._id] = 'confirm'; });
    setDecisions(d);
  };

  const rejectAll = () => {
    const d = {};
    suggestions.forEach(s => { d[s.tag._id] = 'reject'; });
    setDecisions(d);
  };

  const decidedCount = Object.keys(decisions).length;
  const remaining = suggestions.length - decidedCount;

  if (!suggestions.length) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 14, width: 540, maxHeight: '80vh',
        overflow: 'hidden', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {'\uD83E\uDDE0'} AI Suggestions
            </h3>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, display: 'flex', gap: 12, alignItems: 'center' }}>
              <span>{suggestions.length} elements found</span>
              {decidedCount > 0 && (
                <span style={{
                  padding: '1px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                  background: 'var(--accent-glow)', color: 'var(--accent)',
                }}>
                  {decidedCount} decided &middot; {remaining} remaining
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={acceptAll} style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              border: '1px solid var(--success)', background: 'transparent', color: 'var(--success)',
              transition: 'all 0.15s',
            }}
            onMouseOver={e => { e.currentTarget.style.background = 'var(--success)'; e.currentTarget.style.color = '#fff'; }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--success)'; }}>
              Accept All
            </button>
            <button onClick={rejectAll} style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              border: '1px solid var(--error)', background: 'transparent', color: 'var(--error)',
              transition: 'all 0.15s',
            }}
            onMouseOver={e => { e.currentTarget.style.background = 'var(--error)'; e.currentTarget.style.color = '#fff'; }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--error)'; }}>
              Reject All
            </button>
          </div>
        </div>

        {/* Suggestions list */}
        <div style={{ overflowY: 'auto', maxHeight: 'calc(80vh - 140px)', padding: '12px 20px' }}>
          {Object.entries(grouped).map(([slug, items]) => (
            <div key={slug} style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
                letterSpacing: '0.4px', marginBottom: 8,
              }}>
                {slug.replace(/_/g, ' ')}
              </div>
              {items.map(s => {
                const decision = decisions[s.tag._id];
                return (
                  <div key={s.tag._id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px', borderRadius: 8, marginBottom: 4,
                    background: decision === 'confirm'
                      ? 'rgba(76, 175, 80, 0.1)'
                      : decision === 'reject'
                        ? 'rgba(239, 83, 80, 0.1)'
                        : 'var(--bg-card-hover)',
                    border: `1px solid ${decision === 'confirm'
                      ? 'var(--success)'
                      : decision === 'reject'
                        ? 'var(--error)'
                        : 'var(--border)'}`,
                    transition: 'all 0.15s',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.element.name}</span>
                      <span style={{
                        fontSize: 11, color: 'var(--text-muted)', marginLeft: 8,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        "{s.tag.tagged_text}"
                      </span>
                      {s.tag.ai_confidence && (
                        <span style={{
                          fontSize: 10, color: 'var(--text-secondary)', marginLeft: 6,
                          background: 'var(--bg-card)', padding: '1px 5px', borderRadius: 4,
                        }}>
                          {Math.round(s.tag.ai_confidence * 100)}%
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => setDecision(s.tag._id, 'confirm')}
                        style={{
                          width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 15,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: decision === 'confirm' ? 'var(--success)' : 'var(--bg-card)',
                          color: decision === 'confirm' ? '#fff' : 'var(--text-muted)',
                          transition: 'all 0.15s',
                        }}>
                        &#10003;
                      </button>
                      <button onClick={() => setDecision(s.tag._id, 'reject')}
                        style={{
                          width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 15,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: decision === 'reject' ? 'var(--error)' : 'var(--bg-card)',
                          color: decision === 'reject' ? '#fff' : 'var(--text-muted)',
                          transition: 'all 0.15s',
                        }}>
                        &#10005;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button onClick={onClose} style={{
            padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
            transition: 'all 0.15s',
          }}>
            Cancel
          </button>
          <button onClick={handleApply}
            disabled={decidedCount === 0}
            style={{
              padding: '9px 18px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
              background: decidedCount > 0 ? 'var(--gradient-accent)' : 'var(--bg-card-hover)',
              color: decidedCount > 0 ? '#fff' : 'var(--text-muted)',
              cursor: decidedCount > 0 ? 'pointer' : 'default',
              boxShadow: decidedCount > 0 ? '0 2px 8px var(--accent-glow)' : 'none',
              transition: 'all 0.2s',
            }}>
            Apply ({decidedCount})
          </button>
        </div>
      </div>
    </div>
  );
}
