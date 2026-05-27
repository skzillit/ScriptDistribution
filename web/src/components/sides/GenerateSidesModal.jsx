import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { scriptsApi, callSheetApi, sidesApi, scheduleApi, scenePagesApi } from '../../api/scripts.api';
import { toast } from 'react-toastify';

/**
 * One collapsible row per script version. Lazily loads that version's scenes
 * (only when expanded) and lets the user toggle individual scenes. Selection is
 * lifted to the parent via callbacks so it survives collapse/expand.
 */
function VersionScenePicker({ version, isCurrent, picked, onToggleScene, onSelectAll, onClear }) {
  const [open, setOpen] = useState(isCurrent);
  const { data, isLoading } = useQuery({
    queryKey: ['version-scenes', version._id],
    queryFn: () => scriptsApi.getScenes(version._id).then(r => r.data),
    enabled: open,
  });
  const scenes = data?.scenes || [];
  const label = version.versionLabel || `v${version.versionNumber}`;
  const pickedSet = new Set(picked);

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', cursor: 'pointer' }}>
        <span style={{ fontSize: '11px', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: 'var(--text-muted)' }}>{'▶'}</span>
        <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)' }}>{label}</span>
        {isCurrent && <span style={{ fontSize: '9px', color: 'var(--accent)', background: 'var(--accent-glow)', padding: '1px 6px', borderRadius: '4px' }}>CURRENT</span>}
        <span style={{ flex: 1 }} />
        {picked.length > 0 && <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: '600' }}>{picked.length} selected</span>}
      </div>
      {open && (
        <div style={{ padding: '0 12px 10px' }}>
          {isLoading ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '6px 0' }}>Loading scenes…</div>
          ) : scenes.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '6px 0' }}>No scenes detected.</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '6px' }}>
                <button type="button" onClick={() => onSelectAll(scenes.map(s => s.sceneNumber))}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '11px', cursor: 'pointer', padding: 0 }}>Select all</button>
                <button type="button" onClick={onClear}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', padding: 0 }}>Clear</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {scenes.map((s, i) => {
                  const on = pickedSet.has(s.sceneNumber);
                  return (
                    <button key={i} type="button" title={s.heading || ''} onClick={() => onToggleScene(s.sceneNumber)}
                      style={{
                        padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                        border: '1px solid', transition: 'all .12s',
                        background: on ? 'var(--accent)' : 'var(--bg-card)',
                        color: on ? 'white' : 'var(--text-secondary)',
                        borderColor: on ? 'var(--accent)' : 'var(--border)',
                      }}>
                      {s.sceneNumber}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Lists the versions of one script (active or historical) as a labelled group,
 * each version expandable into its scene picker. Versions are fetched per script
 * so historical scripts' data isn't loaded until shown.
 */
function ScriptVersionsGroup({ script, isActive, activeVersionId, versionPicks, onToggleScene, onSetScenes }) {
  const { data, isLoading } = useQuery({
    queryKey: ['script-versions', script._id],
    queryFn: () => scriptsApi.listVersions(script._id).then(r => r.data),
  });
  const versions = data?.versions || [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-primary)' }}>{script.title}</span>
        <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 6px', borderRadius: '4px',
          color: isActive ? 'var(--accent)' : 'var(--text-muted)',
          background: isActive ? 'var(--accent-glow)' : 'var(--bg-card)' }}>
          {isActive ? 'ACTIVE' : 'HISTORY'}
        </span>
      </div>
      {isLoading ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '4px 0 4px 8px' }}>Loading versions…</div>
      ) : versions.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '4px 0 4px 8px' }}>No versions.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '8px' }}>
          {versions.map(v => (
            <VersionScenePicker
              key={v._id}
              version={v}
              isCurrent={isActive && String(v._id) === String(activeVersionId)}
              picked={versionPicks[v._id] || []}
              onToggleScene={(sn) => onToggleScene(v._id, sn)}
              onSelectAll={(all) => onSetScenes(v._id, all)}
              onClear={() => onSetScenes(v._id, [])}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One collapsible Page (scene folder). Lazily loads the scenes detected in the
 * page's PDF and lets the user toggle individual scenes — exactly like a script
 * version. If no scenes are detected, offers an "include whole PDF" checkbox.
 */
function FolderScenePicker({ folder, picked, whole, onToggleScene, onSelectAll, onClear, onToggleWhole }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['scene-page-scenes', folder._id],
    queryFn: () => scenePagesApi.scenes(folder._id).then(r => r.data),
    enabled: open,
  });
  const scenes = data?.scenes || [];
  const pickedSet = new Set(picked);
  const selectedCount = picked.length + (whole ? 1 : 0);

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', cursor: 'pointer' }}>
        <span style={{ fontSize: '11px', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: 'var(--text-muted)' }}>{'▶'}</span>
        <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: folder.color || '#9e9e9e', flexShrink: 0 }} />
        <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)' }}>Scene {folder.sceneNumber}</span>
        {folder.description && <span style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.description}</span>}
        <span style={{ flex: 1 }} />
        {selectedCount > 0 && <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: '600' }}>{whole ? 'whole PDF' : `${picked.length} selected`}</span>}
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{folder.pageCount || 0} pg</span>
      </div>
      {open && (
        <div style={{ padding: '0 12px 10px' }}>
          {isLoading ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '6px 0' }}>Loading scenes…</div>
          ) : scenes.length === 0 ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', padding: '4px 0' }}>
              <input type="checkbox" checked={whole} onChange={onToggleWhole} style={{ width: '15px', height: '15px', accentColor: 'var(--accent)' }} />
              No scenes detected — include entire PDF
            </label>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '6px' }}>
                <button type="button" onClick={() => onSelectAll(scenes.map(s => s.sceneNumber))}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '11px', cursor: 'pointer', padding: 0 }}>Select all</button>
                <button type="button" onClick={onClear}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', padding: 0 }}>Clear</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {scenes.map((s, i) => {
                  const on = pickedSet.has(s.sceneNumber);
                  return (
                    <button key={i} type="button" title={s.heading || ''} onClick={() => onToggleScene(s.sceneNumber)}
                      style={{
                        padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                        border: '1px solid', transition: 'all .12s',
                        background: on ? 'var(--accent)' : 'var(--bg-card)',
                        color: on ? 'white' : 'var(--text-secondary)',
                        borderColor: on ? 'var(--accent)' : 'var(--border)',
                      }}>
                      {s.sceneNumber}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Lists the scene folders (Pages) of one script (active or historical) as a
 * labelled group, each Page expandable into its detected scenes. Fetched per script.
 */
function ScriptFoldersGroup({ script, isActive, folderScenePicks, wholeFolders, onToggleScene, onSetScenes, onToggleWhole }) {
  const { data } = useQuery({
    queryKey: ['scene-pages', script._id],
    queryFn: () => scenePagesApi.list(script._id).then(r => r.data),
  });
  const folders = data?.scenePages || [];
  if (folders.length === 0) return null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-primary)' }}>{script.title}</span>
        <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 6px', borderRadius: '4px',
          color: isActive ? 'var(--accent)' : 'var(--text-muted)',
          background: isActive ? 'var(--accent-glow)' : 'var(--bg-card)' }}>
          {isActive ? 'ACTIVE' : 'HISTORY'}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '8px' }}>
        {folders.map(f => (
          <FolderScenePicker
            key={f._id}
            folder={f}
            picked={folderScenePicks[f._id] || []}
            whole={wholeFolders.has(f._id)}
            onToggleScene={(sn) => onToggleScene(f._id, sn)}
            onSelectAll={(all) => onSetScenes(f._id, all)}
            onClear={() => onSetScenes(f._id, [])}
            onToggleWhole={() => onToggleWhole(f._id)}
          />
        ))}
      </div>
    </div>
  );
}

