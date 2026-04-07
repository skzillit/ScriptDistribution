import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const allMenuItems = [
  { path: '/callsheet', label: 'Call Sheet', icon: '\uD83D\uDCCB', roles: ['admin', 'editor'] },
  { path: '/script', label: 'Script', icon: '\uD83C\uDFAC', roles: ['admin', 'editor'] },
  { path: '/schedule', label: 'Schedule', icon: '\uD83D\uDCC5', roles: ['admin', 'editor'] },
  { path: '/sides', label: 'Sides', icon: '\uD83D\uDCC4', roles: ['admin', 'editor', 'viewer'] },
];

function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();
  const userRole = user?.role || 'viewer';

  const visibleItems = allMenuItems.filter(item => item.roles.includes(userRole));

  return (
    <aside style={{
      width: '220px',
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)',
      height: 'calc(100vh - 60px)',
      position: 'fixed',
      top: '60px',
      left: 0,
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 10px',
      gap: '4px',
      overflowY: 'auto',
      zIndex: 40,
    }}>
      {visibleItems.map(item => {
        const isActive = location.pathname === item.path ||
          (item.path === '/script' && location.pathname.startsWith('/scripts')) ||
          (item.path === '/sides' && location.pathname === '/sides');
        return (
          <Link key={item.path} to={item.path} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: isActive ? '700' : '500',
            color: isActive ? 'white' : 'var(--text-secondary)',
            background: isActive ? 'var(--accent)' : 'transparent',
            textDecoration: 'none',
            transition: 'all 0.2s',
          }}>
            <span style={{ fontSize: '18px' }}>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}

      {/* Role badge at bottom */}
      <div style={{
        marginTop: 'auto',
        padding: '10px 14px',
        fontSize: '11px',
        color: 'var(--text-muted)',
        borderTop: '1px solid var(--border)',
        paddingTop: '16px',
      }}>
        <div style={{ fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Role</div>
        <span style={{
          padding: '3px 10px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: '700',
          background: userRole === 'viewer' ? 'rgba(108,92,231,0.12)' : 'var(--accent-glow)',
          color: userRole === 'viewer' ? '#6c5ce7' : 'var(--accent)',
          textTransform: 'capitalize',
        }}>
          {userRole}
        </span>
      </div>
    </aside>
  );
}

export default Sidebar;
