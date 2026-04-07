import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { scriptsApi } from '../../api/scripts.api';
import { getApiBaseUrl } from '../../api/client';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';

const formatIcons = {
  feature: '\uD83C\uDFAC',
  tv_episode: '\uD83D\uDCFA',
  short: '\uD83C\uDF9E',
  commercial: '\uD83D\uDCE2',
};

function ScriptCard({ script }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const version = script.currentVersion;
  const [renaming, setRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState(script.title);

  const renameMutation = useMutation({
    mutationFn: (title) => scriptsApi.update(script._id, { title }),
    onSuccess: () => {
      toast.success('Script renamed');
      queryClient.invalidateQueries({ queryKey: ['scripts'] });
      setRenaming(false);
    },
    onError: () => toast.error('Rename failed'),
  });

  const handleRename = (e) => {
    e.stopPropagation();
    if (newTitle.trim() && newTitle !== script.title) {
      renameMutation.mutate(newTitle.trim());
    } else {
      setRenaming(false);
    }
  };

  const handleView = (e) => {
    e.stopPropagation();
    if (version?._id) {
      window.location.href = `${getApiBaseUrl()}/api/highlight/${version._id}`;
    } else {
      toast.error('No version available to view');
    }
  };

  const handleDownload = (e) => {
    e.stopPropagation();
    if (version?._id) {
      scriptsApi.downloadVersion(version._id).then(res => {
        const url = res.data.downloadUrl;
        window.location.href = url.startsWith('/') ? `${getApiBaseUrl()}${url}` : url;
      });
    }
  };

  return (
    <div
      onClick={() => navigate(`/scripts/${script._id}`)}
      style={{
        background: 'var(--gradient-card)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '0',
        cursor: 'pointer',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
        position: 'relative',
      }}
      onMouseOver={e => {
        e.currentTarget.style.borderColor = 'var(--border-hover)';
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = 'var(--shadow-md)';
      }}
      onMouseOut={e => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Top accent bar */}
      <div style={{
        height: '3px',
        background: script.status === 'approved'
          ? 'linear-gradient(90deg, var(--success), #2e7d32)'
          : 'var(--gradient-accent)',
      }} />

      <div style={{ padding: '18px 20px' }}>
        {/* Title row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '22px', flexShrink: 0 }}>{formatIcons[script.format] || '\uD83C\uDFAC'}</span>
            {renaming ? (
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onBlur={handleRename}
                onKeyDown={e => { if (e.key === 'Enter') handleRename(e); if (e.key === 'Escape') setRenaming(false); }}
                onClick={e => e.stopPropagation()}
                autoFocus
                style={{
                  flex: 1, fontSize: '15px', fontWeight: '700', padding: '4px 8px',
                  borderRadius: '6px', background: 'var(--bg-primary)', border: '1px solid var(--accent)',
                }}
              />
            ) : (
              <h3 style={{
                fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)',
                letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {script.title}
              </h3>
            )}
          </div>
          <span className={`badge badge-${script.status}`} style={{ flexShrink: 0, marginLeft: '8px' }}>
            {script.status}
          </span>
        </div>

        {script.description && (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: '1.5' }}>
            {script.description.slice(0, 90)}{script.description.length > 90 ? '...' : ''}
          </p>
        )}

        {/* Meta */}
        <div style={{
          display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-muted)',
          fontWeight: '500', letterSpacing: '0.3px', marginBottom: '12px',
        }}>
          {version && (
            <>
              <span>{version.pageCount || 0} pages</span>
              <span style={{ color: 'var(--border-hover)' }}>|</span>
              <span>{version.versionLabel || `v${version.versionNumber}`}</span>
            </>
          )}
          <span style={{ color: 'var(--border-hover)' }}>|</span>
          <span>{dayjs(script.updatedAt).format('MMM D, YYYY')}</span>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleView}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '5px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '600',
              background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
            </svg>
            View
          </button>
          <button onClick={(e) => { e.stopPropagation(); setRenaming(true); setNewTitle(script.title); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '5px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '600',
              background: 'var(--bg-card-hover)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.2s',
            }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Rename
          </button>
          {version && (
            <button onClick={handleDownload}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '5px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '600',
                background: 'var(--bg-card-hover)', color: 'var(--text-secondary)',
                border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.2s',
              }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ScriptCard;