function GenerateSidesModal({ onClose, onSuccess, preSelectedCallSheet }) {
  const [selectedCallSheet, setSelectedCallSheet] = useState(preSelectedCallSheet || '');
  const [selectedSchedule, setSelectedSchedule] = useState('');
  const [callSheetPages, setCallSheetPages] = useState('all');
  const [includeSchedule, setIncludeSchedule] = useState(false);
  // Attach the call sheet PDF page(s) to the generated sides (view + download).
  const [includeCallSheetPdf, setIncludeCallSheetPdf] = useState(true);
  // Seed the scene list from the call sheet's scenes. When false → custom scenes only.
  const [useCallSheetScenes, setUseCallSheetScenes] = useState(true);
  const [manualScenes, setManualScenes] = useState('');
  const [pickedScenes, setPickedScenes] = useState(new Set());
  const [title, setTitle] = useState('');
  const [generating, setGenerating] = useState(false);
  // Multi-version mode: pick specific scenes from specific script versions.
  const [multiMode, setMultiMode] = useState(false);
  // Map of versionId -> array of picked scene numbers.
  const [versionPicks, setVersionPicks] = useState({});
  // Pages (scene folders): per-page scene selection (like scripts).
  // folderScenePicks: { [pageId]: [sceneNumbers] }; wholeFolders: pages included as full PDF.
  const [folderScenePicks, setFolderScenePicks] = useState({});
  const [wholeFolders, setWholeFolders] = useState(new Set());

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

  // Archived (historical) scripts — so users can pull scenes/pages from older
  // scripts too, not just the active one.
  const { data: historyData } = useQuery({
    queryKey: ['scripts-history'],
    queryFn: () => scriptsApi.getHistory({ limit: 100 }).then(r => r.data),
    enabled: !!activeScript,
  });
  const historyScripts = historyData?.scripts || [];

  // Scripts offered in the pickers: active first, then history.
  const scriptsToShow = useMemo(() => {
    const list = [];
    if (activeScript) list.push({ script: activeScript, isActive: true });
    for (const s of historyScripts) list.push({ script: s, isActive: false });
    return list;
  }, [activeScript, historyScripts]);

  // Per-page scene selection handlers.
  const toggleFolderScene = (pageId, sceneNumber) => {
    setFolderScenePicks(prev => {
      const cur = new Set(prev[pageId] || []);
      if (cur.has(sceneNumber)) cur.delete(sceneNumber); else cur.add(sceneNumber);
      return { ...prev, [pageId]: [...cur] };
    });
  };
  const setFolderScenes = (pageId, sceneNumbers) =>
    setFolderScenePicks(prev => ({ ...prev, [pageId]: [...sceneNumbers] }));
  const toggleWholeFolder = (pageId) => setWholeFolders(prev => {
    const n = new Set(prev); if (n.has(pageId)) n.delete(pageId); else n.add(pageId); return n;
  });

  // Build the pageSelections payload + a count for the submit gate.
  const pageSelections = useMemo(() => {
    const out = [];
    for (const [pageId, arr] of Object.entries(folderScenePicks)) {
      if (arr && arr.length) out.push({ pageId, sceneNumbers: arr });
    }
    for (const pageId of wholeFolders) {
      if (!(folderScenePicks[pageId] && folderScenePicks[pageId].length)) out.push({ pageId, sceneNumbers: [] });
    }
    return out;
  }, [folderScenePicks, wholeFolders]);
  const pageSelCount = pageSelections.length;

  // Toggle one scene for one version.
  const toggleVersionScene = (versionId, sceneNumber) => {
    setVersionPicks(prev => {
      const cur = new Set(prev[versionId] || []);
      if (cur.has(sceneNumber)) cur.delete(sceneNumber); else cur.add(sceneNumber);
      return { ...prev, [versionId]: [...cur] };
    });
  };
  const setVersionScenes = (versionId, sceneNumbers) =>
    setVersionPicks(prev => ({ ...prev, [versionId]: [...sceneNumbers] }));

  // Payload + count for multi-version mode.
  const versionScenesPayload = useMemo(() =>
    Object.entries(versionPicks)
      .filter(([, arr]) => arr && arr.length)
      .map(([versionId, sceneNumbers]) => ({ versionId, sceneNumbers })),
    [versionPicks]);
  const multiSceneCount = versionScenesPayload.reduce((n, g) => n + g.sceneNumbers.length, 0);

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
    // Only seed from the call sheet when the user opted to use its scenes.
    if (useCallSheetScenes && selectedCallSheet && callSheetScenes.length) callSheetScenes.forEach(s => set.add(s.sceneNumber));
    return [...set];
  }, [pickedScenes, manualScenes, selectedCallSheet, callSheetScenes, useCallSheetScenes]);

  // Find the best matching shoot day + pick extra scenes from other days.
  // Match against call sheet scenes normally, or the custom scene list when
  // the user has turned off "use scenes from call sheet".
  const { matchedShootDays, extraSceneInfo } = useMemo(() => {
    const matchSource = useCallSheetScenes
      ? callSheetScenes.map(s => s.sceneNumber)
      : finalSceneNumbers;
    if (!shootDays.length || !matchSource.length) return { matchedShootDays: [], extraSceneInfo: [] };
    const csSceneSet = new Set(matchSource.map(s => String(s).toUpperCase()));

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
  }, [shootDays, callSheetScenes, useCallSheetScenes, finalSceneNumbers]);

  const readyToSubmit = (multiMode ? multiSceneCount > 0 : finalSceneNumbers.length > 0) || pageSelCount > 0;

  const handleGenerate = async () => {
    if (!activeScript) return toast.error('No active script found');
    if (!readyToSubmit) return toast.error('Select at least one scene or page');

    setGenerating(true);
    try {
      const payload = {
        scriptId: activeScript._id,
        callSheetId: selectedCallSheet || undefined,
        title: title || undefined,
        mode: 'manual',
        includeCallSheet: selectedCallSheet && includeCallSheetPdf ? true : false,
        scheduleId: includeSchedule && selectedSchedule ? selectedSchedule : undefined,
        primaryDay: includeSchedule && matchedShootDays.length ? matchedShootDays[0].dayNumber : undefined,
        matchedDays: includeSchedule && matchedShootDays.length
          ? [...new Set([...matchedShootDays.map(d => d.dayNumber), ...extraSceneInfo.map(e => e.dayNumber)])]
          : undefined,
        pageSelections: pageSelCount ? pageSelections : undefined,
      };

      if (multiMode) {
        // Scenes come from the per-version picker.
        payload.versionScenes = versionScenesPayload;
      } else {
        payload.sceneNumbers = finalSceneNumbers.join(', ');
        payload.includeCallSheetScenes = useCallSheetScenes;
        payload.callSheetPages = callSheetPages;
      }

      const { data } = await sidesApi.generate(payload);
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

        {/* Call sheet options — only when a call sheet is selected */}
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
          <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '8px', marginBottom: '8px', border: '1px solid var(--border)', opacity: useCallSheetScenes ? 1 : 0.5 }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: '600' }}>Call sheet scenes:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
              {callSheetScenes.map((s, i) => <span key={i} style={{ background: 'var(--accent-glow)', color: 'var(--accent)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', border: '1px solid var(--border)' }}>{s.sceneNumber}</span>)}
            </div>
          </div>
        )}

        {selectedCallSheet && callSheetDetail?.callSheet && (
          <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {!multiMode && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={useCallSheetScenes} onChange={e => setUseCallSheetScenes(e.target.checked)} style={{ width: '15px', height: '15px', accentColor: 'var(--accent)' }} />
                Use scenes from call sheet
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{useCallSheetScenes ? '' : '(custom scenes only)'}</span>
              </label>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={includeCallSheetPdf} onChange={e => setIncludeCallSheetPdf(e.target.checked)} style={{ width: '15px', height: '15px', accentColor: 'var(--accent)' }} />
              Attach call sheet to sides PDF
            </label>
          </div>
        )}

        {/* Multi-version mode toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: multiMode ? '8px' : '12px', padding: '4px 0' }}>
          <input type="checkbox" checked={multiMode} onChange={e => setMultiMode(e.target.checked)} style={{ width: '15px', height: '15px', accentColor: 'var(--accent)' }} />
          Pull scenes from multiple script versions
        </label>

        {/* Multi-version / multi-script picker — versions grouped by script (active + history) */}
        {multiMode && (
          <div style={{ marginBottom: '12px' }}>
            <label style={L}>Pick scenes per script & version</label>
            {scriptsToShow.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px' }}>Loading scripts…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {scriptsToShow.map(({ script, isActive }) => (
                  <ScriptVersionsGroup
                    key={script._id}
                    script={script}
                    isActive={isActive}
                    activeVersionId={activeVersionId}
                    versionPicks={versionPicks}
                    onToggleScene={toggleVersionScene}
                    onSetScenes={setVersionScenes}
                  />
                ))}
              </div>
            )}
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

        {/* Manual — single-version mode only */}
        {!multiMode && (
          <div style={{ marginBottom: '12px' }}>
            <label style={L}>{useCallSheetScenes ? 'Additional Scenes (manual)' : 'Custom Scenes (required)'}</label>
            <input value={manualScenes} onChange={e => setManualScenes(e.target.value)} placeholder="e.g. 1, 3, 5-8" />
          </div>
        )}

        {/* Scene folders (Pages) — across active + history scripts */}
        {scriptsToShow.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <label style={L}>Pages (scene folders)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {scriptsToShow.map(({ script, isActive }) => (
                <ScriptFoldersGroup
                  key={script._id}
                  script={script}
                  isActive={isActive}
                  folderScenePicks={folderScenePicks}
                  wholeFolders={wholeFolders}
                  onToggleScene={toggleFolderScene}
                  onSetScenes={setFolderScenes}
                  onToggleWhole={toggleWholeFolder}
                />
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        {!multiMode && finalSceneNumbers.length > 0 && (
          <div style={{ marginBottom: '12px', padding: '8px 12px', borderRadius: '8px', background: 'var(--accent-glow)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-primary)' }}>
            <strong>{finalSceneNumbers.length} scene(s):</strong> {finalSceneNumbers.join(', ')}
            {includeSchedule && matchedShootDays.length > 0 && <span style={{ marginLeft: '8px', color: 'var(--accent)' }}>+ {matchedShootDays.length} shoot day(s)</span>}
          </div>
        )}
        {multiMode && multiSceneCount > 0 && (
          <div style={{ marginBottom: '12px', padding: '8px 12px', borderRadius: '8px', background: 'var(--accent-glow)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-primary)' }}>
            <strong>{multiSceneCount} scene(s) across {versionScenesPayload.length} version(s)</strong>
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
            disabled={generating || !activeScript || !readyToSubmit}
            style={{ opacity: (generating || !activeScript || !readyToSubmit) ? 0.5 : 1 }}>
            {generating ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GenerateSidesModal;
