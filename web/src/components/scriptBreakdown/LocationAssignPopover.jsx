import React, { useState, useEffect, useRef } from 'react';

export default function LocationAssignPopover({
  visible, anchorEl, currentLocation = '', currentAddress = '', onSave, onRemove, onClose,
}) {
  const [view, setView] = useState(currentLocation ? 'display' : 'form');
  const [locationName, setLocationName] = useState(currentLocation);
  const [address, setAddress] = useState(currentAddress);
  const [error, setError] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (visible) {
      setLocationName(currentLocation);
      setAddress(currentAddress);
      setView(currentLocation ? 'display' : 'form');
      setError(false);
    }
  }, [visible, currentLocation, currentAddress]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [visible, onClose]);

  if (!visible || !anchorEl) return null;

  const style = {
    position: 'fixed',
    top: Math.min(anchorEl.bottom + 6, window.innerHeight - 320),
    left: Math.min(anchorEl.left - 80, window.innerWidth - 340),
    zIndex: 1050,
    width: 320,
    background: 'var(--bg-card)',
    borderRadius: 12,
    boxShadow: 'var(--shadow-lg)',
    border: '1px solid var(--border)',
    padding: 18,
  };

  const handleSave = () => {
    if (!locationName.trim()) { setError(true); return; }
    onSave({ location: locationName.trim(), locationAddress: address.trim() });
  };

  const handleRemove = () => {
    onRemove();
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1049 }} />
      <div ref={ref} style={style}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{'\uD83D\uDCCD'}</span> Location
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16,
          }}>&times;</button>
        </div>

        {view === 'display' ? (
          <>
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--bg-primary)', border: '1px solid var(--border)', marginBottom: 10,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {currentLocation}
              </div>
              {currentAddress && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
                  {currentAddress}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setView('form')}
                style={{
                  flex: 1, padding: '7px', borderRadius: 7,
                  background: 'var(--bg-card-hover)', border: '1px solid var(--border)',
                  color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>
                Change
              </button>
              <button onClick={handleRemove}
                style={{
                  flex: 1, padding: '7px', borderRadius: 7,
                  background: 'transparent', border: '1px solid var(--error)',
                  color: 'var(--error)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>
                Remove
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                Location Name
              </label>
              <input
                value={locationName}
                onChange={(e) => { setLocationName(e.target.value); setError(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                placeholder="e.g., Beach House"
                autoFocus
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  border: `1px solid ${error ? 'var(--error)' : 'var(--border)'}`,
                  background: 'var(--bg-primary)', color: 'var(--text-primary)',
                  fontSize: 13, outline: 'none',
                }}
              />
              {error && (
                <div style={{ fontSize: 10, color: 'var(--error)', marginTop: 3 }}>
                  Location name is required
                </div>
              )}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                Shooting Address (optional)
              </label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                placeholder="e.g., 123 Ocean Dr, Malibu CA"
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)', color: 'var(--text-primary)',
                  fontSize: 13, outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave}
                style={{
                  flex: 1, padding: '8px', borderRadius: 7, border: 'none',
                  background: 'var(--gradient-accent)', color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>
                Save
              </button>
              <button onClick={() => currentLocation ? setView('display') : onClose()}
                style={{
                  padding: '8px 14px', borderRadius: 7,
                  background: 'var(--bg-card-hover)', border: '1px solid var(--border)',
                  color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
                }}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
