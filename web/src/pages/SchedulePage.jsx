import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { scheduleApi } from '../api/scripts.api';
import { getApiBaseUrl } from '../api/client';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';

function SchedulePage() {
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => scheduleApi.list({ limit: 50 }).then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => scheduleApi.delete(id),
    onSuccess: () => { toast.success('Schedule deleted'); queryClient.invalidateQueries({ queryKey: ['schedules'] }); },
  });

  const downloadMutation = useMutation({
    mutationFn: (id) => scheduleApi.download(id),
    onSuccess: (res) => { const u = res.data.downloadUrl; window.location.href = u.startsWith('/') ? `${getApiBaseUrl()}${u}` : u; },
  });

  return (
    <div className="container" style={{ paddingTop: '32px', paddingBottom: '60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '4px' }}>Shooting Schedule</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            {data?.total ? `${data.total} schedule${data.total > 1 ? 's' : ''} uploaded` : 'Upload and manage shooting schedules'}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowUpload(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload Schedule
        </button>
      </div>

      {isLoading ? (
        <div className="loading-spinner">Loading schedules...</div>
      ) : !data?.schedules?.length ? (
        <div style={{
          textAlign: 'center', padding: '80px 20px', background: 'var(--gradient-card)',
          borderRadius: '20px', border: '1px solid var(--border)',
        }}>
          <div style={{
            width: '80px', height: '80px', margin: '0 auto 24px', borderRadius: '20px',
            background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px',
          }}>{'\uD83D\uDCC5'}</div>
          <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>No schedules yet</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '400px', margin: '0 auto 24px' }}>
            Upload a shooting schedule PDF to parse shoot days, scenes, and locations
          </p>
          <button className="btn-primary" onClick={() => setShowUpload(true)} style={{ padding: '12px 28px' }}>
            Upload Your First Schedule
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {data.schedules.map(sched => (
            <ScheduleCard key={sched._id} schedule={sched}
              expanded={expandedId === sched._id}
              onToggle={() => setExpandedId(expandedId === sched._id ? null : sched._id)}
              onView={() => window.location.href = `${getApiBaseUrl()}/api/schedules/${sched._id}/view`}
              onDownload={() => downloadMutation.mutate(sched._id)}
              onDelete={() => { if (window.confirm('Delete this schedule?')) deleteMutation.mutate(sched._id); }}
            />
          ))}
        </div>
      )}

      {showUpload && (
        <UploadScheduleModal
          onClose={() => setShowUpload(false)}
          onSuccess={() => {
            setShowUpload(false);
            queryClient.invalidateQueries({ queryKey: ['schedules'] });
          }}
        />
      )}
    </div>
  );
}

