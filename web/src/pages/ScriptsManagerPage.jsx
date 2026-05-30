import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { scriptsApi } from '../api/scripts.api';
import { getApiBaseUrl } from '../api/client';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';
import PagesSection from '../components/scripts/PagesSection';
import { useAuth } from '../context/AuthContext';

/**
 * Scripts manager — list every script, upload multiple, manage each script's
 * Pages, replace/delete a script. Scripts (and their pages) feed Generate Sides.
 */
function ScriptsManagerPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isEditor = user?.role === 'admin' || user?.role === 'editor';
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['scripts'],
    queryFn: () => scriptsApi.list({ limit: 100 }).then(r => r.data),
  });
  const scripts = data?.scripts || [];

  const deleteMutation = useMutation({
    mutationFn: (id) => scriptsApi.delete(id),
    onSuccess: () => { toast.success('Script deleted'); queryClient.invalidateQueries({ queryKey: ['scripts'] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Delete failed'),
  });

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '4px' }}>Scripts</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Upload scripts and manage their pages — used to generate sides</p>
        </div>
        {isEditor && (
          <button className="btn-primary" onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Add Script
          </button>
        )}
      </div>

      {isLoading ? <div className="loading-spinner">Loading...</div>
      : scripts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--gradient-card)', borderRadius: '16px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>🎬</div>
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px' }}>No scripts yet</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>Add a script (PDF/FDX) — or create one by name and add pages first.</p>
          {isEditor && <button className="btn-primary" onClick={() => setShowAdd(true)}>Add Script</button>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {scripts.map(s => (
            <ScriptCardManager key={s._id} script={s} isEditor={isEditor}
              onDelete={() => {
                if (window.confirm('Deleting this script will also delete the pages uploaded under it. Continue?')) {
                  deleteMutation.mutate(s._id);
                }
              }}
              onChanged={() => queryClient.invalidateQueries({ queryKey: ['scripts'] })}
            />
          ))}
        </div>
      )}

      {showAdd && <AddScriptModal onClose={() => setShowAdd(false)} onSuccess={() => { setShowAdd(false); queryClient.invalidateQueries({ queryKey: ['scripts'] }); }} />}
    </div>
  );
}

/** One script: header (title + version), replace/delete actions, and its Pages. */
function ScriptCardManager({ script, isEditor, onDelete, onChanged }) {
  const version = script.currentVersion;
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState(false);

  const replace = async (file) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('pdf', file);
      fd.append('versionLabel', `v${(version?.versionNumber || 0) + 1}`);
      await scriptsApi.uploadVersion(script._id, fd);
      toast.success('Script file updated');
      onChanged();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '14px', background: 'var(--gradient-card)', padding: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>{script.title}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '12px', marginTop: '4px' }}>
            {version
              ? <><span>{version.pageCount || 0} pages</span><span>{version.versionLabel || `v${version.versionNumber}`}</span></>
              : <span style={{ color: 'var(--warning, #fb8c00)' }}>No script file yet — add pages or upload a file</span>}
            <span>{dayjs(script.updatedAt).format('MMM D, YYYY')}</span>
          </div>
        </div>
        {isEditor && (
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            {version && (
              <button className="btn-secondary" style={{ fontSize: '12px' }}
                onClick={() => setViewing(true)}>View</button>
            )}
            <ReplaceButton uploading={uploading} hasVersion={!!version} onFile={replace} />
            <button style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: '#e53935', fontSize: '12px', fontWeight: '600', cursor: 'pointer', padding: '6px 12px' }}
              onClick={onDelete}>Delete</button>
          </div>
        )}
      </div>

      {/* Pages under this script */}
      <PagesSection scriptId={script._id} />

      {viewing && version && (
        <ScriptPdfViewerModal
          title={script.title}
          versionLabel={version.versionLabel || `v${version.versionNumber}`}
          versionId={version._id}
          onClose={() => setViewing(false)}
        />
      )}
    </div>
  );
}

