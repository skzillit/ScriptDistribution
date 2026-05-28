import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { callSheetApi } from '../api/scripts.api';
import { getApiBaseUrl } from '../api/client';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';
import UploadCallSheetModal from '../components/sides/UploadCallSheetModal';
import { useAuth } from '../context/AuthContext';

function CallSheetPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isEditor = user?.role === 'admin' || user?.role === 'editor';
  const [showUpload, setShowUpload] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['callsheets'],
    queryFn: () => callSheetApi.list({ limit: 50 }).then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => callSheetApi.delete(id),
    onSuccess: () => { toast.success('Deleted'); queryClient.invalidateQueries({ queryKey: ['callsheets'] }); },
  });

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '4px' }}>Call Sheet</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Upload and manage call sheets</p>
        </div>
        {isEditor && (
          <button className="btn-primary" onClick={() => setShowUpload(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Add Call Sheet
          </button>
        )}
      </div>

      {isLoading ? <div className="loading-spinner">Loading...</div>
      : !data?.callSheets?.length ? (
        <Empty icon={'\uD83D\uDCCB'} title="No call sheets" desc="Add a call sheet PDF to extract scenes" action={isEditor ? () => setShowUpload(true) : null} actionLabel="Add Call Sheet" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {data.callSheets.map(cs => (
            <div key={cs._id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{cs.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '12px' }}>
                    <span>{cs.scenes?.length || 0} scenes</span>
                    {cs.crewCall && <span>Call: {cs.crewCall}</span>}
                    {cs.location && <span>{cs.location.substring(0, 30)}</span>}
                    <span>{dayjs(cs.createdAt).format('MMM D, YYYY')}</span>
                  </div>
                  {cs.scenes?.length > 0 && (
                    <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                      {cs.scenes.slice(0, 15).map((s, i) => (
                        <span key={i} style={{ background: 'var(--bg-secondary)', padding: '2px 5px', borderRadius: '4px', fontSize: '10px', color: 'var(--text-secondary)' }}>{s.sceneNumber}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <Btn label="View" primary onClick={() => { window.location.href = `${getApiBaseUrl()}/api/callsheets/${cs._id}/view?mode=pdf`; }} />
                  {isEditor && <Btn label="Delete" danger onClick={() => { if (window.confirm('Delete?')) deleteMutation.mutate(cs._id); }} />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showUpload && <UploadCallSheetModal onClose={() => setShowUpload(false)} onSuccess={() => { setShowUpload(false); queryClient.invalidateQueries({ queryKey: ['callsheets'] }); }} />}
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

export default CallSheetPage;
