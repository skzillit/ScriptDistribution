import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { scriptsApi, breakdownApi } from '../api/scripts.api';
import { getApiBaseUrl } from '../api/client';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';

function ScriptDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: scriptData, isLoading } = useQuery({
    queryKey: ['script', id],
    queryFn: () => scriptsApi.get(id).then(r => r.data),
  });

  const breakdownMutation = useMutation({
    mutationFn: ({ versionId, mode }) =>
      breakdownApi.trigger(versionId, null, mode),
    onSuccess: (res, { versionId }) => {
      toast.success('Breakdown ready! Redirecting...');
      setTimeout(() => navigate(`/scripts/${id}/breakdown/${versionId}`), 500);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to start breakdown'),
  });

  const downloadMutation = useMutation({
    mutationFn: (versionId) => scriptsApi.downloadVersion(versionId),
    onSuccess: (res) => {
      const url = res.data.downloadUrl;
      window.location.href = url.startsWith('/') ? `${getApiBaseUrl()}${url}` : url;
    },
  });

  if (isLoading) return <div className="loading-spinner">Loading...</div>;

  const script = scriptData?.script;
  if (!script) return <div className="container" style={{ paddingTop: '24px' }}>Script not found</div>;

  const version = script.currentVersion;
  const versionId = version?._id;

  return (
    <div className="container" style={{ paddingTop: '32px', paddingBottom: '60px' }}>
      <Link to="/dashboard" style={{
        fontSize: '13px', color: 'var(--text-secondary)',
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        padding: '6px 12px', borderRadius: '8px',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
      }}>
        {'\u2190'} Back
      </Link>

      {/* Script Info */}
      <div style={{ marginTop: '20px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: '6px' }}>{script.title}</h1>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', gap: '16px', alignItems: 'center' }}>
              <span className={`badge badge-${script.status}`}>{script.status}</span>
              <span>{script.format}</span>
              {version && <span>{version.pageCount || 0} pages</span>}
              <span>Uploaded {dayjs(script.createdAt).format('MMM D, YYYY')}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-secondary" onClick={() => navigate(`/scripts/${id}/analytics`)}>
              Analytics
            </button>
          </div>
        </div>
        {script.description && (
          <p style={{ marginTop: '12px', color: 'var(--text-secondary)', fontSize: '14px' }}>{script.description}</p>
        )}
      </div>

      {/* Actions */}
      {versionId && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '14px' }}>Actions</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '10px 18px' }}
              onClick={() => scriptsApi.downloadVersion(versionId).then(r => {
                const url = r.data.downloadUrl;
                window.location.href = url.startsWith('/') ? `${getApiBaseUrl()}${url}` : url;
              })}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
              </svg>
              View Script
            </button>
            <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
              onClick={() => navigate(`/scripts/${id}/script-breakdown`)}>
              <span>{'\uD83D\uDD0D'}</span> Script Breakdown
            </button>
            <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
              onClick={() => downloadMutation.mutate(versionId)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download PDF
            </button>
          </div>
        </div>
      )}

      {/* Scenes */}
      {versionId && <ScenesSection versionId={versionId} />}
    </div>
  );
}

function ScenesSection({ versionId }) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['script-scenes', versionId],
    queryFn: () => scriptsApi.getScenes(versionId).then(r => r.data),
    enabled: !!versionId,
  });

  const scenes = data?.scenes || [];
  const filtered = filter
    ? scenes.filter(s =>
        s.sceneNumber.toLowerCase().includes(filter.toLowerCase()) ||
        s.heading.toLowerCase().includes(filter.toLowerCase()) ||
        s.location.toLowerCase().includes(filter.toLowerCase())
      )
    : scenes;

  const intCount = scenes.filter(s => s.intExt === 'INT').length;
  const extCount = scenes.filter(s => s.intExt === 'EXT').length;
  const dayCount = scenes.filter(s => /day/i.test(s.timeOfDay)).length;
  const nightCount = scenes.filter(s => /night/i.test(s.timeOfDay)).length;
  const locations = [...new Set(scenes.map(s => s.location).filter(Boolean))];

  return (
    <div className="card" style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: expanded ? '16px' : '0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: '16px' }}>Scenes</h3>
          {!isLoading && scenes.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', fontSize: '11px', flexWrap: 'wrap' }}>
              <span className="badge badge-approved">{scenes.length} total</span>
              <span className="badge badge-draft">INT {intCount}</span>
              <span className="badge badge-draft">EXT {extCount}</span>
              <span className="badge badge-draft">Day {dayCount}</span>
              <span className="badge badge-draft">Night {nightCount}</span>
              <span className="badge badge-draft">{locations.length} locations</span>
            </div>
          )}
        </div>
        {scenes.length > 0 && (
          <button onClick={() => setExpanded(!expanded)}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
            {expanded ? 'Collapse' : 'View All'} {expanded ? '\u25B2' : '\u25BC'}
          </button>
        )}
      </div>

      {isLoading && <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '8px 0' }}>Extracting scenes...</div>}

      {expanded && scenes.length > 0 && (
        <>
          <div style={{ marginBottom: '12px' }}>
            <input value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="Search scenes by number, heading, or location..."
              style={{ padding: '8px 12px', fontSize: '13px' }} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['#', 'INT/EXT', 'Location', 'Time', 'Pages'].map(h => (
                    <th key={h} style={{
                      padding: '8px 10px', textAlign: 'left', fontSize: '10px',
                      color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px',
                      borderBottom: '1px solid var(--border)', fontWeight: '700',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.sceneNumber} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: '700', color: 'var(--accent)' }}>{s.sceneNumber}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{
                        padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '700',
                        background: s.intExt === 'INT' ? 'rgba(76,175,80,0.12)' : s.intExt === 'EXT' ? 'rgba(33,150,243,0.12)' : 'var(--bg-secondary)',
                        color: s.intExt === 'INT' ? '#4caf50' : s.intExt === 'EXT' ? '#2196f3' : 'var(--text-muted)',
                      }}>{s.intExt || '-'}</span>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-primary)', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.location || s.heading}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{s.timeOfDay || '-'}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>
                      pp. {s.pageStart}{s.pageEnd && s.pageEnd !== s.pageStart ? `-${s.pageEnd}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filter && filtered.length === 0 && (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No scenes match "{filter}"</div>
          )}
          {filter && filtered.length > 0 && (
            <div style={{ padding: '8px 0', fontSize: '11px', color: 'var(--text-muted)' }}>Showing {filtered.length} of {scenes.length}</div>
          )}
        </>
      )}

      {!isLoading && scenes.length === 0 && (
        <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
          No scenes detected. Ensure the script has standard scene headings (INT./EXT.).
        </div>
      )}
    </div>
  );
}

export default ScriptDetailPage;