/** Inline PDF viewer — fetches a signed download URL and embeds the raw PDF. */
function ScriptPdfViewerModal({ title, versionLabel, versionId, onClose }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(null);
  React.useEffect(() => {
    let alive = true;
    scriptsApi.downloadVersion(versionId)
      .then(r => {
        if (!alive) return;
        const u = r.data?.downloadUrl;
        if (!u) { setErr('No download URL'); return; }
        setUrl(u.startsWith('/') ? `${getApiBaseUrl()}${u}` : u);
      })
      .catch(e => alive && setErr(e.response?.data?.error || 'Failed to load PDF'));
    return () => { alive = false; };
  }, [versionId]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}
      onClick={onClose}>
      <div className="card" style={{ width: 'min(1100px, 100%)', height: '92vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{versionLabel}</div>
          </div>
          {url && (
            <button type="button" className="btn-secondary" style={{ fontSize: '12px' }}
              onClick={() => window.open(url, '_blank')}>Open in new tab</button>
          )}
          <button type="button" onClick={onClose}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', cursor: 'pointer' }}>Close</button>
        </div>
        {err ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--error, #e53935)', fontSize: '13px' }}>{err}</div>
        ) : !url ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Loading PDF…</div>
        ) : (
          <iframe title="Script PDF" src={`${url}#toolbar=1&navpanes=0&view=FitH`}
            style={{ flex: 1, width: '100%', border: 'none', background: '#525659' }} />
        )}
      </div>
    </div>
  );
}

function ReplaceButton({ uploading, hasVersion, onFile }) {
  const { getRootProps, getInputProps } = useDropzone({
    accept: { 'application/pdf': ['.pdf'], 'application/xml': ['.fdx'], 'text/xml': ['.fdx'], 'application/octet-stream': ['.fdx'] },
    maxFiles: 1,
    onDrop: (files) => { if (files[0]) onFile(files[0]); },
  });
  return (
    <span {...getRootProps()} style={{ display: 'inline-block' }}>
      <input {...getInputProps()} />
      <button type="button" className="btn-secondary" style={{ fontSize: '12px' }} disabled={uploading}>
        {uploading ? 'Uploading…' : (hasVersion ? 'Replace' : 'Upload Script')}
      </button>
    </span>
  );
}

/** Add a new script: title (required) + optional PDF/FDX (pages can be added later). */
function AddScriptModal({ onClose, onSuccess }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const onDrop = useCallback((files) => {
    if (files[0]) { setFile(files[0]); if (!title) setTitle(files[0].name.replace(/\.(pdf|fdx)$/i, '')); }
  }, [title]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'application/xml': ['.fdx'], 'text/xml': ['.fdx'], 'application/octet-stream': ['.fdx'] },
    maxFiles: 1,
  });

  const save = async () => {
    if (!title.trim()) return toast.error('Script name is required');
    setSaving(true);
    try {
      const { data } = await scriptsApi.create({ title: title.trim() });
      const scriptId = data.script._id;
      if (file) {
        const fd = new FormData();
        fd.append('pdf', file);
        fd.append('versionLabel', 'v1');
        await scriptsApi.uploadVersion(scriptId, fd);
      }
      toast.success('Script added');
      onSuccess();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to add script');
    } finally {
      setSaving(false);
    }
  };

  const L = { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div className="card" style={{ width: '480px', boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: '18px', fontSize: '20px', fontWeight: '800' }}>Add Script</h2>

        <div style={{ marginBottom: '14px' }}>
          <label style={L}>Script name</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Episode 101" />
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label style={L}>Script file (optional — PDF or .fdx)</label>
          <div {...getRootProps()} style={{ border: '2px dashed var(--border)', borderRadius: 'var(--radius)', padding: '22px', textAlign: 'center', cursor: 'pointer', background: isDragActive ? 'var(--bg-secondary)' : 'transparent' }}>
            <input {...getInputProps()} />
            {file ? <div style={{ fontWeight: 600, fontSize: '13px' }}>{file.name}</div>
              : <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Drag & drop, or click to browse. You can add pages later without a file.</div>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving} style={{ opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Add Script'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ScriptsManagerPage;
