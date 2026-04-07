import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sidesApi } from '../api/scripts.api';
import { getApiBaseUrl } from '../api/client';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';
import GenerateSidesModal from '../components/sides/GenerateSidesModal';
import { useAuth } from '../context/AuthContext';

function SidesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isEditor = user?.role === 'admin' || user?.role === 'editor';
  const [showGenerateSides, setShowGenerateSides] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['sides'],
    queryFn: () => sidesApi.list({ limit: 50 }).then(r => r.data),
    refetchInterval: (q) => q.state.data?.sides?.some(s => s.status === 'generating') ? 3000 : false,
  });

  const { data: historyData } = useQuery({
    queryKey: ['sides-history'],
    queryFn: () => sidesApi.listHistory({ limit: 50 }).then(r => r.data),
    enabled: showHistory,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => sidesApi.delete(id),
    onSuccess: () => { toast.success('Deleted'); queryClient.invalidateQueries({ queryKey: ['sides'] }); },
  });

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '4px' }}>Sides</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Extract scene-specific pages from your scripts</p>
        </div>
        {isEditor && (
          <button className="btn-primary" onClick={() => setShowGenerateSides(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Generate Sides
          </button>
        )}
      </div>

      {isLoading ? <div className="loading-spinner">Loading...</div>
      : !data?.sides?.length ? (
        <Empty icon={'\uD83D\uDCC4'} title="No sides yet" desc="Generate sides from your script using a call sheet or scene selection" action={isEditor ? () => setShowGenerateSides(true) : null} actionLabel="Generate Sides" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {data.sides.map(s => (
            <div key={s._id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>{s.title}</span>
                  <span className={`badge ${s.status === 'ready' ? 'badge-approved' : s.status === 'generating' ? 'badge-in_review' : 'badge-draft'}`}>{s.status}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <span>Scenes: {s.sceneNumbers?.join(', ')}</span>
                  <span>{s.totalScenes || 0} scene(s)</span>
                  <span>{s.downloadCount || 0} downloads</span>
                  <span>{dayjs(s.createdAt).format('MMM D, h:mm A')}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                {s.status === 'ready' && (
                  <>
                    <Btn label="View" primary onClick={() => { window.location.href = `${getApiBaseUrl()}/api/sides/${s._id}/view`; }} />
                    <Btn label="Download" onClick={() => sidesApi.download(s._id).then(r => { const u = r.data.downloadUrl; window.location.href = u.startsWith('/') ? `${getApiBaseUrl()}${u}` : u; })} />
                  </>
                )}
                {s.status === 'generating' && <span style={{ fontSize: '11px', color: 'var(--warning)' }}>Generating...</span>}
                {isEditor && <Btn label="Delete" danger onClick={() => { if (window.confirm('Delete?')) deleteMutation.mutate(s._id); }} />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History */}
      <div style={{ marginTop: '24px' }}>
        <button onClick={() => setShowHistory(!showHistory)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          History {showHistory ? '\u25B2' : '\u25BC'}
        </button>
        {showHistory && (historyData?.sides?.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
            {historyData.sides.map(s => (
              <div key={s._id} style={{ background: 'var(--gradient-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', opacity: 0.7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onMouseOver={e => e.currentTarget.style.opacity = '1'} onMouseOut={e => e.currentTarget.style.opacity = '0.7'}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600' }}>{s.title}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', gap: '10px', marginTop: '2px' }}>
                    <span>{s.totalScenes || 0} scenes</span>
                    <span>{dayjs(s.createdAt).format('MMM D, h:mm A')}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <Btn label="View" onClick={() => { window.location.href = `${getApiBaseUrl()}/api/sides/${s._id}/view`; }} />
                  <Btn label="Download" onClick={() => sidesApi.download(s._id).then(r => { const u = r.data.downloadUrl; window.location.href = u.startsWith('/') ? `${getApiBaseUrl()}${u}` : u; })} />
                </div>
              </div>
            ))}
          </div>
        ) : <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '12px', textAlign: 'center' }}>No history</div>)}
      </div>

      {showGenerateSides && (
        <GenerateSidesModal
          onClose={() => setShowGenerateSides(false)}
          onSuccess={() => { setShowGenerateSides(false); queryClient.invalidateQueries({ queryKey: ['sides'] }); }} />
      )}
    </div>
  );
}

function Btn({ label, onClick, primary, danger }) {
  return <button onClick={onClick} style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', border: 'none', background: primary ? 'var(--accent)' : 'var(--bg-card-hover)', color: danger ? 'var(--error)' : primary ? 'white' : 'var(--text-secondary)' }}>{label}</button>;
}

function Empty({ icon, title, desc, action, actionLabel }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--gradient-card)', borderRadius: '16px', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: '36px', marginBottom: '12px' }}>{icon}</div>
      <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px' }}>{title}</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: action ? '16px' : 0 }}>{desc}</p>
      {action && <button className="btn-primary" onClick={action}>{actionLabel}</button>}
    </div>
  );
}

export default SidesPage;
