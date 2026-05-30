import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sidesApi, scriptsApi, scheduleApi } from '../api/scripts.api';
import { getApiBaseUrl } from '../api/client';
import { onEvent } from '../api/socket';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';
import AutogenerateSidesModal from '../components/sides/AutogenerateSidesModal';
import { useAuth } from '../context/AuthContext';

function SidesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEditor = user?.role === 'admin' || user?.role === 'editor';
  const [showHistory, setShowHistory] = useState(false);
  const [autogen, setAutogen] = useState(null); // { scriptId, callSheetId, scheduleId } | null

  // For the Autogenerate button: we need the active script + latest call sheet/schedule.
  const { data: activeScriptData } = useQuery({
    queryKey: ['active-script'],
    queryFn: () => scriptsApi.getActive().then(r => r.data),
    enabled: isEditor,
  });
  const { data: schedulesData } = useQuery({
    queryKey: ['schedules-all'],
    queryFn: () => scheduleApi.list({ limit: 1 }).then(r => r.data),
    enabled: isEditor,
  });
  // Historical scripts also carry usable scenes/pages, so the Generate gate
  // accepts an active script OR any script in history.
  const { data: scriptsHistoryData } = useQuery({
    queryKey: ['scripts-history'],
    queryFn: () => scriptsApi.getHistory({ limit: 1 }).then(r => r.data),
    enabled: isEditor,
  });

  const handleAutogenerate = () => {
    const activeScript = activeScriptData?.script;
    if (!activeScript?.currentVersion) {
      return toast.error('No published script available. Please upload script to generate sides');
    }
    // Call sheet is selected/uploaded inside the popup.
    setAutogen({
      scriptId: activeScript._id,
      scheduleId: schedulesData?.schedules?.[0]?._id || null,
    });
  };

  const handleGenerateSides = () => {
    const hasScript = !!activeScriptData?.script?.currentVersion;
    const hasHistory = (scriptsHistoryData?.scripts?.length || 0) > 0;
    if (!hasScript && !hasHistory) {
      return toast.error('No active script or pages found. Please upload script to pages to generate sides');
    }
    navigate('/sides/generate');
  };

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

  // Real-time refresh: when the backend broadcasts a sides status change,
  // invalidate the list so the new/updated row shows up without polling.
  useEffect(() => {
    const off = onEvent(({ event, data }) => {
      if (event !== 'sides:updated') return;
      queryClient.invalidateQueries({ queryKey: ['sides'] });
      queryClient.invalidateQueries({ queryKey: ['sides-history'] });
      if (data?.status === 'ready') toast.success(`Sides ready: ${data.title || 'Untitled'}`);
      if (data?.status === 'error') toast.error(`Sides failed: ${data.error || 'unknown error'}`);
    });
    return off;
  }, [queryClient]);

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
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-primary" onClick={handleAutogenerate} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" /></svg>
              Autogenerate Sides
            </button>
            <button className="btn-secondary" onClick={handleGenerateSides} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Generate Sides
            </button>
          </div>
        )}
      </div>

      {isLoading ? <div className="loading-spinner">Loading...</div>
      : !data?.sides?.length ? (
        <Empty icon={'\uD83D\uDCC4'} title="No sides yet" desc="Generate sides from your script using a call sheet or scene selection" action={isEditor ? handleGenerateSides : null} actionLabel="Generate Sides" />
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

      {autogen && (
        <AutogenerateSidesModal
          scriptId={autogen.scriptId}
          scheduleId={autogen.scheduleId}
          onClose={() => setAutogen(null)}
          onSuccess={() => { setAutogen(null); queryClient.invalidateQueries({ queryKey: ['sides'] }); }} />
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
