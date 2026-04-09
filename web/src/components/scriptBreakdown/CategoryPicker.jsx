import React, { useState, useEffect, useRef } from 'react';

export default function CategoryPicker({ categories = [], position, onSelect, onClose }) {
  const [step, setStep] = useState('category');
  const [selectedCat, setSelectedCat] = useState(null);
  const [elementName, setElementName] = useState('');
  const [visible, setVisible] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    return () => setVisible(false);
  }, []);

  if (!position) return null;

  const top = Math.min(position.top + 30, window.innerHeight - 340);
  const left = Math.min(position.left, window.innerWidth - 260);

  const handleCategoryClick = (cat) => {
    setSelectedCat(cat);
    setStep('element');
    setElementName('');
  };

  const handleSubmit = () => {
    if (!elementName.trim() || !selectedCat) return;
    onSelect({ category_slug: selectedCat.slug, element_name: elementName.trim() });
    onClose();
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
      <div style={{
        position: 'fixed', top, left, zIndex: 1000,
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
        boxShadow: 'var(--shadow-lg)', width: 250, overflow: 'hidden',
        opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(-8px)',
        transition: 'opacity 0.15s ease, transform 0.15s ease',
      }}>
        {step === 'category' ? (
          <>
            <div style={{
              padding: '10px 14px', borderBottom: '1px solid var(--border)',
              fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              Select Category
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto', padding: 4 }}>
              {categories.map(cat => (
                <button key={cat.slug} onClick={() => handleCategoryClick(cat)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer',
                    borderRadius: 8, fontSize: 13, color: 'var(--text-primary)', textAlign: 'left',
                    transition: 'all 0.12s',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                  onMouseOut={e => e.currentTarget.style.background = 'none'}>
                  <span style={{
                    width: 12, height: 12, borderRadius: '50%', background: cat.color, flexShrink: 0,
                    boxShadow: `0 0 4px ${cat.color}40`,
                  }} />
                  <span style={{ flex: 1 }}>{cat.name}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{
              padding: '10px 14px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <button onClick={() => { setStep('category'); setSelectedCat(null); }}
                style={{
                  background: 'var(--bg-card-hover)', border: 'none', cursor: 'pointer',
                  width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-secondary)', fontSize: 13, transition: 'all 0.15s',
                }}
                onMouseOver={e => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
                &#8592;
              </button>
              <span style={{
                width: 10, height: 10, borderRadius: '50%', background: selectedCat?.color,
                boxShadow: `0 0 4px ${selectedCat?.color}40`,
              }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{selectedCat?.name}</span>
            </div>
            <div style={{ padding: 12 }}>
              <input
                ref={inputRef}
                autoFocus
                value={elementName}
                onChange={e => setElementName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose(); }}
                placeholder="Element name..."
                style={{
                  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8,
                  fontSize: 13, outline: 'none', fontFamily: 'inherit',
                  background: 'var(--bg-primary)', color: 'var(--text-primary)',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
              <button onClick={handleSubmit}
                disabled={!elementName.trim()}
                style={{
                  width: '100%', marginTop: 8, padding: '9px', border: 'none', borderRadius: 8,
                  background: elementName.trim() ? (selectedCat?.color || 'var(--accent)') : 'var(--bg-card-hover)',
                  color: elementName.trim() ? '#fff' : 'var(--text-muted)',
                  fontSize: 13, fontWeight: 600,
                  cursor: elementName.trim() ? 'pointer' : 'default',
                  transition: 'all 0.2s',
                  boxShadow: elementName.trim() ? `0 2px 8px ${selectedCat?.color || 'var(--accent)'}30` : 'none',
                }}>
                Add Tag
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
