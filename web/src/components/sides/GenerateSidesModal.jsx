import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { scriptsApi, callSheetApi, sidesApi, scheduleApi } from '../../api/scripts.api';
import { toast } from 'react-toastify';

function GenerateSidesModal({ onClose, onSuccess, preSelectedCallSheet }) {
  const [selectedCallSheet, setSelectedCallSheet] = useState(preSelectedCallSheet || '');
  const [selectedSchedule, setSelectedSchedule] = useState('');
  const [callSheetPages, setCallSheetPages] = useState('all');
  const [includeSchedule, setIncludeSchedule] = useState(false);
  const [manualScenes, setManualScenes] = useState('');
  const [pickedScenes, setPickedScenes] = useState(new Set());
  const [title, setTitle] = useState('');
  const [generating, setGenerating] = useState(false);

  // Get active script (auto-selected, no manual choice needed)
  const { data: activeData } = useQuery({
    queryKey: ['active-script'],
    queryFn: () => scriptsApi.getActive().then(r => r.data),
  });

  const activeScript = activeData?.script;
  const activeVersionId = activeScript?.currentVersion?._id || activeScript?.currentVersion || '';

  // Scenes from the active script
  const { data: scenesData, isLoading: scenesLoading } = useQuery({
    queryKey: ['script-scenes', activeVersionId],
    queryFn: () => scriptsApi.getScenes(activeVersionId).then(r => r.data),
    enabled: !!activeVersionId,
  });

  const { data: callSheetsData } = useQuery({
    queryKey: ['callsheets'],
    queryFn: () => callSheetApi.list({ limit: 100 }).then(r => r.data),
  });

  const { data: callSheetDetail } = useQuery({
    queryKey: ['callsheet', selectedCallSheet],
    queryFn: () => callSheetApi.get(selectedCallSheet).then(r => r.data),
    enabled: !!selectedCallSheet,
  });

  const { data: schedulesData } = useQuery({
    queryKey: ['schedules-all'],
    queryFn: () => scheduleApi.list({ limit: 100 }).then(r => r.data),
  });

  const { data: scheduleDetail } = useQuery({
    queryKey: ['schedule-detail', selectedSchedule],
    queryFn: () => scheduleApi.get(selectedSchedule).then(r => r.data),
    enabled: !!selectedSchedule,
  });

  // Auto-select latest call sheet if none pre-selected
  useEffect(() => {
    if (!selectedCallSheet && callSheetsData?.callSheets?.length) {
      const draft = callSheetsData.callSheets.find(cs => cs.status === 'draft') || callSheetsData.callSheets[0];
      if (draft) setSelectedCallSheet(draft._id);
    }
  }, [callSheetsData, selectedCallSheet]);

  // Auto-select latest schedule
  useEffect(() => {
    if (!selectedSchedule && schedulesData?.schedules?.length) {
      const draft = schedulesData.schedules.find(s => s.status === 'draft') || schedulesData.schedules[0];
      if (draft) setSelectedSchedule(draft._id);
    }
  }, [schedulesData, selectedSchedule]);

  const scriptScenes = scenesData?.scenes || [];
  const callSheetScenes = callSheetDetail?.callSheet?.scenes || [];
  const shootDays = scheduleDetail?.schedule?.shootDays || [];

  const toggleScene = (num) => {
    setPickedScenes(prev => { const n = new Set(prev); if (n.has(num)) n.delete(num); else n.add(num); return n; });
  };
  const selectAll = () => setPickedScenes(new Set(scriptScenes.map(s => s.sceneNumber)));
  const selectNone = () => setPickedScenes(new Set());

  const finalSceneNumbers = useMemo(() => {
    const set = new Set([...pickedScenes]);
    if (manualScenes.trim()) manualScenes.split(/[,;\s]+/).filter(Boolean).forEach(s => set.add(s.trim()));
    if (selectedCallSheet && callSheetScenes.length) callSheetScenes.forEach(s => set.add(s.sceneNumber));
    return [...set];
  }, [pickedScenes, manualScenes, selectedCallSheet, callSheetScenes]);

  // Find the best matching shoot day + pick extra scenes from other days
  const { matchedShootDays, extraSceneInfo } = useMemo(() => {
    if (!shootDays.length || !callSheetScenes.length) return { matchedShootDays: [], extraSceneInfo: [] };
    const csSceneSet = new Set(callSheetScenes.map(s => String(s.sceneNumber).toUpperCase()));

    // Find the best matching day
    let bestDay = null;
    let bestOverlap = 0;
    for (const day of shootDays) {
      const overlap = (day.scenes || []).filter(s => csSceneSet.has(String(s.sceneNumber).toUpperCase()));
      if (overlap.length > bestOverlap) {
        bestOverlap = overlap.length;
        bestDay = { ...day, matchedScenes: overlap };
      }
    }

    const result = bestDay ? [bestDay] : [];

    // Find call sheet scenes NOT in the best day's schedule
    const bestDaySceneNums = new Set((bestDay?.matchedScenes || []).map(s => String(s.sceneNumber).toUpperCase()));
    const extraScenes = [...csSceneSet].filter(sn => !bestDaySceneNums.has(sn));

    // For each extra scene, find which day in the schedule has it
    const extras = [];
    for (const extraSn of extraScenes) {
      for (const day of shootDays) {
        const found = (day.scenes || []).find(s => String(s.sceneNumber).toUpperCase() === extraSn);
        if (found) {
          extras.push({
            sceneNumber: extraSn,
            scene: found,
            dayNumber: day.dayNumber,
            date: day.date,
          });
          break;
        }
      }
    }

    return { matchedShootDays: result, extraSceneInfo: extras };
  }, [shootDays, callSheetScenes]);

  const handleGenerate = async () => {
    if (!activeScript) return toast.error('No active script found');
    if (finalSceneNumbers.length === 0) return toast.error('Please select at least one scene');

    setGenerating(true);
    try {
      const { data } = await sidesApi.generate({
        scriptId: activeScript._id,
        callSheetId: selectedCallSheet || undefined,
        sceneNumbers: finalSceneNumbers.join(', '),
        title: title || undefined,
        mode: 'manual',
        includeCallSheet: selectedCallSheet ? true : false,
        callSheetPages: callSheetPages,
        scheduleId: includeSchedule && selectedSchedule ? selectedSchedule : undefined,
        primaryDay: includeSchedule && matchedShootDays.length ? matchedShootDays[0].dayNumber : undefined,
        matchedDays: includeSchedule && matchedShootDays.length
          ? [...new Set([...matchedShootDays.map(d => d.dayNumber), ...extraSceneInfo.map(e => e.dayNumber)])]
          : undefined,
      });
      toast.success('Sides generation started!');
      onSuccess(data.sides);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to generate sides');
    } finally {
      setGenerating(false);
    }
  };

  const L = { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div className="card" style={{ width: '620px', maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: '20px', fontSize: '22px', fontWeight: '800', background: 'var(--gradient-accent)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Customize Sides</h2>

        {/* Call Sheet (auto-selected, read-only) */}
        {selectedCallSheet && callSheetDetail?.callSheet ? (
          <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>{'\uD83D\uDCCB'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{callSheetDetail.callSheet.title}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{callSheetScenes.length} scenes{callSheetDetail.callSheet.crewCall ? ` \u00B7 Call: ${callSheetDetail.callSheet.crewCall}` : ''}</div>
            </div>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: '4px' }}>Call Sheet</span>
          </div>
        ) : (
          <div style={{ marginBottom: '4px', padding: '10px 14px', borderRadius: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-muted)' }}>
            {'\uD83D\uDCCB'} No call sheet uploaded
          </div>
        )}
        {selectedCallSheet && callSheetDetail?.callSheet && (
          <div style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Include pages:</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {['all', '1', '2', '3'].map(opt => (
                <button key={opt} onClick={() => setCallSheetPages(opt)}
                  style={{
                    padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
                    cursor: 'pointer', border: '1px solid', transition: 'all 0.15s',
                    background: callSheetPages === opt ? 'var(--accent)' : 'var(--bg-card)',
                    color: callSheetPages === opt ? 'white' : 'var(--text-secondary)',
                    borderColor: callSheetPages === opt ? 'var(--accent)' : 'var(--border)',
                  }}>
                  {opt === 'all' ? 'All' : `Page ${opt}`}
                </button>
              ))}
              <input
                type="number" min="1" max="20" placeholder="Custom"
                value={!['all','1','2','3'].includes(callSheetPages) ? callSheetPages : ''}
                onChange={e => setCallSheetPages(e.target.value || 'all')}
                style={{ width: '70px', padding: '4px 8px', fontSize: '11px', borderRadius: '6px', textAlign: 'center' }}
              />
            </div>
          </div>
        )}
        {callSheetScenes.length > 0 && (
          <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '8px', marginBottom: '12px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: '600' }}>Call sheet scenes:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
              {callSheetScenes.map((s, i) => <span key={i} style={{ background: 'var(--accent-glow)', color: 'var(--accent)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', border: '1px solid var(--border)' }}>{s.sceneNumber}</span>)}
            </div>
          </div>
        )}

        {/* Shooting Schedule (auto-selected, read-only) */}
        {selectedSchedule && scheduleDetail?.schedule ? (
          <div style={{ marginBottom: '4px', padding: '10px 14px', borderRadius: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>{'\uD83D\uDCC5'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{scheduleDetail.schedule.title}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{scheduleDetail.schedule.totalDays} days \u00B7 {scheduleDetail.schedule.totalScenes} scenes</div>
            </div>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: '4px' }}>Schedule</span>
          </div>
        ) : (
          <div style={{ marginBottom: '4px', padding: '10px 14px', borderRadius: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-muted)' }}>
            {'\uD83D\uDCC5'} No shooting schedule uploaded
          </div>
        )}
        {selectedSchedule && scheduleDetail?.schedule && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', padding: '4px 0' }}>
            <input type="checkbox" checked={includeSchedule} onChange={e => setIncludeSchedule(e.target.checked)} style={{ width: '15px', height: '15px', accentColor: 'var(--accent)' }} />
            Include Schedule in sides
          </label>
        )}

        {selectedSchedule && matchedShootDays.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Matched Shoot Day
            </div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
              {matchedShootDays.map((day, i) => (
                <div key={i} style={{ padding: '10px 14px', borderBottom: i < matchedShootDays.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--accent)' }}>{'\uD83D\uDCC5'} Day {day.dayNumber}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {day.date}{day.callTime ? ` \u00B7 ${day.callTime}` : ''}{day.location ? ` \u00B7 ${day.location}` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                    {day.matchedScenes.map((s, j) => (
                      <span key={j} style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', background: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
                        {s.sceneNumber} {s.location?.slice(0, 15)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Extra scenes from call sheet not in this day */}
            {extraSceneInfo.length > 0 && (
              <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', background: 'rgba(255, 87, 34, 0.05)' }}>
                <div style={{ fontSize: '10px', color: 'var(--warning)', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Extra scenes (not in Day {matchedShootDays[0]?.dayNumber} — pulled from other days)
                </div>
                {extraSceneInfo.map((ex, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0', fontSize: '11px' }}>
                    <span style={{ fontWeight: '700', color: 'var(--accent)' }}>Sc. {ex.sceneNumber}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {ex.scene?.intExt} {ex.scene?.location?.slice(0, 25)} {ex.scene?.timeOfDay ? `- ${ex.scene.timeOfDay}` : ''}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '1px 6px', borderRadius: '4px' }}>
                      from Day {ex.dayNumber}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Manual */}
        <div style={{ marginBottom: '12px' }}>
          <label style={L}>Additional Scenes (manual)</label>
          <input value={manualScenes} onChange={e => setManualScenes(e.target.value)} placeholder="e.g. 1, 3, 5-8" />
        </div>

        {/* Summary */}
        {finalSceneNumbers.length > 0 && (
          <div style={{ marginBottom: '12px', padding: '8px 12px', borderRadius: '8px', background: 'var(--accent-glow)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-primary)' }}>
            <strong>{finalSceneNumbers.length} scene(s):</strong> {finalSceneNumbers.join(', ')}
            {includeSchedule && matchedShootDays.length > 0 && <span style={{ marginLeft: '8px', color: 'var(--accent)' }}>+ {matchedShootDays.length} shoot day(s)</span>}
          </div>
        )}

        {/* Title */}
        <div style={{ marginBottom: '20px' }}>
          <label style={L}>Title (optional)</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Auto-generated" />
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleGenerate}
            disabled={generating || !activeScript || finalSceneNumbers.length === 0}
            style={{ opacity: (generating || !activeScript || finalSceneNumbers.length === 0) ? 0.5 : 1 }}>
            {generating ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GenerateSidesModal;
