import React, { useState, useEffect, useRef } from 'react';

const getInitials = (name) => {
  const parts = (name || '').split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name || '?').substring(0, 2).toUpperCase();
};

const getAvatarColor = (name) => {
  const colors = ['#2dd4bf', '#60a5fa', '#f472b6', '#a78bfa', '#fbbf24', '#34d399', '#f87171', '#818cf8'];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

export default function CastAssignPopover({
  visible, anchorEl, cast = [], assignedIds = [], onToggle, onClose,
}) {
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!visible) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [visible, onClose]);

  if (!visible || !anchorEl) return null;

  const assignedSet = new Set(assignedIds.map(id => String(id)));
  const filtered = search
    ? cast.filter(c => (c.name || '').toLowerCase().includes(search.toLowerCase()))
    : cast;

  const style = {
    position: 'fixed',
    top: Math.min(anchorEl.bottom + 6, window.innerHeight - 400),
    left: Math.min(anchorEl.left - 100, window.innerWidth - 340),
    zIndex: 1050,
    width: 320,
    background: 'var(--bg-card)',
    borderRadius: 12,
    boxShadow: 'var(--shadow-lg)',
    border: '1px solid var(--border)',
    padding: 16,
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1049 }} />
      <div ref={ref} style={style}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            Assign Cast
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16,
          }}>&times;</button>
        </div>

        {/* Search */}
        <input
          placeholder="Search cast by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--bg-primary)',
            color: 'var(--text-primary)', fontSize: 13, outline: 'none', marginBottom: 12,
          }}
        />

        {/* Cast list */}
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, fontSize: 12, color: 'var(--text-muted)' }}>
              {cast.length === 0 ? 'No cast members yet. Tag character names as "cast" to add them.' : 'No matches found'}
            </div>
          ) : (
            filtered.map((member) => {
              const isAssigned = assignedSet.has(String(member._id));
              return (
                <div key={member._id} onClick={() => onToggle(member._id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 6px', cursor: 'pointer', borderRadius: 6, transition: 'all 0.15s',
                    background: isAssigned ? 'var(--accent-glow)' : 'transparent',
                  }}
                  onMouseOver={e => { if (!isAssigned) e.currentTarget.style.background = 'var(--bg-card-hover)'; }}
                  onMouseOut={e => { if (!isAssigned) e.currentTarget.style.background = 'transparent'; }}>
                  <input type="checkbox" checked={isAssigned} readOnly
                    style={{ cursor: 'pointer', accentColor: 'var(--accent)' }} />
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: getAvatarColor(member.name), color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                  }}>
                    {getInitials(member.name)}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, flex: 1 }}>
                    {member.name}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{
          borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 10,
          fontSize: 11, color: 'var(--text-muted)', textAlign: 'center',
        }}>
          Tip: tag character names as "cast" to auto-populate this list
        </div>
      </div>
    </>
  );
}
