import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api/scripts.api';
import dayjs from 'dayjs';

function AnalyticsPage() {
  const { id } = useParams();

  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ['analytics', id],
    queryFn: () => analyticsApi.getAnalytics(id).then(r => r.data),
  });

  const { data: viewersData } = useQuery({
    queryKey: ['viewers', id],
    queryFn: () => analyticsApi.getViewers(id).then(r => r.data),
  });

  const { data: downloadsData } = useQuery({
    queryKey: ['downloads', id],
    queryFn: () => analyticsApi.getDownloads(id).then(r => r.data),
  });

  if (isLoading) return <div className="loading-spinner">Loading analytics...</div>;

  const summary = analyticsData?.summary || {};

  return (
    <div className="container" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
      <Link to={`/scripts/${id}`} style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
        &larr; Back to Script
      </Link>

      <h1 className="page-title" style={{ marginTop: '16px' }}>Analytics</h1>

      {/* Summary cards */}
      <div className="grid-3" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-value">{summary.totalViews || 0}</div>
          <div className="stat-label">Total Views</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{summary.uniqueViewers || 0}</div>
          <div className="stat-label">Unique Viewers</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{summary.totalDownloads || 0}</div>
          <div className="stat-label">Downloads</div>
        </div>
      </div>

      {/* Viewers list */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>Viewers</h3>
        {!viewersData?.viewers?.length ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No viewers yet</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '8px 0', fontSize: '12px', color: 'var(--text-secondary)' }}>User</th>
                <th style={{ padding: '8px 0', fontSize: '12px', color: 'var(--text-secondary)' }}>Views</th>
                <th style={{ padding: '8px 0', fontSize: '12px', color: 'var(--text-secondary)' }}>Last Viewed</th>
              </tr>
            </thead>
            <tbody>
              {viewersData.viewers.map((v, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 0', fontSize: '14px' }}>{v.user?.name || 'Unknown'}</td>
                  <td style={{ padding: '10px 0', fontSize: '14px' }}>{v.viewCount}</td>
                  <td style={{ padding: '10px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {dayjs(v.lastViewed).format('MMM D, YYYY h:mm A')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Downloads list */}
      <div className="card">
        <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>
          Download History <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 400 }}>
            ({downloadsData?.total || 0} total)
          </span>
        </h3>
        {!downloadsData?.downloads?.length ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No downloads yet</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {downloadsData.downloads.slice(0, 20).map((d, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '8px 0', borderBottom: '1px solid var(--border)',
                fontSize: '13px',
              }}>
                <span>{d.user?.name || 'Unknown'}</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {d.scriptVersion?.versionLabel || 'unknown version'} &middot; {dayjs(d.createdAt).format('MMM D, h:mm A')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AnalyticsPage;
