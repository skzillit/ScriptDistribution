import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { scriptsApi, manualScenesApi, sceneCandidatesApi } from '../api/scripts.api';
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
  const [managingScenes, setManagingScenes] = useState(false);

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
              <>
                <button className="btn-secondary" style={{ fontSize: '12px' }}
                  onClick={() => setViewing(true)}>View</button>
                <button className="btn-secondary" style={{ fontSize: '12px' }}
                  title="Review auto-detected scenes and add any the system missed"
                  onClick={() => setManagingScenes(true)}>Scenes</button>
              </>
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

      {managingScenes && version && (
        <ManageScenesModal
          scriptTitle={script.title}
          versionLabel={version.versionLabel || `v${version.versionNumber}`}
          versionId={version._id}
          pageCount={version.pageCount || null}
          onClose={() => setManagingScenes(false)}
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

/**
 * Manage Scenes modal — view the auto-detected scene list for a script version
 * and add / edit / delete manual scene markers for anything the auto-detector
 * missed. Surfaces a side-by-side: scene list on the left, inline add/edit
 * form on the right. Manual entries override auto entries with the same
 * scene number.
 */
function ManageScenesModal({ scriptTitle, versionLabel, versionId, pageCount, onClose }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['version-scenes', versionId],
    queryFn: () => scriptsApi.getScenes(versionId).then(r => r.data),
  });
  const scenes = data?.scenes || [];

  // Heading candidates — every line our detector saw, including the ones
  // that didn't get a scene number. The user clicks one to pre-fill the
  // "Add manual scene" form (the practical equivalent of "selecting" a
  // line in the PDF without needing a custom canvas viewer).
  const { data: candidatesData } = useQuery({
    queryKey: ['scene-candidates', versionId],
    queryFn: () => sceneCandidatesApi.list(versionId).then(r => r.data),
    staleTime: 60 * 1000,
  });
  const candidates = candidatesData?.candidates || [];

  // Signed URL to the raw script PDF — fetched once and embedded in the left
  // pane so users can flip through the script while marking scenes.
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfError, setPdfError] = useState(null);
  React.useEffect(() => {
    let alive = true;
    scriptsApi.downloadVersion(versionId)
      .then(r => {
        if (!alive) return;
        const u = r.data?.downloadUrl;
        if (!u) { setPdfError('No PDF stored for this version'); return; }
        setPdfUrl(u.startsWith('/') ? `${getApiBaseUrl()}${u}` : u);
      })
      .catch(e => alive && setPdfError(e.response?.data?.error || 'Failed to load PDF'));
    return () => { alive = false; };
  }, [versionId]);

  // null = closed; {} = add-new form open; { ... } = edit existing
  const [form, setForm] = useState(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['version-scenes', versionId] });

  const autoCount = scenes.filter(s => s.source !== 'manual').length;
  const manualCount = scenes.filter(s => s.source === 'manual').length;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}
      onClick={onClose}>
      <div className="card" style={{ width: 'min(1400px, 100%)', height: '92vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '2px' }}>Scenes — {scriptTitle}</h2>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {versionLabel}{pageCount ? ` · ${pageCount} pages` : ''} · {autoCount} auto-detected{manualCount > 0 ? ` · ${manualCount} manual` : ''}
            </div>
          </div>
          <button type="button" onClick={onClose}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', cursor: 'pointer' }}>Close</button>
        </div>

        <div style={{ display: 'flex', gap: '14px', flex: 1, minHeight: 0 }}>
          {/* LEFT — embedded PDF so the user can flip through the script
              while marking scenes from it, plus a "Pick from script" panel
              below it with every detected heading the user can click on. */}
          <div style={{ flex: 1.4, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden' }}>
            <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', background: '#525659', display: 'flex' }}>
              {pdfError ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--error, #e53935)', fontSize: '12px', background: 'var(--bg-secondary)' }}>{pdfError}</div>
              ) : !pdfUrl ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '12px', background: 'var(--bg-secondary)' }}>Loading PDF…</div>
              ) : (
                <iframe title="Script PDF" src={`${pdfUrl}#toolbar=1&navpanes=0&view=FitH`}
                  style={{ flex: 1, width: '100%', border: 'none', background: 'white' }} />
              )}
            </div>
            <SceneCandidatesPanel
              candidates={candidates}
              existing={scenes}
              onPick={(c) => setForm({
                sceneNumber: c.sceneNumber || '',
                heading: c.heading || '',
                pageStart: c.pageNumber,
                pageEnd: c.pageNumber,
              })}
            />
          </div>

          {/* RIGHT — scenes table (+ inline add/edit form when active) */}
          <div style={{ flex: 1, minWidth: '360px', display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button type="button" className="btn-primary" style={{ fontSize: '12px' }}
                onClick={() => setForm({})}>+ Add scene manually</button>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Use the PDF to find the page, then type it in.
              </span>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, border: '1px solid var(--border)', borderRadius: '8px' }}>
              {isLoading ? (
                <div style={{ padding: '14px', fontSize: '12px', color: 'var(--text-muted)' }}>Loading scenes…</div>
              ) : scenes.length === 0 ? (
                <div style={{ padding: '14px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  No scenes were detected automatically. Add scenes manually to make them available in Generate Sides.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px', fontWeight: '700', color: 'var(--text-secondary)', fontSize: '10px', textTransform: 'uppercase' }}>#</th>
                      <th style={{ padding: '8px 10px', fontWeight: '700', color: 'var(--text-secondary)', fontSize: '10px', textTransform: 'uppercase' }}>Heading</th>
                      <th style={{ padding: '8px 10px', fontWeight: '700', color: 'var(--text-secondary)', fontSize: '10px', textTransform: 'uppercase', textAlign: 'right' }}>Pg</th>
                      <th style={{ padding: '8px 10px', fontWeight: '700', color: 'var(--text-secondary)', fontSize: '10px', textTransform: 'uppercase' }}>Src</th>
                      <th style={{ padding: '8px 10px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenes.map((s, i) => {
                      const isManual = s.source === 'manual';
                      return (
                        <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 10px', fontWeight: '700', color: 'var(--text-primary)' }}>{s.sceneNumber}</td>
                          <td style={{ padding: '6px 10px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}
                            title={s.heading || ''}>{s.heading || ''}</td>
                          <td style={{ padding: '6px 10px', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {s.pageStart || '—'}{s.pageEnd && s.pageEnd !== s.pageStart ? `–${s.pageEnd}` : ''}
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <span style={{
                              display: 'inline-block', padding: '1px 6px', borderRadius: '999px', fontSize: '9px', fontWeight: '700', letterSpacing: '0.3px', textTransform: 'uppercase',
                              background: isManual ? 'var(--accent-glow)' : 'var(--bg-secondary)',
                              color: isManual ? 'var(--accent)' : 'var(--text-muted)',
                            }}>{isManual ? 'manual' : 'auto'}</span>
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {isManual ? (
                              <button type="button"
                                onClick={() => setForm(s)}
                                style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '11px', fontWeight: '600', cursor: 'pointer', padding: '2px 6px' }}>Edit</button>
                            ) : (
                              <button type="button"
                                onClick={() => setForm({ sceneNumber: s.sceneNumber, heading: s.heading, pageStart: s.pageStart, pageEnd: s.pageEnd })}
                                title="Replace this auto-detected entry with a manual override"
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '600', cursor: 'pointer', padding: '2px 6px' }}>Override</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {form && (
              <ManualSceneForm
                versionId={versionId}
                pageCount={pageCount}
                existing={form.manualId ? form : null}
                prefill={form.manualId ? null : form}
                onClose={() => setForm(null)}
                onSaved={() => { setForm(null); refresh(); }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Side-panel form inside ManageScenesModal — used both for "Add manual scene"
 * and for "Override / Edit". Self-contained: handles validation, save, delete.
 */
function ManualSceneForm({ versionId, pageCount, existing, prefill, onClose, onSaved }) {
  const isEdit = !!existing && !!existing.manualId;
  const seed = existing || prefill || {};
  const [sceneNumber, setSceneNumber] = useState(seed.sceneNumber || '');
  const [heading, setHeading] = useState(seed.heading || '');
  const [pageStart, setPageStart] = useState(seed.pageStart != null ? String(seed.pageStart) : '');
  const [pageEnd, setPageEnd] = useState(seed.pageEnd != null && seed.pageEnd !== seed.pageStart ? String(seed.pageEnd) : '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const sn = sceneNumber.trim();
    const hd = heading.trim();
    const ps = Number(pageStart);
    const pe = pageEnd.trim() === '' ? null : Number(pageEnd);
    if (!sn) return toast.error('Scene number is required');
    if (!hd) return toast.error('Heading is required');
    if (!Number.isFinite(ps) || ps < 1) return toast.error('Start page must be a positive number');
    if (pe != null && (!Number.isFinite(pe) || pe < ps)) return toast.error('End page must be ≥ start page');
    if (pageCount && ps > pageCount) return toast.error(`Start page exceeds the script length (${pageCount} pages).`);
    setSaving(true);
    try {
      const body = { sceneNumber: sn, heading: hd, pageStart: ps, pageEnd: pe };
      if (isEdit) await manualScenesApi.update(existing.manualId, body);
      else await manualScenesApi.create(versionId, body);
      toast.success(isEdit ? 'Manual scene updated' : 'Manual scene added');
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save manual scene');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!isEdit) return;
    if (!window.confirm('Delete this manual scene?')) return;
    setSaving(true);
    try {
      await manualScenesApi.remove(existing.manualId);
      toast.success('Manual scene deleted');
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to delete');
    } finally {
      setSaving(false);
    }
  };

  const L = { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' };

  return (
    <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{isEdit ? 'Edit manual scene' : 'Add manual scene'}</strong>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1, cursor: 'pointer' }}>×</button>
      </div>
      <div>
        <label style={L}>Scene number</label>
        <input value={sceneNumber} onChange={e => setSceneNumber(e.target.value)} placeholder="e.g. 73B" />
      </div>
      <div>
        <label style={L}>Heading</label>
        <input value={heading} onChange={e => setHeading(e.target.value)} placeholder='e.g. "Some Years Ago"' />
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <label style={L}>Start page</label>
          <input type="number" min="1" value={pageStart} onChange={e => setPageStart(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={L}>End page</label>
          <input type="number" min="1" value={pageEnd} onChange={e => setPageEnd(e.target.value)} placeholder={pageStart || '—'} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
        {isEdit && (
          <button type="button" onClick={remove} disabled={saving}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', color: '#e53935', fontSize: '11px', fontWeight: '600', cursor: 'pointer', marginRight: 'auto' }}>Delete</button>
        )}
        <button type="button" className="btn-secondary" style={{ fontSize: '12px' }} onClick={onClose}>Cancel</button>
        <button className="btn-primary" style={{ fontSize: '12px', opacity: saving ? 0.5 : 1 }} disabled={saving} onClick={submit}>
          {saving ? 'Saving…' : (isEdit ? 'Save' : 'Add')}
        </button>
      </div>
    </div>
  );
}

/**
 * Compact, scrollable list of every heading line the auto-detector noticed —
 * including the unnumbered / stylized ones the post-pass would otherwise
 * drop. The user clicks a row to pre-fill the "Add manual scene" form with
 * the heading text and page number.
 *
 * Rows already represented in `existing` (auto OR manual) get a check mark
 * but stay clickable (so the user can still use a candidate to override).
 */
function SceneCandidatesPanel({ candidates, existing, onPick }) {
  const [query, setQuery] = React.useState('');
  const existingHeadings = React.useMemo(() => {
    const m = new Map();
    for (const s of existing || []) {
      m.set(`${(s.heading || '').toUpperCase().trim()}__${s.pageStart || ''}`, true);
    }
    return m;
  }, [existing]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return candidates;
    return candidates.filter(c => (c.heading || '').toUpperCase().includes(q) || String(c.pageNumber).includes(q));
  }, [candidates, query]);

  return (
    <div style={{ height: '200px', display: 'flex', flexDirection: 'column', gap: '6px', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px', background: 'var(--bg-secondary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>Pick from script</strong>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{candidates.length} heading{candidates.length === 1 ? '' : 's'} detected — click any to pre-fill the form.</span>
        <span style={{ flex: 1 }} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter…"
          style={{ width: '160px', padding: '4px 8px', fontSize: '11px' }} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-card)' }}>
        {candidates.length === 0 ? (
          <div style={{ padding: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>No heading candidates detected.</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>No matches.</div>
        ) : (
          filtered.map((c, i) => {
            const used = existingHeadings.has(`${(c.heading || '').toUpperCase().trim()}__${c.pageNumber || ''}`);
            return (
              <button key={i} type="button" onClick={() => onPick(c)}
                title="Pre-fill the manual-scene form with this heading"
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', gap: '8px',
                  padding: '5px 10px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                  fontSize: '11px', color: 'var(--text-primary)',
                }}>
                <span style={{ fontWeight: '700', minWidth: '28px', color: c.sceneNumber ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {c.sceneNumber || '—'}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.heading || '(empty)'}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>p{c.pageNumber}</span>
                {used && <span title="Already in the scenes list" style={{ fontSize: '11px', color: 'var(--success, #4caf50)' }}>✓</span>}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export default ScriptsManagerPage;
