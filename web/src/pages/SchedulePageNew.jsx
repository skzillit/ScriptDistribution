import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { scheduleApi } from '../api/scripts.api';
import { getApiBaseUrl } from '../api/client';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';
import { useAuth } from '../context/AuthContext';

function SchedulePageNew() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isEditor = user?.role === 'admin' || user?.role === 'editor';
  const [showUpload, setShowUpload] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => scheduleApi.list({ limit: 50 }).then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => scheduleApi.delete(id),
    onSuccess: () => { toast.success('Deleted'); queryClient.invalidateQueries({ queryKey: ['schedules'] }); },
  });

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '4px' }}>Shooting Schedule</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Upload and manage shooting schedules</p>
        </div>
        {isEditor && (
          <button className="btn-primary" onClick={() => setShowUpload(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            Upload Schedule
          </button>
        )}
      </div>

      {isLoading ? <div className="loading-spinner">Loading...</div>
      : !data?.schedules?.length ? (
        <Empty icon={'\uD83D\uDCC5'} title="No schedules" desc="Upload a shooting schedule PDF" action={isEditor ? () => setShowUpload(true) : null} actionLabel="Upload Schedule" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {data.schedules.map(sched => (
            <div key={sched._id} className="card" style={{ overflow: 'hidden' }}>
              <div style={{ height: '3px', background: 'var(--gradient-accent)', margin: '-22px -22px 16px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === sched._id ? null : sched._id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>{'\uD83D\uDCC5'}</span>
                    <span style={{ fontWeight: 700, fontSize: '14px' }}>{sched.title}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', gap: '12px' }}>
                    <span>{sched.totalDays || 0} days</span>
                    <span>{sched.totalScenes || 0} scenes</span>
                    {sched.startDate && <span>{sched.startDate}</span>}
                    <span>{dayjs(sched.createdAt).format('MMM D, YYYY')}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <Btn label="Breakdown" primary onClick={() => { window.location.href = `${getApiBaseUrl()}/api/schedules/${sched._id}/view?mode=breakdown`; }} />
                  <Btn label="PDF" onClick={() => { window.location.href = `${getApiBaseUrl()}/api/schedules/${sched._id}/view?mode=pdf`; }} />
                  {isEditor && <Btn label="Delete" danger onClick={() => { if (window.confirm('Delete?')) deleteMutation.mutate(sched._id); }} />}
                </div>
              </div>
              <button onClick={() => setExpanded(expanded === sched._id ? null : sched._id)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '12px', cursor: 'pointer', fontWeight: '600', padding: 0 }}>
                {expanded === sched._id ? 'Hide Days \u25B2' : `Show ${sched.totalDays || 0} Days \u25BC`}
              </button>
              {expanded === sched._id && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(sched.shootDays || []).map((day, i) => (
                    <div key={i} style={{ background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                      <div style={{ padding: '8px 12px', background: 'var(--accent-glow)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontWeight: 700, fontSize: '12px' }}>Day {day.dayNumber} {day.date ? `\u2014 ${day.date}` : ''}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{day.scenes?.length || 0} scenes{day.callTime ? ` \u00B7 ${day.callTime}` : ''}</span>
                      </div>
                      {day.scenes?.length > 0 && (
                        <div style={{ padding: '4px 12px' }}>
                          {day.scenes.map((s, j) => (
                            <div key={j} style={{ padding: '4px 0', borderBottom: j < day.scenes.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', gap: '10px', fontSize: '11px' }}>
                              <span style={{ fontWeight: 700, color: 'var(--accent)', minWidth: '30px' }}>{s.sceneNumber}</span>
                              <span style={{ flex: 1 }}>{s.heading}</span>
                              {s.pages && <span style={{ color: 'var(--text-muted)' }}>{s.pages}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showUpload && <UploadScheduleModal onClose={() => setShowUpload(false)} onSuccess={() => { setShowUpload(false); queryClient.invalidateQueries({ queryKey: ['schedules'] }); }} />}
    </div>
  );
}

function UploadScheduleModal({ onClose, onSuccess }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const onDrop = useCallback((a) => { if (a.length) { setFile(a[0]); if (!title) setTitle(`Shooting Schedule - ${new Date().toLocaleDateString()}`); } }, [title]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1 });
  const handleSubmit = async (e) => {
    e.preventDefault(); if (!file) return; setUploading(true);
    try {
      const fd = new FormData(); fd.append('pdf', file); fd.append('title', title);
      const { data } = await scheduleApi.upload(fd, (e) => { if (e.total) setProgress(Math.round((e.loaded / e.total) * 100)); });
      toast.success(`Uploaded! ${data.parsed.totalDays} days, ${data.parsed.totalScenes} scenes.`);
      onSuccess();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); } finally { setUploading(false); }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div className="card" style={{ width: '480px', boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: '20px', fontSize: '22px', fontWeight: '800', background: 'var(--gradient-accent)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Upload Schedule</h2>
        <form onSubmit={handleSubmit}>
          <div {...getRootProps()} style={{ border: `2px dashed ${isDragActive ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '14px', padding: '32px 16px', textAlign: 'center', marginBottom: '14px', cursor: 'pointer', background: isDragActive ? 'var(--accent-glow)' : 'var(--bg-primary)' }}>
            <input {...getInputProps()} />
            {file ? <div><div style={{ fontSize: '24px', marginBottom: '6px' }}>{'\u2705'}</div><div style={{ fontWeight: 600, fontSize: '13px' }}>{file.name}</div></div>
            : <div><div style={{ fontSize: '24px', marginBottom: '6px' }}>{'\uD83D\uDCC5'}</div><div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Drop schedule PDF here</div></div>}
          </div>
          <div style={{ marginBottom: '14px' }}><label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase' }}>Title</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Schedule title" /></div>
          {uploading && <div style={{ marginBottom: '14px' }}><div style={{ background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden', height: '5px' }}><div style={{ width: `${progress}%`, height: '100%', background: 'var(--gradient-accent)', transition: 'width 0.3s' }} /></div></div>}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!file || uploading} style={{ opacity: (!file || uploading) ? 0.5 : 1 }}>{uploading ? 'Processing...' : 'Upload & Parse'}</button>
          </div>
        </form>
      </div>
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

export default SchedulePageNew;
