import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { scriptsApi } from '../api/scripts.api';
import { getApiBaseUrl } from '../api/client';
import { toast } from 'react-toastify';
import UploadScriptModal from '../components/scripts/UploadScriptModal';
import dayjs from 'dayjs';

const formatIcons = { feature: '\uD83C\uDFAC', tv_episode: '\uD83D\uDCFA', short: '\uD83C\uDF9E', commercial: '\uD83D\uDCE2' };

function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Active script (only one)
  const { data: activeData, isLoading } = useQuery({
    queryKey: ['active-script'],
    queryFn: () => scriptsApi.getActive().then(r => r.data),
  });

  // History (archived scripts)
  const { data: historyData } = useQuery({
    queryKey: ['script-history'],
    queryFn: () => scriptsApi.getHistory({ limit: 50 }).then(r => r.data),
    enabled: showHistory,
  });

  const restoreMutation = useMutation({
    mutationFn: (id) => scriptsApi.restore(id),
    onSuccess: () => {
      toast.success('Script restored as active');
      queryClient.invalidateQueries({ queryKey: ['active-script'] });
      queryClient.invalidateQueries({ queryKey: ['script-history'] });
    },
    onError: () => toast.error('Restore failed'),
  });

  const activeScript = activeData?.script;
  const version = activeScript?.currentVersion;

  return (
    <div className="container" style={{ paddingTop: '32px', paddingBottom: '60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '4px' }}>Script</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            {activeScript ? 'Your current active script' : 'Upload a screenplay to get started'}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowUpload(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {activeScript ? 'Replace Script' : 'Upload Script'}
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 20px' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      )}

      {/* No active script */}
      {!isLoading && !activeScript && (
        <div style={{ textAlign: 'center', padding: '80px 20px', background: 'var(--gradient-card)', borderRadius: '20px', border: '1px solid var(--border)' }}>
          <div style={{ width: '80px', height: '80px', margin: '0 auto 24px', borderRadius: '20px', background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px' }}>
            {'\uD83C\uDFAC'}
          </div>
          <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>No active script</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '400px', margin: '0 auto 24px', lineHeight: '1.6' }}>
            Upload a screenplay PDF to start breaking it down with AI
          </p>
          <button className="btn-primary" onClick={() => setShowUpload(true)} style={{ padding: '12px 28px', fontSize: '14px' }}>
            Upload Script
          </button>
        </div>
      )}

      {/* Active Script — prominent card */}
      {!isLoading && activeScript && (
        <div style={{
          background: 'var(--gradient-card)', border: '1px solid var(--border-hover)',
          borderRadius: '20px', overflow: 'hidden', marginBottom: '32px',
          boxShadow: 'var(--shadow-md)',
        }}>
          <div style={{ height: '4px', background: 'var(--gradient-accent)' }} />
          <div style={{ padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ fontSize: '36px' }}>{formatIcons[activeScript.format] || '\uD83C\uDFAC'}</span>
                <div>
                  <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
                    {activeScript.title}
                  </h2>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', gap: '12px', marginTop: '4px', alignItems: 'center' }}>
                    <span className="badge badge-draft">{activeScript.status}</span>
                    <span>{activeScript.format}</span>
                    {version && <span>{version.pageCount || 0} pages</span>}
                    {version && <span>{version.versionLabel || `v${version.versionNumber}`}</span>}
                    <span>{dayjs(activeScript.updatedAt).format('MMM D, YYYY')}</span>
                  </div>
                </div>
              </div>
            </div>

            {activeScript.description && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px', lineHeight: '1.5' }}>
                {activeScript.description}
              </p>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '10px 18px' }}
                onClick={() => navigate(`/scripts/${activeScript._id}`)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                </svg>
                Open Script
              </button>
              {version && (
                <>
                  <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                    onClick={() => window.location.href = `${getApiBaseUrl()}/api/highlight/${version._id}`}>
                    View Script
                  </button>
                  <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                    onClick={() => navigate(`/scripts/${activeScript._id}/breakdown/${version._id}`)}>
                    {'\uD83E\uDDE0'} Breakdown
                  </button>
                  <button className="btn-secondary"
                    onClick={() => navigate(`/scripts/${activeScript._id}/analytics`)}>
                    Analytics
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* History Section */}
      <div>
        <button onClick={() => setShowHistory(!showHistory)}
          style={{
            background: 'none', border: 'none', color: 'var(--text-secondary)',
            fontSize: '14px', fontWeight: '600', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', marginBottom: '12px',
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          History {showHistory ? '\u25B2' : '\u25BC'}
        </button>

        {showHistory && (
          historyData?.scripts?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {historyData.scripts.map(script => (
                <div key={script._id} style={{
                  background: 'var(--gradient-card)', border: '1px solid var(--border)',
                  borderRadius: '12px', padding: '14px 18px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  opacity: 0.7, transition: 'opacity 0.2s',
                }}
                onMouseOver={e => e.currentTarget.style.opacity = '1'}
                onMouseOut={e => e.currentTarget.style.opacity = '0.7'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '18px' }}>{formatIcons[script.format] || '\uD83C\uDFAC'}</span>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{script.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '10px', marginTop: '2px' }}>
                        {script.currentVersion && <span>{script.currentVersion.pageCount || 0} pages</span>}
                        {script.currentVersion && <span>{script.currentVersion.versionLabel || `v${script.currentVersion.versionNumber}`}</span>}
                        <span>{dayjs(script.updatedAt).format('MMM D, YYYY')}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: '11px' }}
                      onClick={() => navigate(`/scripts/${script._id}`)}>
                      View
                    </button>
                    <button className="btn-primary" style={{ padding: '5px 12px', fontSize: '11px' }}
                      onClick={() => restoreMutation.mutate(script._id)}
                      disabled={restoreMutation.isPending}>
                      Restore
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '16px', textAlign: 'center' }}>
              No scripts in history
            </div>
          )
        )}
      </div>

      {showUpload && (
        <UploadScriptModal
          onClose={() => setShowUpload(false)}
          onSuccess={(scriptId) => {
            setShowUpload(false);
            queryClient.invalidateQueries({ queryKey: ['active-script'] });
            queryClient.invalidateQueries({ queryKey: ['script-history'] });
            navigate(`/scripts/${scriptId}`);
          }}
        />
      )}
    </div>
  );
}

export default DashboardPage;
