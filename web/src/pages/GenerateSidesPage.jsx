import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import GenerateSidesModal from '../components/sides/GenerateSidesModal';

/**
 * Generate Sides as a standalone page (replaces the old popup). Renders the
 * same form/flow as the modal via the `asPage` prop, with a back link to Sides.
 */
function GenerateSidesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (
    <div style={{ padding: '32px' }}>
      <button
        onClick={() => navigate('/sides')}
        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        Back to Sides
      </button>
      <GenerateSidesModal
        asPage
        onClose={() => navigate('/sides')}
        onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['sides'] }); navigate('/sides'); }}
      />
    </div>
  );
}

export default GenerateSidesPage;