function ScheduleCard({ schedule, expanded, onToggle, onView, onDownload, onDelete }) {
  return (
    <div style={{
      background: 'var(--gradient-card)', border: '1px solid var(--border)',
      borderRadius: '16px', overflow: 'hidden', transition: 'border-color 0.3s',
    }}>
      {/* Header accent */}
      <div style={{ height: '3px', background: 'var(--gradient-accent)' }} />

      <div style={{ padding: '18px 20px' }}>
        {/* Title row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={onToggle}>
            <span style={{ fontSize: '22px' }}>{'\uD83D\uDCC5'}</span>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>{schedule.title}</h3>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', gap: '12px' }}>
                <span>{schedule.totalDays || 0} days</span>
                <span>{schedule.totalScenes || 0} scenes</span>
                {schedule.startDate && <span>{schedule.startDate}</span>}
                {schedule.project && <span>{schedule.project.title}</span>}
                <span>{dayjs(schedule.createdAt).format('MMM D, YYYY')}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button onClick={onView} style={{
              display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 12px', borderRadius: '8px',
              fontSize: '11px', fontWeight: '600', background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
              </svg>
              View
            </button>
            <button onClick={onDownload} style={{
              padding: '5px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '600',
              background: 'var(--bg-card-hover)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)', cursor: 'pointer',
            }}>Download</button>
            <button onClick={onDelete} style={{
              padding: '5px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '600',
              background: 'var(--bg-card-hover)', color: 'var(--error)',
              border: '1px solid var(--border)', cursor: 'pointer',
            }}>Delete</button>
          </div>
        </div>

        {/* Expand toggle */}
        <button onClick={onToggle} style={{
          background: 'none', border: 'none', color: 'var(--accent)', fontSize: '12px',
          cursor: 'pointer', padding: '4px 0', fontWeight: '600',
        }}>
          {expanded ? 'Hide Details' : `Show ${schedule.totalDays || 0} Shoot Days`} {expanded ? '\u25B2' : '\u25BC'}
        </button>

        {/* Expanded shoot days */}
        {expanded && (
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(schedule.shootDays || []).map((day, i) => (
              <div key={i} style={{
                background: 'var(--bg-secondary)', borderRadius: '10px',
                border: '1px solid var(--border)', overflow: 'hidden',
              }}>
                <div style={{
                  padding: '8px 14px', background: 'var(--accent-glow)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ fontWeight: '700', fontSize: '13px' }}>Day {day.dayNumber} {day.date ? `\u2014 ${day.date}` : ''}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {day.scenes?.length || 0} scenes
                    {day.callTime ? ` \u00B7 Call: ${day.callTime}` : ''}
                    {day.location ? ` \u00B7 ${day.location}` : ''}
                  </span>
                </div>
                {day.scenes?.length > 0 && (
                  <div style={{ padding: '6px 14px' }}>
                    {day.scenes.map((s, j) => (
                      <div key={j} style={{
                        padding: '5px 0', borderBottom: j < day.scenes.length - 1 ? '1px solid var(--border)' : 'none',
                        display: 'flex', gap: '12px', fontSize: '12px',
                      }}>
                        <span style={{ fontWeight: '700', color: 'var(--accent)', minWidth: '30px' }}>{s.sceneNumber}</span>
                        <span style={{ color: 'var(--text-primary)', flex: 1 }}>{s.heading}</span>
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
    </div>
  );
}

function UploadScheduleModal({ onClose, onSuccess }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback((accepted) => {
    if (accepted.length > 0) {
      setFile(accepted[0]);
      if (!title) setTitle(`Shooting Schedule - ${new Date().toLocaleDateString()}`);
    }
  }, [title]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('title', title);
      const { data } = await scheduleApi.upload(formData, (e) => {
        if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
      });
      toast.success(`Schedule uploaded! ${data.parsed.totalDays} days, ${data.parsed.totalScenes} scenes found.`);
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div className="card" style={{ width: '500px', boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
        <h2 style={{
          marginBottom: '20px', fontSize: '22px', fontWeight: '800',
          background: 'var(--gradient-accent)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>Upload Shooting Schedule</h2>

        <form onSubmit={handleSubmit}>
          <div {...getRootProps()} style={{
            border: `2px dashed ${isDragActive ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: '16px', padding: '36px 20px', textAlign: 'center',
            marginBottom: '16px', cursor: 'pointer',
            background: isDragActive ? 'var(--accent-glow)' : 'var(--bg-primary)',
          }}>
            <input {...getInputProps()} />
            {file ? (
              <div>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>{'\u2705'}</div>
                <div style={{ fontWeight: 600 }}>{file.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>{'\uD83D\uDCC5'}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  {isDragActive ? 'Drop schedule PDF here' : 'Drag & drop a shooting schedule PDF'}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>or click to browse</div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Schedule title" />
          </div>

          {uploading && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '6px', overflow: 'hidden', height: '6px' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: 'var(--gradient-accent)', transition: 'width 0.3s', borderRadius: '6px' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!file || uploading}
              style={{ opacity: (!file || uploading) ? 0.5 : 1 }}>
              {uploading ? 'Processing...' : 'Upload & Parse'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SchedulePage;
