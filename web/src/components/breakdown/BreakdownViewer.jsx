import React, { useRef, useEffect, useState } from 'react';
import { getApiBaseUrl } from '../../api/client';

const CATEGORIES = {
  CAST_MEMBER: { label: 'Cast', color: '#FF6B6B' },
  EXTRA: { label: 'Extra', color: '#FF8E8E' },
  PROP: { label: 'Prop', color: '#4ECDC4' },
  SET_DRESSING: { label: 'Set Dressing', color: '#45B7D1' },
  LOCATION: { label: 'Location', color: '#96CEB4' },
  VEHICLE: { label: 'Vehicle', color: '#FFEAA7' },
  WARDROBE: { label: 'Wardrobe', color: '#DDA0DD' },
  MAKEUP_HAIR: { label: 'Makeup/Hair', color: '#FFB6C1' },
  VFX: { label: 'VFX', color: '#A29BFE' },
  SFX: { label: 'SFX', color: '#FD79A8' },
  SOUND_EFFECT: { label: 'Sound', color: '#E17055' },
  MUSIC: { label: 'Music', color: '#00B894' },
  SPECIAL_EQUIPMENT: { label: 'Equipment', color: '#FDCB6E' },
  ANIMAL: { label: 'Animal', color: '#6C5CE7' },
  STUNT: { label: 'Stunt', color: '#D63031' },
  GREENERY: { label: 'Greenery', color: '#00B894' },
};

function BreakdownViewer({ versionId, onElementTap }) {
  const iframeRef = useRef(null);
  const [activeCategories, setActiveCategories] = useState(
    () => Object.fromEntries(Object.keys(CATEGORIES).map(k => [k, true]))
  );

  useEffect(() => {
    const handler = (event) => {
      if (!event.data || !event.data.type) return;
      if (event.data.type === 'onElementTapped' && onElementTap) {
        onElementTap(event.data.data);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onElementTap]);

  const toggleCategory = (category) => {
    const newVal = !activeCategories[category];
    setActiveCategories(prev => ({ ...prev, [category]: newVal }));
    iframeRef.current?.contentWindow.postMessage(
      { type: 'toggleCategory', category, visible: newVal }, '*'
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
      {/* Category filter bar */}
      <div style={{
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        padding: '8px 16px',
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        flexShrink: 0,
      }}>
        {Object.entries(CATEGORIES).map(([key, { label, color }]) => (
          <button key={key}
            onClick={() => toggleCategory(key)}
            style={{
              padding: '4px 10px',
              borderRadius: '16px',
              fontSize: '11px',
              fontWeight: 600,
              background: activeCategories[key] ? `${color}33` : 'transparent',
              color: activeCategories[key] ? color : 'var(--text-secondary)',
              border: `1px solid ${activeCategories[key] ? color : 'var(--border)'}`,
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Iframe */}
      <iframe
        ref={iframeRef}
        src={`${getApiBaseUrl()}/api/highlight/${versionId}`}
        title="Script Breakdown"
        style={{
          flex: 1,
          border: 'none',
          width: '100%',
        }}
      />
    </div>
  );
}

export default BreakdownViewer;
