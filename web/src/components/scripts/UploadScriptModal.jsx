import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { scriptsApi } from '../../api/scripts.api';
import { toast } from 'react-toastify';

function UploadScriptModal({ onClose, onSuccess }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState('feature');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      if (!title) setTitle(acceptedFiles[0].name.replace('.pdf', ''));
    }
  }, [title]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !title) return;

    setUploading(true);
    try {
      const { data: scriptData } = await scriptsApi.create({ title, description, format });
      const scriptId = scriptData.script._id;

      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('versionLabel', 'v1');

      await scriptsApi.uploadVersion(scriptId, formData, (e) => {
        if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
      });

      toast.success('Script uploaded successfully!');
      onSuccess(scriptId);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
      animation: 'fadeIn 0.2s ease',
    }} onClick={onClose}>
      <div style={{
        width: '520px',
        background: 'var(--gradient-card)',
        border: '1px solid var(--border)',
        borderRadius: '20px',
        padding: '32px',
        boxShadow: 'var(--shadow-lg)',
        maxHeight: '90vh',
        overflow: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <h2 style={{
          fontSize: '22px', fontWeight: '800', marginBottom: '24px',
          background: 'linear-gradient(135deg, #6c5ce7, #e94560)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>Upload Script</h2>

        <form onSubmit={handleSubmit}>
          <div {...getRootProps()} style={{
            border: `2px dashed ${isDragActive ? 'var(--accent)' : 'rgba(108, 92, 231, 0.2)'}`,
            borderRadius: '16px',
            padding: '40px 20px',
            textAlign: 'center',
            marginBottom: '20px',
            cursor: 'pointer',
            background: isDragActive ? 'var(--accent-glow)' : 'var(--bg-primary)',
            transition: 'all 0.3s',
          }}>
            <input {...getInputProps()} />
            {file ? (
              <div>
                <div style={{
                  width: '48px', height: '48px', margin: '0 auto 12px',
                  borderRadius: '12px',
                  background: 'rgba(0, 210, 160, 0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '22px',
                }}>{'\u2705'}</div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{file.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
            ) : (
              <div>
                <div style={{
                  width: '48px', height: '48px', margin: '0 auto 12px',
                  borderRadius: '12px',
                  background: 'rgba(108, 92, 231, 0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '22px',
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6c5ce7" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  {isDragActive ? 'Drop the PDF here' : 'Drag & drop a screenplay PDF'}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                  or click to browse (max 50MB)
                </div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="Enter script title" />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" rows={3} />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Format</label>
            <select value={format} onChange={e => setFormat(e.target.value)}>
              <option value="feature">Feature Film</option>
              <option value="tv_episode">TV Episode</option>
              <option value="short">Short Film</option>
              <option value="commercial">Commercial</option>
            </select>
          </div>

          {uploading && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{
                background: 'rgba(108, 92, 231, 0.1)', borderRadius: '6px',
                overflow: 'hidden', height: '6px',
              }}>
                <div style={{
                  width: `${progress}%`, height: '100%',
                  background: 'linear-gradient(90deg, #6c5ce7, #e94560)',
                  transition: 'width 0.3s',
                  borderRadius: '6px',
                }} />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', textAlign: 'center' }}>{progress}%</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!file || !title || uploading}
              style={{ opacity: (!file || !title || uploading) ? 0.5 : 1 }}>
              {uploading ? 'Uploading...' : 'Upload Script'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default UploadScriptModal;
