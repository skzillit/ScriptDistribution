import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scenePagesApi } from '../../api/scripts.api';
import { getApiBaseUrl } from '../../api/client';
import { toast } from 'react-toastify';

const PAGE_COLORS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#6d4c41', '#9e9e9e'];

/**
 * "Pages" — scene folders attached to a script. Each has a color, a scene
 * number (title), an optional description, and an uploaded PDF. These can be
 * pulled into a sides booklet from the Generate Sides screen.
 *
 * Used on both the Script dashboard (active script) and the Script detail page.
 */
export default function PagesSection({ scriptId }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null); // null | 'new' | folderObject

  const { data, isLoading } = useQuery({
    queryKey: ['scene-pages', scriptId],
    queryFn: () => scenePagesApi.list(scriptId).then(r => r.data),
    enabled: !!scriptId,
  });
  const folders = data?.scenePages || [];

  const deleteMutation = useMutation({
    mutationFn: (folderId) => scenePagesApi.remove(folderId),
    onSuccess: () => { toast.success('Page deleted'); queryClient.invalidateQueries({ queryKey: ['scene-pages', scriptId] }); },
    onError: (err) => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  if (!scriptId) return null;

  return (
    <div className="card" style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: folders.length ? '14px' : '0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h3 style={{ fontSize: '16px' }}>Pages</h3>
          {folders.length > 0 && <span className="badge badge-approved">{folders.length}</span>}
        </div>
        <button className="btn-primary" style={{ padding: '8px 14px', fontSize: '13px' }} onClick={() => setEditing('new')}>
          + Add Page
        </button>
      </div>

      {isLoading && <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '8px 0' }}>Loading…</div>}

      {!isLoading && folders.length === 0 && (
        <div style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
          No pages yet. Add scene folders (color, scene no., description, PDF) to pull into sides.
        </div>
      )}

      {folders.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {folders.map(f => (
            <div key={f._id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <span style={{ width: '14px', height: '14px', borderRadius: '4px', background: f.color || '#9e9e9e', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>Scene {f.sceneNumber}</div>
                {f.description && <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.description}</div>}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{f.pageCount || 0} pg</span>
              <button onClick={() => scenePagesApi.download(f._id).then(r => { const u = r.data.downloadUrl; window.open(u.startsWith('/') ? `${getApiBaseUrl()}${u}` : u, '_blank'); })}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '12px', cursor: 'pointer' }}>View</button>
              <button onClick={() => setEditing(f)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' }}>Edit</button>
              <button onClick={() => { if (window.confirm(`Delete page "Scene ${f.sceneNumber}"?`)) deleteMutation.mutate(f._id); }}
                style={{ background: 'none', border: 'none', color: '#e53935', fontSize: '12px', cursor: 'pointer' }}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <PageEditorModal
          scriptId={scriptId}
          folder={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); queryClient.invalidateQueries({ queryKey: ['scene-pages', scriptId] }); }}
        />
      )}
    </div>
  );
}

/** Add/edit modal for a scene folder. */
function PageEditorModal({ scriptId, folder, onClose, onSaved }) {
  const isEdit = !!folder;
  const [sceneNumber, setSceneNumber] = useState(folder?.sceneNumber || '');
  const [color, setColor] = useState(folder?.color || PAGE_COLORS[0]);
  const [description, setDescription] = useState(folder?.description || '');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!sceneNumber.trim()) return toast.error('Scene number (title) is required');
    if (!isEdit && !file) return toast.error('Please attach a PDF');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('sceneNumber', sceneNumber.trim());
      fd.append('color', color);
      fd.append('description', description);
      if (file) fd.append('pdf', file);
      if (isEdit) await scenePagesApi.update(folder._id, fd);
      else await scenePagesApi.create(scriptId, fd);
      toast.success(isEdit ? 'Page updated' : 'Page added');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const L = { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' };

  // Render to <body> so the fixed overlay isn't trapped by the parent .card's
  // backdrop-filter (which would otherwise position it relative to the card).
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div className="card" style={{ width: '480px', maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: '18px', fontSize: '20px', fontWeight: '800' }}>{isEdit ? 'Edit Page' : 'Add Page'}</h2>

        <div style={{ marginBottom: '14px' }}>
          <label style={L}>Scene No. (title)</label>
          <input value={sceneNumber} onChange={e => setSceneNumber(e.target.value)} placeholder="e.g. 12A" />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={L}>Color</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {PAGE_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)}
                style={{ width: '28px', height: '28px', borderRadius: '6px', background: c, cursor: 'pointer',
                  border: color === c ? '3px solid var(--text-primary)' : '2px solid var(--border)' }} />
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={L}>Description (optional)</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Short note" />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={L}>PDF or Final Draft (.fdx) {isEdit ? '(leave empty to keep current)' : ''}</label>
          <input type="file" accept="application/pdf,.fdx,application/xml,text/xml"
            onChange={e => setFile(e.target.files?.[0] || null)} />
          {isEdit && folder?.pageCount > 0 && !file && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Current PDF: {folder.pageCount} page(s)</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving} style={{ opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : (isEdit ? 'Save' : 'Add Page')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
