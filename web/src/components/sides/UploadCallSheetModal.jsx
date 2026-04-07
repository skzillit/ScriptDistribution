import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { callSheetApi } from '../../api/scripts.api';
import { toast } from 'react-toastify';

function UploadCallSheetModal({ scriptId, onClose, onSuccess }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      if (!title) setTitle(`Call Sheet - ${new Date().toLocaleDateString()}`);
    }
  }, [title]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('title', title);
      if (scriptId) formData.append('scriptId', scriptId);

      const { data } = await callSheetApi.upload(formData, (e) => {
        if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
      });

      toast.success(`Call sheet uploaded! ${data.sceneCount} scenes found.`);
      onSuccess(data.callSheet);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div className="card" style={{ width: '480px', boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
        <h2 style={{
          marginBottom: '20px', fontSize: '22px', fontWeight: '800',
          background: 'var(--gradient-accent)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>Upload Call Sheet</h2>
        <form onSubmit={handleSubmit}>
          <div {...getRootProps()} style={{
            border: '2px dashed var(--border)',
            borderRadius: 'var(--radius)',
            padding: '28px',
            textAlign: 'center',
            marginBottom: '16px',
            cursor: 'pointer',
            background: isDragActive ? 'var(--bg-secondary)' : 'transparent',
          }}>
            <input {...getInputProps()} />
            {file ? (
              <div>
                <div style={{ fontWeight: 600 }}>{file.name}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)' }}>
                {isDragActive ? 'Drop call sheet PDF here' : 'Drag & drop a call sheet PDF, or click to browse'}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Call Sheet title" />
          </div>

          {uploading && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden', height: '6px' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!file || uploading}>
              {uploading ? 'Processing...' : 'Upload & Parse'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default UploadCallSheetModal;
