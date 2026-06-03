import React from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { subscribeApiBusy } from '../../api/client';

/**
 * Always-on global progress indicator:
 *   - a thin gradient bar at the very top of the viewport while ANY API call
 *     (axios direct OR React Query) is in flight, and
 *   - a small spinner pill in the top-right corner during the same window.
 * Both auto-hide as soon as everything settles. Zero per-call wiring required —
 * any HTTP request or mutation in the app surfaces here automatically.
 */
function GlobalLoader() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const [axiosBusy, setAxiosBusy] = React.useState(0);
  React.useEffect(() => subscribeApiBusy(setAxiosBusy), []);
  const busy = fetching + mutating + axiosBusy > 0;
  if (!busy) return null;
  const label = mutating + axiosBusy > 0 ? 'Working…' : 'Loading…';
  return (
    <>
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '3px',
        background: 'var(--gradient-accent)',
        boxShadow: '0 0 12px var(--accent-glow)',
        zIndex: 2000,
        animation: 'global-loader-shimmer 1.4s ease-in-out infinite',
      }} />
      <div style={{
        position: 'fixed', top: '12px', right: '14px',
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '6px 12px', borderRadius: '999px',
        background: 'var(--bg-glass)', border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
        fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)',
        zIndex: 2000, backdropFilter: 'blur(8px)',
      }}>
        <span style={{
          width: '12px', height: '12px', borderRadius: '50%',
          border: '2px solid var(--accent-glow)', borderTopColor: 'var(--accent)',
          animation: 'global-loader-spin 0.7s linear infinite',
        }} />
        {label}
      </div>
      <style>{`
        @keyframes global-loader-spin { to { transform: rotate(360deg); } }
        @keyframes global-loader-shimmer {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </>
  );
}

export default GlobalLoader;
