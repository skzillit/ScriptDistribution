import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button onClick={toggleTheme} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{ width: '38px', height: '38px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.3s' }}>
      <span style={{ fontSize: '18px', transition: 'transform 0.4s', transform: isDark ? 'rotate(0deg)' : 'rotate(360deg)', display: 'block' }}>
        {isDark ? '\u2600\uFE0F' : '\uD83C\uDF19'}
      </span>
    </button>
  );
}

function UserMenu() {
  const { user, switchRole } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const roles = [
    { key: 'admin', label: 'Admin', desc: 'Full access', icon: '\uD83D\uDC51' },
    { key: 'editor', label: 'Editor', desc: 'Upload & manage', icon: '\u270F\uFE0F' },
    { key: 'viewer', label: 'Viewer', desc: 'View sides only', icon: '\uD83D\uDC41' },
  ];

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
        background: 'none', border: '1px solid var(--border)', borderRadius: '10px',
        padding: '5px 12px 5px 5px', transition: 'border-color 0.2s',
      }}>
        <div style={{
          width: '30px', height: '30px', borderRadius: '50%', background: 'var(--gradient-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: '700', color: 'white',
        }}>
          {(user.name || 'U').charAt(0).toUpperCase()}
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', lineHeight: 1.2 }}>{user.name}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{user.role || 'editor'}</div>
        </div>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px' }}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: '8px',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '12px', boxShadow: 'var(--shadow-lg)',
            width: '220px', overflow: 'hidden', zIndex: 100,
          }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{user.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{user.email || user.deviceId}</div>
            </div>
            <div style={{ padding: '6px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 10px' }}>Switch Role</div>
              {roles.map(r => (
                <button key={r.key} onClick={() => { switchRole(r.key); setOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                    padding: '8px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    background: user.role === r.key ? 'var(--accent-glow)' : 'transparent',
                    transition: 'background 0.15s',
                  }}>
                  <span style={{ fontSize: '16px' }}>{r.icon}</span>
                  <div style={{ textAlign: 'left', flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: user.role === r.key ? 'var(--accent)' : 'var(--text-primary)' }}>{r.label}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{r.desc}</div>
                  </div>
                  {user.role === r.key && <span style={{ fontSize: '12px', color: 'var(--accent)' }}>{'\u2713'}</span>}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Header() {
  return (
    <header style={{
      background: 'var(--bg-glass)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--border)', padding: '0 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: '60px', position: 'sticky', top: 0, zIndex: 50,
    }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--gradient-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '800', color: 'white', letterSpacing: '-1px' }}>SD</div>
        <span style={{ fontSize: '16px', fontWeight: '700', background: 'var(--gradient-accent)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.3px' }}>ScriptDist</span>
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}

export default Header;
