import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { callSheetApi, sidesApi, scheduleApi, scriptsApi } from '../../api/scripts.api';
import { getApiBaseUrl } from '../../api/client';
import { toast } from 'react-toastify';
import UploadCallSheetModal from './UploadCallSheetModal';
import UploadScheduleModal from './UploadScheduleModal';

/**
 * Autogenerate Sides popup.
 *
 * Call sheets are managed here (no standalone page): pick an existing call sheet
 * or upload a new one. Shows the selected call sheet's extracted scenes; an
 * optional "Rearrange order" field controls the order scenes appear (orderedScenes).
 */
function AutogenerateSidesModal({ scriptId, scheduleId, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [rearrange, setRearrange] = useState(false);
  const [orderInput, setOrderInput] = useState('');
  // 'hide' = only selected scenes (default), 'crossout' = full pages with
  // unselected scenes struck through.
  const [sceneDisplayMode, setSceneDisplayMode] = useState('hide');
  const [generating, setGenerating] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  // Schedule selection (mirrors call sheet): pick existing or upload new.
  const [selectedScheduleId, setSelectedScheduleId] = useState(scheduleId || '');
  const [showSchedUpload, setShowSchedUpload] = useState(false);
  // Review stage: generated draft (unpublished), whether it's been viewed, and publish/move busy flags.
  const [generated, setGenerated] = useState(null);
  const [viewed, setViewed] = useState(false);
  const [working, setWorking] = useState(false);

  // The script these sides will be generated from.
  const { data: scriptData } = useQuery({
    queryKey: ['script', scriptId],
    queryFn: () => scriptsApi.get(scriptId).then(r => r.data),
    enabled: !!scriptId,
  });
  const scriptName = scriptData?.script?.title;

  // Existing call sheets to choose from.
  const { data: listData } = useQuery({
    queryKey: ['callsheets'],
    queryFn: () => callSheetApi.list({ limit: 50 }).then(r => r.data),
  });
  const callSheets = listData?.callSheets || [];
  const publishedSheets = useMemo(() => callSheets.filter(cs => cs.source !== 'uploaded'), [callSheets]);
  const uploadedSheets = useMemo(() => callSheets.filter(cs => cs.source === 'uploaded'), [callSheets]);

  // Default to the latest call sheet once loaded.
  useEffect(() => {
    if (!selectedId && callSheets.length) setSelectedId(callSheets[0]._id);
  }, [callSheets, selectedId]);

  // Delete an uploaded call sheet (published ones are protected by the backend).
  const deleteSheet = async (id) => {
    if (!window.confirm('Delete this uploaded call sheet?')) return;
    try {
      await callSheetApi.delete(id);
      if (selectedId === id) { setSelectedId(''); setRearrange(false); setOrderInput(''); }
      queryClient.invalidateQueries({ queryKey: ['callsheets'] });
      toast.success('Call sheet deleted');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  // Schedules to choose from (optional), grouped like call sheets.
  const { data: schedListData } = useQuery({
    queryKey: ['schedules-all'],
    queryFn: () => scheduleApi.list({ limit: 50 }).then(r => r.data),
  });
  const schedules = schedListData?.schedules || [];
  const publishedScheds = useMemo(() => schedules.filter(s => s.source !== 'uploaded'), [schedules]);
  const uploadedScheds = useMemo(() => schedules.filter(s => s.source === 'uploaded'), [schedules]);

  const deleteSched = async (id) => {
    if (!window.confirm('Delete this uploaded schedule?')) return;
    try {
      await scheduleApi.delete(id);
      if (selectedScheduleId === id) setSelectedScheduleId('');
      queryClient.invalidateQueries({ queryKey: ['schedules-all'] });
      toast.success('Schedule deleted');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  const renderSched = (s, deletable) => {
    const on = selectedScheduleId === s._id;
    return (
      <div key={s._id} onClick={() => setSelectedScheduleId(s._id)}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', minHeight: '46px', borderRadius: '8px', cursor: 'pointer',
          border: '1px solid', borderColor: on ? 'var(--accent)' : 'var(--border)',
          background: on ? 'var(--accent-glow)' : 'var(--bg-secondary)' }}>
        <span style={{ width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
          border: '2px solid', borderColor: on ? 'var(--accent)' : 'var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {on && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)' }} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.totalDays || 0} days · {s.totalScenes || 0} scenes</div>
        </div>
        <button type="button" title="View schedule PDF" onClick={(e) => { e.stopPropagation(); window.open(`${getApiBaseUrl()}/api/schedules/${s._id}/view?mode=pdf`, '_blank'); }}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '12px', fontWeight: '600', cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}>View</button>
        {deletable && (
          <button type="button" title="Delete uploaded schedule" onClick={(e) => { e.stopPropagation(); deleteSched(s._id); }}
            style={{ background: 'none', border: 'none', color: '#e53935', fontSize: '15px', cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}>✕</button>
        )}
      </div>
    );
  };

  const renderCs = (cs, deletable) => {
    const on = selectedId === cs._id;
    return (
      <div key={cs._id}
        onClick={() => { setSelectedId(cs._id); setRearrange(false); setOrderInput(''); }}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', cursor: 'pointer',
          border: '1px solid', borderColor: on ? 'var(--accent)' : 'var(--border)',
          background: on ? 'var(--accent-glow)' : 'var(--bg-secondary)' }}>
        {/* Custom radio dot (global CSS styles <input> full-width, so avoid it) */}
        <span style={{ width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
          border: '2px solid', borderColor: on ? 'var(--accent)' : 'var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {on && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)' }} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cs.title}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{cs.scenes?.length || 0} scenes</div>
        </div>
        <button type="button" title="View call sheet PDF" onClick={(e) => { e.stopPropagation(); window.open(`${getApiBaseUrl()}/api/callsheets/${cs._id}/view?mode=pdf`, '_blank'); }}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '12px', fontWeight: '600', cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}>View</button>
        {deletable && (
          <button type="button" title="Delete uploaded call sheet" onClick={(e) => { e.stopPropagation(); deleteSheet(cs._id); }}
            style={{ background: 'none', border: 'none', color: '#e53935', fontSize: '15px', cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}>✕</button>
        )}
      </div>
    );
  };

  // Detail (scenes) for the selected call sheet.
  const { data: csDetail, isLoading } = useQuery({
    queryKey: ['callsheet', selectedId],
    queryFn: () => callSheetApi.get(selectedId).then(r => r.data),
    enabled: !!selectedId,
  });
  const callSheet = csDetail?.callSheet;
  const scenes = useMemo(() => (callSheet?.scenes || []).map(s => s.sceneNumber), [callSheet]);

  const enableRearrange = (on) => {
    setRearrange(on);
    if (on && !orderInput) setOrderInput(scenes.join(', '));
  };

  const orderedSceneList = useMemo(() => {
    if (rearrange) return orderInput.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    return scenes;
  }, [rearrange, orderInput, scenes]);

  // Generate a review draft (publish:false) — it is NOT posted to the Sides
  // module yet. Poll until rendering finishes, then show the success/View stage.
  const handleGenerate = async () => {
    if (!selectedId) return toast.error('Select or upload a call sheet first');
    if (orderedSceneList.length === 0) return toast.error('No scenes to generate');
    setGenerating(true);
    try {
      const { data } = await sidesApi.generate({
        scriptId,
        callSheetId: selectedId,
        scheduleId: selectedScheduleId || undefined,
        sceneNumbers: orderedSceneList.join(', '),
        includeCallSheet: true,
        includeCallSheetScenes: false,
        orderedScenes: true,
        publish: false,
        sceneDisplayMode,
        title: callSheet?.title ? `Sides - ${callSheet.title}` : undefined,
      });
      const sidesId = data.sides._id;
      setGenerated(data.sides);
      // Poll until the PDF is rendered (status ready) or errors out.
      for (let i = 0; i < 90; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const res = await sidesApi.get(sidesId);
          setGenerated(res.data.sides);
          if (res.data.sides.status === 'ready' || res.data.sides.status === 'error') break;
        } catch (_) { /* keep polling */ }
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to generate sides');
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!generated) return;
    setWorking(true);
    try {
      await sidesApi.publish(generated._id);
      toast.success('Published to Sides');
      onSuccess(generated);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Publish failed');
    } finally {
      setWorking(false);
    }
  };

  const handleMoveToDoc = async () => {
    if (!generated) return;
    setWorking(true);
    try {
      await sidesApi.moveToDocDistribution(generated._id);
      toast.success('Moved to Doc Distribution');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Move failed');
    } finally {
      setWorking(false);
    }
  };

  const L = { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div className="card" style={{ width: '560px', maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: '6px', fontSize: '22px', fontWeight: '800', background: 'var(--gradient-accent)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Autogenerate Sides</h2>
        <div style={{ marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <span>🎬</span>
          <span>Script: <strong style={{ color: 'var(--text-primary)' }}>{scriptName || '—'}</strong></span>
        </div>

        {!generated && (<>
        {/* Call sheets grouped: Published vs Uploaded; select which to generate from */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ ...L, marginBottom: 0 }}>Call sheet</label>
            <button type="button" className="btn-secondary" style={{ fontSize: '12px', whiteSpace: 'nowrap' }} onClick={() => setShowUpload(true)}>
              + Upload new
            </button>
          </div>

          {callSheets.length === 0 && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-secondary)' }}>
              No published call sheet - Upload one to generate sides
            </div>
          )}

          {publishedSheets.length > 0 && (
            <div style={{ marginBottom: uploadedSheets.length ? '12px' : 0 }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '5px' }}>Published</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {publishedSheets.map(cs => renderCs(cs, false))}
              </div>
            </div>
          )}

          {uploadedSheets.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '5px' }}>Uploaded</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {uploadedSheets.map(cs => renderCs(cs, true))}
              </div>
            </div>
          )}
        </div>

        {!selectedId ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px 0' }}>
            Select a call sheet above or upload a new one to continue.
          </div>
        ) : isLoading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px 0' }}>Loading call sheet…</div>
        ) : (
          <>
            {/* Extracted scenes */}
            <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '8px', marginBottom: '12px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: '600' }}>Extracted scenes (in call sheet order):</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                {scenes.length === 0
                  ? <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No scenes found in this call sheet.</span>
                  : scenes.map((sn, i) => <span key={i} style={{ background: 'var(--accent-glow)', color: 'var(--accent)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', border: '1px solid var(--border)' }}>{sn}</span>)}
              </div>
            </div>

            {/* Rearrange order */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: rearrange ? '8px' : '20px' }}>
              <input type="checkbox" checked={rearrange} onChange={e => enableRearrange(e.target.checked)} style={{ width: '15px', height: '15px', accentColor: 'var(--accent)' }} />
              Rearrange order
            </label>

            {rearrange && (
              <div style={{ marginBottom: '20px' }}>
                <label style={L}>Scene order  (Write the scene no. to arrange the order)</label>
                <input value={orderInput} onChange={e => setOrderInput(e.target.value)} placeholder="e.g. 12, 9, 14A, 7" />
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {orderedSceneList.length} scene(s): {orderedSceneList.join(', ')}
                </div>
              </div>
            )}
          </>
        )}

        {/* Schedule (optional): select existing or upload new */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ ...L, marginBottom: 0 }}>Schedule (optional)</label>
            <button type="button" className="btn-secondary" style={{ fontSize: '12px', whiteSpace: 'nowrap' }} onClick={() => setShowSchedUpload(true)}>
              + Upload new
            </button>
          </div>

          <div onClick={() => setSelectedScheduleId('')}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', minHeight: '46px', borderRadius: '8px', cursor: 'pointer', marginBottom: '8px',
              border: '1px solid', borderColor: !selectedScheduleId ? 'var(--accent)' : 'var(--border)',
              background: !selectedScheduleId ? 'var(--accent-glow)' : 'var(--bg-secondary)' }}>
            <span style={{ width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
              border: '2px solid', borderColor: !selectedScheduleId ? 'var(--accent)' : 'var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {!selectedScheduleId && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)' }} />}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No Published schedule</span>
          </div>

          {publishedScheds.length > 0 && (
            <div style={{ marginBottom: uploadedScheds.length ? '12px' : 0 }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '5px' }}>Published</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {publishedScheds.map(s => renderSched(s, false))}
              </div>
            </div>
          )}

          {uploadedScheds.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '5px' }}>Uploaded</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {uploadedScheds.map(s => renderSched(s, true))}
              </div>
            </div>
          )}
        </div>

        {/* Unselected-scene handling */}
        <div style={{ marginBottom: '16px' }}>
          <label style={L}>Unselected scenes</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { val: 'hide', title: 'Hide unselected scenes', desc: 'Only the selected scenes appear (current behavior).' },
              { val: 'crossout', title: 'Cross out unselected scenes', desc: 'Keep full pages; strike through scenes not selected.' },
            ].map(opt => (
              <div key={opt.val} onClick={() => setSceneDisplayMode(opt.val)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                  border: `1px solid ${sceneDisplayMode === opt.val ? 'var(--accent)' : 'var(--border)'}`,
                  background: sceneDisplayMode === opt.val ? 'var(--accent-glow)' : 'transparent' }}>
                <span style={{ width: '16px', height: '16px', borderRadius: '50%', marginTop: '2px', flexShrink: 0,
                  border: `2px solid ${sceneDisplayMode === opt.val ? 'var(--accent)' : 'var(--text-muted)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {sceneDisplayMode === opt.val && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)' }} />}
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{opt.title}</span>
                  <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{opt.desc}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleGenerate}
            disabled={generating || !selectedId || orderedSceneList.length === 0}
            style={{ opacity: (generating || !selectedId || orderedSceneList.length === 0) ? 0.5 : 1 }}>
            {generating ? 'Generating…' : 'Generate Sides'}
          </button>
        </div>
        </>)}

        {/* ── Review stage ── */}
        {generated && (
          <div>
            {generated.status === 'error' ? (
              <div style={{ padding: '12px 0' }}>
                <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--error, #e53935)', marginBottom: '6px' }}>Generation failed</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{generated.error || 'Something went wrong while generating sides.'}</div>
              </div>
            ) : generated.status !== 'ready' ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: '14px', fontWeight: '600' }}>Generating sides…</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>This usually takes under a minute.</div>
              </div>
            ) : (
              <div style={{ padding: '8px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', borderRadius: '10px', background: 'var(--accent-glow)', border: '1px solid var(--border)', marginBottom: '16px' }}>
                  <span style={{ fontSize: '22px' }}>✅</span>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>Sides generated successfully</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Review it, then publish or send to Doc Distribution.</div>
                  </div>
                </div>

                {!viewed ? (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn-primary"
                      onClick={() => { window.open(`${getApiBaseUrl()}/api/sides/${generated._id}/view`, '_blank'); setViewed(true); }}>
                      View
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button type="button" className="btn-secondary"
                      onClick={() => window.open(`${getApiBaseUrl()}/api/sides/${generated._id}/view`, '_blank')}>
                      View again
                    </button>
                    <button type="button" className="btn-secondary" disabled={working} onClick={handleMoveToDoc}>
                      Move to Doc Distribution
                    </button>
                    <button className="btn-primary" disabled={working} onClick={handlePublish}>
                      {working ? 'Publishing…' : 'Publish'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showUpload && (
        <UploadCallSheetModal
          source="uploaded"
          onClose={() => setShowUpload(false)}
          onSuccess={(cs) => {
            setShowUpload(false);
            queryClient.invalidateQueries({ queryKey: ['callsheets'] });
            if (cs?._id) { setSelectedId(cs._id); setRearrange(false); setOrderInput(''); }
          }}
        />
      )}

      {showSchedUpload && (
        <UploadScheduleModal
          source="uploaded"
          onClose={() => setShowSchedUpload(false)}
          onSuccess={(s) => {
            setShowSchedUpload(false);
            queryClient.invalidateQueries({ queryKey: ['schedules-all'] });
            if (s?._id) setSelectedScheduleId(s._id);
          }}
        />
      )}
    </div>
  );
}

export default AutogenerateSidesModal;
