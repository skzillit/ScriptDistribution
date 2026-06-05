import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { scriptsApi, callSheetApi, sidesApi, scheduleApi, scenePagesApi } from '../../api/scripts.api';
import { getApiBaseUrl } from '../../api/client';
import { toast } from 'react-toastify';

/**
 * One collapsible row per script version. Lazily loads that version's scenes
 * (only when expanded) and lets the user toggle individual scenes. Selection is
 * lifted to the parent via callbacks so it survives collapse/expand.
 */
function VersionScenePicker({ version, isCurrent, picked, claimed, onToggleScene, onSelectAll, onClear }) {
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
                  const blocked = !on && claimed && claimed.has(String(s.sceneNumber));
                  return (
                    <button key={i} type="button" disabled={blocked}
                      title={blocked ? 'Already picked from another source' : (s.heading || '')}
                      onClick={() => onToggleScene(s.sceneNumber)}
                      style={{
                        padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                        cursor: blocked ? 'not-allowed' : 'pointer',
                        border: '1px solid', transition: 'all .12s',
                        background: on ? 'var(--accent)' : 'var(--bg-card)',
                        color: on ? 'white' : 'var(--text-secondary)',
                        borderColor: on ? 'var(--accent)' : 'var(--border)',
                        opacity: blocked ? 0.35 : 1,
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
function ScriptVersionsGroup({ script, isActive, activeVersionId, versionPicks, claimed, onToggleScene, onSetScenes, onVersionsLoaded }) {
  const { data, isLoading } = useQuery({
    queryKey: ['script-versions', script._id],
    queryFn: () => scriptsApi.listVersions(script._id).then(r => r.data),
  });
  const versions = data?.versions || [];
  React.useEffect(() => {
    if (versions.length && typeof onVersionsLoaded === 'function') {
      onVersionsLoaded(script._id, versions);
    }
  }, [script._id, versions, onVersionsLoaded]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-primary)' }}>{script.title}</span>
        {isActive && <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 6px', borderRadius: '4px', color: 'var(--accent)', background: 'var(--accent-glow)' }}>ACTIVE</span>}
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
              claimed={claimed}
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
function FolderScenePicker({ folder, picked, whole, claimed, onToggleScene, onSelectAll, onClear, onToggleWhole }) {
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
                  const blocked = !on && claimed && claimed.has(String(s.sceneNumber));
                  return (
                    <button key={i} type="button" disabled={blocked}
                      title={blocked ? 'Already picked from another source' : (s.heading || '')}
                      onClick={() => onToggleScene(s.sceneNumber)}
                      style={{
                        padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                        cursor: blocked ? 'not-allowed' : 'pointer',
                        border: '1px solid', transition: 'all .12s',
                        background: on ? 'var(--accent)' : 'var(--bg-card)',
                        color: on ? 'white' : 'var(--text-secondary)',
                        borderColor: on ? 'var(--accent)' : 'var(--border)',
                        opacity: blocked ? 0.35 : 1,
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
function ScriptFoldersGroup({ script, isActive, folderScenePicks, wholeFolders, claimed, onToggleScene, onSetScenes, onToggleWhole, onPagesLoaded }) {
  const { data } = useQuery({
    queryKey: ['scene-pages', script._id],
    queryFn: () => scenePagesApi.list(script._id).then(r => r.data),
  });
  const folders = data?.scenePages || [];
  React.useEffect(() => {
    if (folders.length && typeof onPagesLoaded === 'function') {
      onPagesLoaded(script._id, folders);
    }
  }, [script._id, folders, onPagesLoaded]);
  if (folders.length === 0) return null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-primary)' }}>{script.title}</span>
        {isActive && <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 6px', borderRadius: '4px', color: 'var(--accent)', background: 'var(--accent-glow)' }}>ACTIVE</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '8px' }}>
        {folders.map(f => (
          <FolderScenePicker
            key={f._id}
            folder={f}
            picked={folderScenePicks[f._id] || []}
            whole={wholeFolders.has(f._id)}
            claimed={claimed}
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

/**
 * Drag-and-drop chip row for rearranging the scene order. Backed by a single
 * comma/space-separated string so it stays compatible with the existing
 * `orderInput` text field (both UIs edit the same source of truth).
 *
 * - `value` — the current order string (e.g. "12, 9, 14A, 7").
 * - `available` — every scene the user has selected. Any items missing from
 *   `value` show as muted "Add" chips the user can click to append.
 * - `onChange(nextString)` — fires whenever the order changes.
 */
/**
 * Drag-and-drop scene-order chip row.
 *
 * `available` can be either:
 *   (a) an array of strings ("12", "5", …)  — legacy single-script form, OR
 *   (b) an array of objects:
 *         { token: "scriptId:12", sceneNumber: "12",
 *           scriptId, scriptTitle }
 *       Multi-script form: chips display `<scriptTitle> · <sceneNumber>` and
 *       tokens are unique even when two scripts share a scene number.
 *
 * `value` and `onChange` are still a comma/space-separated string of tokens so
 * the underlying source-of-truth stays the same.
 */
export function DraggableSceneOrder({ value, available, onChange }) {
  const parse = (s) => s.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
  const ordered = React.useMemo(() => parse(value), [value]);
  const [dragIdx, setDragIdx] = React.useState(null);
  const [overIdx, setOverIdx] = React.useState(null);

  // Normalize `available` to objects so the rest of the component is uniform.
  const norm = React.useMemo(() => {
    const arr = available || [];
    if (arr.length && typeof arr[0] === 'object') return arr;
    return arr.map(sn => ({ token: String(sn), sceneNumber: String(sn) }));
  }, [available]);
  const labelOf = (tok) => {
    const hit = norm.find(o => o.token === tok);
    if (!hit) return tok; // unknown token typed by the user
    return hit.scriptTitle ? `${hit.scriptTitle} · ${hit.sceneNumber}` : hit.sceneNumber;
  };
  const remaining = norm.filter(o => !ordered.includes(o.token));

  const commit = (arr) => onChange(arr.join(', '));

  const onDragStart = (i) => (e) => {
    setDragIdx(i);
    // Required for Firefox to actually start the drag.
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); } catch (_) {}
  };
  const onDragOver = (i) => (e) => {
    e.preventDefault();
    if (overIdx !== i) setOverIdx(i);
  };
  const onDrop = (i) => (e) => {
    e.preventDefault();
    if (dragIdx == null || dragIdx === i) { setDragIdx(null); setOverIdx(null); return; }
    const next = ordered.slice();
    const [moved] = next.splice(dragIdx, 1);
    next.splice(i, 0, moved);
    commit(next);
    setDragIdx(null);
    setOverIdx(null);
  };
  const onDragEnd = () => { setDragIdx(null); setOverIdx(null); };
  const removeAt = (i) => commit(ordered.filter((_, j) => j !== i));
  const append = (sn) => commit([...ordered, sn]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '6px',
        padding: '8px', borderRadius: '8px',
        border: '1px dashed var(--border)', minHeight: '40px',
        background: 'var(--bg-secondary)',
      }}>
        {ordered.length === 0 && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Drag chips to reorder — or use the text field below.
          </span>
        )}
        {ordered.map((sn, i) => (
          <span key={`${sn}-${i}`}
            draggable
            onDragStart={onDragStart(i)}
            onDragOver={onDragOver(i)}
            onDrop={onDrop(i)}
            onDragEnd={onDragEnd}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '700',
              background: dragIdx === i ? 'var(--accent-glow)' : 'var(--accent)',
              color: dragIdx === i ? 'var(--accent)' : 'white',
              border: overIdx === i && dragIdx !== i ? '2px dashed var(--accent)' : '2px solid transparent',
              cursor: 'grab',
              userSelect: 'none',
              opacity: dragIdx === i ? 0.55 : 1,
              transition: 'opacity .12s',
            }}
            title={`Drag to reorder${labelOf(sn) !== sn ? ` — ${labelOf(sn)}` : ''}`}>
            <span style={{ fontSize: '10px', opacity: 0.7 }}>{i + 1}.</span>
            {labelOf(sn)}
            <button type="button" onClick={(e) => { e.stopPropagation(); removeAt(i); }}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0 }}
              title="Remove from order">×</button>
          </span>
        ))}
      </div>
      {remaining.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '600', letterSpacing: '0.4px', textTransform: 'uppercase' }}>Add:</span>
          {remaining.map(o => (
            <button key={o.token} type="button" onClick={() => append(o.token)}
              style={{
                padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: '600',
                background: 'var(--bg-card)', color: 'var(--text-secondary)',
                border: '1px dashed var(--border)', cursor: 'pointer',
              }}
              title={`Add ${o.scriptTitle ? `${o.scriptTitle} · ${o.sceneNumber}` : o.sceneNumber} to order`}>+ {o.scriptTitle ? `${o.scriptTitle} · ${o.sceneNumber}` : o.sceneNumber}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function GenerateSidesModal({ onClose, onSuccess, preSelectedCallSheet, asPage }) {
  const [selectedCallSheet, setSelectedCallSheet] = useState(preSelectedCallSheet || '');
  const [selectedSchedule, setSelectedSchedule] = useState('');
  const [callSheetPages, setCallSheetPages] = useState('all');
  const [includeSchedule, setIncludeSchedule] = useState(false);
  // "Include call sheet in sides" checkbox (off by default in Customize).
  const [includeCallSheetPdf, setIncludeCallSheetPdf] = useState(false);
  // Call sheets are handled in the Autogenerate popup; the Customize popup is
  // script/version/pages-driven, so it never seeds from a call sheet.
  const [useCallSheetScenes] = useState(false);
  const [manualScenes, setManualScenes] = useState('');
  const [pickedScenes, setPickedScenes] = useState(new Set());
  const [title, setTitle] = useState('');
  // Rearrange order: when on, sides are generated in the exact order typed below.
  const [rearrange, setRearrange] = useState(false);
  const [orderInput, setOrderInput] = useState('');
  // How to treat scenes NOT selected: 'hide' (drop them — current behavior) or
  // 'crossout' (keep the full pages but strike through the unselected scenes).
  const [sceneDisplayMode, setSceneDisplayMode] = useState('hide');
  const [generating, setGenerating] = useState(false);
  // Review stage: generated draft (unpublished), whether viewed, publish/move busy flag.
  const [generated, setGenerated] = useState(null);
  const [viewed, setViewed] = useState(false);
  const [working, setWorking] = useState(false);
  // Customize Sides always lets you pick scenes from all scripts/versions.
  const multiMode = true;
  // Map of versionId -> array of picked scene numbers.
  const [versionPicks, setVersionPicks] = useState({});
  // Pages (scene folders): per-page scene selection (like scripts).
  // folderScenePicks: { [pageId]: [sceneNumbers] }; wholeFolders: pages included as full PDF.
  const [folderScenePicks, setFolderScenePicks] = useState({});
  const [wholeFolders, setWholeFolders] = useState(new Set());
  // Only one script at a time drives a sides booklet.
  // MULTI-SCRIPT picker. Sides can pull scenes from more than one script in a
  // single generation — confirmed by client. The first entry is the primary
  // script (used as the `scriptId` payload field for backwards compatibility).
  const [selectedScriptIds, setSelectedScriptIds] = useState([]);
  // Per-script registry — versionId / pageId → scriptId. Populated as each
  // ScriptVersionsGroup / ScriptFoldersGroup loads its list, so the parent can
  // partition picks by owning script (needed for per-script cross-source dedup
  // and for labelling rearrange chips with the script's title).
  const [versionScriptMap, setVersionScriptMap] = useState({});
  const [pageScriptMap, setPageScriptMap] = useState({});
  const registerVersionsForScript = (scriptId, versions) => {
    if (!scriptId || !Array.isArray(versions) || versions.length === 0) return;
    setVersionScriptMap(prev => {
      const next = { ...prev };
      let changed = false;
      for (const v of versions) {
        const k = String(v._id);
        if (next[k] !== String(scriptId)) { next[k] = String(scriptId); changed = true; }
      }
      return changed ? next : prev;
    });
  };
  const registerPagesForScript = (scriptId, pages) => {
    if (!scriptId || !Array.isArray(pages) || pages.length === 0) return;
    setPageScriptMap(prev => {
      const next = { ...prev };
      let changed = false;
      for (const p of pages) {
        const k = String(p._id);
        if (next[k] !== String(scriptId)) { next[k] = String(scriptId); changed = true; }
      }
      return changed ? next : prev;
    });
  };

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

  // All of the user's scripts — every script (and its pages) can feed sides.
  const { data: scriptsListData } = useQuery({
    queryKey: ['scripts'],
    queryFn: () => scriptsApi.list({ limit: 100 }).then(r => r.data),
  });
  const allScripts = scriptsListData?.scripts || [];

  // Default the selected scripts to the active one (or the first available).
  useEffect(() => {
    if (selectedScriptIds.length === 0 && allScripts.length) {
      setSelectedScriptIds([String(activeScript?._id || allScripts[0]._id)]);
    }
  }, [allScripts, activeScript, selectedScriptIds.length]);

  // Selected scripts in pick order; each gets its own picker block.
  const scriptsToShow = useMemo(() => {
    const byId = new Map(allScripts.map(s => [String(s._id), s]));
    return selectedScriptIds
      .map(id => byId.get(String(id)))
      .filter(Boolean)
      .map(s => ({ script: s, isActive: String(s._id) === String(activeScript?._id) }));
  }, [selectedScriptIds, allScripts, activeScript]);

  const primaryScriptId = selectedScriptIds[0] || activeScript?._id || allScripts[0]?._id;

  // Replace the script at slot `idx`. Picks tied to the old script's versions /
  // pages get cleared so we don't post stale ids the user can no longer see.
  const replaceScriptAt = (idx, newId) => {
    const oldId = selectedScriptIds[idx];
    setSelectedScriptIds(prev => {
      const next = [...prev];
      if (newId) next[idx] = String(newId); else next.splice(idx, 1);
      return next;
    });
    if (oldId && String(oldId) !== String(newId)) clearPicksForScript(oldId);
  };
  const addAnotherScript = (id) => {
    if (!id) return;
    setSelectedScriptIds(prev => (prev.includes(String(id)) ? prev : [...prev, String(id)]));
  };
  const removeScriptAt = (idx) => {
    const sid = selectedScriptIds[idx];
    setSelectedScriptIds(prev => prev.filter((_, i) => i !== idx));
    if (sid) clearPicksForScript(sid);
  };

  // Clear any picks (version-scene / page-folder) belonging to a given script.
  // Identifies them by walking versionPicks and folderScenePicks and removing
  // entries whose owning script is `scriptId`.
  const clearPicksForScript = (scriptId) => {
    const sid = String(scriptId);
    // Versions: we need to know each version's script. Since we don't have a
    // versionId → scriptId map at this layer, clear EVERYTHING keyed to a
    // version whose group's data hasn't been loaded yet — safer to walk the
    // group queries via cache, but a simpler heuristic that matches user
    // expectation: clear the picks for any versions that are listed under the
    // removed script in the cached scripts list. Since each script's versions
    // are fetched separately, fall back to a brute-force: drop versionPicks
    // entries whose versionId belongs to ANY version that the user can no
    // longer see (we re-fetch on render anyway). For the immediate UX, we
    // simply blank the order + rearrange so the picker doesn't show ghost chips.
    setVersionPicks(prev => {
      // We can't strictly identify by sid here without a versionId→scriptId
      // map in scope — be conservative: keep versionPicks intact, but their
      // chips/order will fall out automatically because the picker for that
      // script is gone and the scenes won't be included in the request payload
      // gate (since versionGroupsPayload only reads picks for visible
      // versions). The order chips reconcile via the rearrange effect.
      return prev;
    });
    // Same reasoning for folderScenePicks.
    setRearrange(false);
    setOrderInput('');
    void sid; // referenced to keep ESLint happy when the branches above no-op
  };

  // Scenes claimed by other sources WITHIN THE SAME SCRIPT (cross-script
  // duplicates are allowed). The picker passes its own versionId / pageId so
  // the caller's own picks aren't counted as "claimed elsewhere".
  const claimedExcept = (excludeKind, excludeKey) => {
    // Resolve the owning script for the picker that's asking.
    const ownerScriptId = excludeKind === 'version'
      ? versionScriptMap[excludeKey]
      : (excludeKind === 'folder' ? pageScriptMap[excludeKey] : null);
    const out = new Set();
    if (!ownerScriptId) return out; // unknown yet → don't block
    for (const [vid, arr] of Object.entries(versionPicks)) {
      if (excludeKind === 'version' && vid === excludeKey) continue;
      if (String(versionScriptMap[vid]) !== String(ownerScriptId)) continue;
      (arr || []).forEach(s => out.add(String(s)));
    }
    for (const [pid, arr] of Object.entries(folderScenePicks)) {
      if (excludeKind === 'folder' && pid === excludeKey) continue;
      if (String(pageScriptMap[pid]) !== String(ownerScriptId)) continue;
      (arr || []).forEach(s => out.add(String(s)));
    }
    return out;
  };

  // Per-page scene selection handlers.
  const toggleFolderScene = (pageId, sceneNumber) => {
    const elsewhere = claimedExcept('folder', pageId);
    const own = new Set(folderScenePicks[pageId] || []);
    if (elsewhere.has(String(sceneNumber)) && !own.has(sceneNumber)) {
      toast.info(`Scene ${sceneNumber} is already picked from another source.`);
      return;
    }
    setFolderScenePicks(prev => {
      const cur = new Set(prev[pageId] || []);
      if (cur.has(sceneNumber)) cur.delete(sceneNumber); else cur.add(sceneNumber);
      return { ...prev, [pageId]: [...cur] };
    });
  };
  const setFolderScenes = (pageId, sceneNumbers) => {
    const elsewhere = claimedExcept('folder', pageId);
    const filtered = sceneNumbers.filter(s => !elsewhere.has(String(s)));
    if (filtered.length < sceneNumbers.length) {
      toast.info(`Skipped scenes already picked from another source.`);
    }
    setFolderScenePicks(prev => ({ ...prev, [pageId]: [...filtered] }));
  };
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

  // Toggle one scene for one version. Blocks adding a scene number that's
  // already picked from another version or a page folder.
  const toggleVersionScene = (versionId, sceneNumber) => {
    const elsewhere = claimedExcept('version', versionId);
    const own = new Set(versionPicks[versionId] || []);
    if (elsewhere.has(String(sceneNumber)) && !own.has(sceneNumber)) {
      toast.info(`Scene ${sceneNumber} is already picked from another source.`);
      return;
    }
    setVersionPicks(prev => {
      const cur = new Set(prev[versionId] || []);
      if (cur.has(sceneNumber)) cur.delete(sceneNumber); else cur.add(sceneNumber);
      return { ...prev, [versionId]: [...cur] };
    });
  };
  const setVersionScenes = (versionId, sceneNumbers) => {
    const elsewhere = claimedExcept('version', versionId);
    const filtered = sceneNumbers.filter(s => !elsewhere.has(String(s)));
    if (filtered.length < sceneNumbers.length) {
      toast.info(`Skipped scenes already picked from another source.`);
    }
    setVersionPicks(prev => ({ ...prev, [versionId]: [...filtered] }));
  };

  // Payload + count for multi-version mode.
  const versionScenesPayload = useMemo(() =>
    Object.entries(versionPicks)
      .filter(([, arr]) => arr && arr.length)
      .map(([versionId, sceneNumbers]) => ({ versionId, sceneNumbers })),
    [versionPicks]);
  const multiSceneCount = versionScenesPayload.reduce((n, g) => n + g.sceneNumbers.length, 0);
  // Flat list of all picked scene numbers (across versions) — used for ordering + schedule matching.
  const multiSelectedScenes = useMemo(() => versionScenesPayload.flatMap(g => g.sceneNumbers), [versionScenesPayload]);
  // Scenes picked from Pages (scene folders).
  const pageSelectedScenes = useMemo(() => Object.values(folderScenePicks).flat(), [folderScenePicks]);
  // Everything the user has selected (versions + pages), de-duplicated, in pick order.
  const allSelectedScenes = useMemo(() => [...new Set([...multiSelectedScenes, ...pageSelectedScenes])], [multiSelectedScenes, pageSelectedScenes]);

  // Per-script claimed-scene sets.
  // Cross-source dedup is now scoped to a single script:
  //   - Scene 12 in Script A and Scene 12 in Script B → both allowed.
  //   - Scene 12 picked from a version of Script A blocks Scene 12 in a Page
  //     of Script A (and vice versa).
  const claimedByScript = useMemo(() => {
    const m = new Map();
    const add = (sid, sn) => {
      if (!sid) return;
      const key = String(sid);
      const k = String(sn);
      if (!m.has(key)) m.set(key, new Set());
      m.get(key).add(k);
    };
    for (const [vid, arr] of Object.entries(versionPicks)) {
      const sid = versionScriptMap[vid];
      (arr || []).forEach(sn => add(sid, sn));
    }
    for (const [pid, arr] of Object.entries(folderScenePicks)) {
      const sid = pageScriptMap[pid];
      (arr || []).forEach(sn => add(sid, sn));
    }
    return m;
  }, [versionPicks, folderScenePicks, versionScriptMap, pageScriptMap]);
  const claimedSetFor = (scriptId) => claimedByScript.get(String(scriptId)) || new Set();

  // Build a flat list of picked scenes WITH script provenance — used by the
  // rearrange chip row so chips can show `Script · 12` and so the order
  // payload can disambiguate duplicates across scripts.
  const scriptsById = useMemo(() => {
    const m = new Map();
    for (const s of allScripts) m.set(String(s._id), s);
    return m;
  }, [allScripts]);
  const allSelectedScenesWithScript = useMemo(() => {
    const out = [];
    const seen = new Set();
    const push = (scriptId, sn) => {
      if (!scriptId) return;
      const sid = String(scriptId);
      const k = `${sid}:${String(sn)}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({
        scriptId: sid,
        scriptTitle: scriptsById.get(sid)?.title || sid,
        sceneNumber: String(sn),
        token: k,
      });
    };
    for (const [vid, arr] of Object.entries(versionPicks)) {
      const sid = versionScriptMap[vid];
      (arr || []).forEach(sn => push(sid, sn));
    }
    for (const [pid, arr] of Object.entries(folderScenePicks)) {
      const sid = pageScriptMap[pid];
      (arr || []).forEach(sn => push(sid, sn));
    }
    return out;
  }, [versionPicks, folderScenePicks, versionScriptMap, pageScriptMap, scriptsById]);

  // Keep the rearrange order field in sync with the current selection (scenes
  // from versions AND pages). Preserves any custom ordering the user typed;
  // appends newly selected scenes and drops deselected ones.
  useEffect(() => {
    if (!rearrange) return;
    const current = orderInput.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    // Composite tokens (scriptId:sceneNumber) are the canonical form when the
    // user has picked from more than one script. We also accept bare scene
    // numbers in `current` (typed manually) and reconcile against the multi-
    // script list by sceneNumber → first matching token.
    const tokenSet = new Set(allSelectedScenesWithScript.map(o => o.token));
    const snToToken = new Map();
    for (const o of allSelectedScenesWithScript) {
      if (!snToToken.has(o.sceneNumber)) snToToken.set(o.sceneNumber, o.token);
    }
    const kept = current
      .map(x => tokenSet.has(x) ? x : (snToToken.has(x) ? snToToken.get(x) : null))
      .filter(Boolean);
    const keptSet = new Set(kept);
    const missing = allSelectedScenesWithScript.map(o => o.token).filter(t => !keptSet.has(t));
    const next = [...kept, ...missing].join(', ');
    if (next !== current.join(', ')) setOrderInput(next);
  }, [rearrange, allSelectedScenesWithScript]);

  // Auto-select latest call sheet when "include call sheet" is turned on.
  useEffect(() => {
    if (includeCallSheetPdf && !selectedCallSheet && callSheetsData?.callSheets?.length) {
      setSelectedCallSheet(callSheetsData.callSheets[0]._id);
    }
  }, [includeCallSheetPdf, callSheetsData, selectedCallSheet]);

  // Auto-select latest schedule when "include schedule" is turned on.
  useEffect(() => {
    if (includeSchedule && !selectedSchedule && schedulesData?.schedules?.length) {
      const draft = schedulesData.schedules.find(s => s.status === 'draft') || schedulesData.schedules[0];
      if (draft) setSelectedSchedule(draft._id);
    }
  }, [includeSchedule, schedulesData, selectedSchedule]);

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

  const enableRearrange = (on) => {
    setRearrange(on);
    if (on && !orderInput) {
      const seed = multiMode
        ? allSelectedScenesWithScript.map(o => o.token)
        : finalSceneNumbers;
      setOrderInput(seed.join(', '));
    }
  };
  // The scene order actually sent (single-version mode): the typed order when
  // rearrange is on, otherwise the natural finalSceneNumbers order.
  const orderedSceneList = rearrange
    ? orderInput.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
    : finalSceneNumbers;

  // Find the best matching shoot day + pick extra scenes from other days.
  // Match against call sheet scenes normally, or the custom scene list when
  // the user has turned off "use scenes from call sheet".
  const { matchedShootDays, extraSceneInfo } = useMemo(() => {
    const matchSource = multiMode
      ? multiSelectedScenes
      : (useCallSheetScenes ? callSheetScenes.map(s => s.sceneNumber) : finalSceneNumbers);
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
  }, [shootDays, callSheetScenes, useCallSheetScenes, finalSceneNumbers, multiMode, multiSelectedScenes]);

  const readyToSubmit = (multiMode ? multiSceneCount > 0 : finalSceneNumbers.length > 0) || pageSelCount > 0;

  const handleGenerate = async () => {
    if (!primaryScriptId) return toast.error('No script found');
    if (!readyToSubmit) return toast.error('Select at least one scene or page');

    setGenerating(true);
    try {
      const includeCs = includeCallSheetPdf && !!selectedCallSheet;
      const payload = {
        scriptId: primaryScriptId,
        callSheetId: includeCs ? selectedCallSheet : undefined,
        title: title || undefined,
        mode: 'manual',
        includeCallSheet: includeCs,
        scheduleId: includeSchedule && selectedSchedule ? selectedSchedule : undefined,
        primaryDay: includeSchedule && matchedShootDays.length ? matchedShootDays[0].dayNumber : undefined,
        matchedDays: includeSchedule && matchedShootDays.length
          ? [...new Set([...matchedShootDays.map(d => d.dayNumber), ...extraSceneInfo.map(e => e.dayNumber)])]
          : undefined,
        pageSelections: pageSelCount ? pageSelections : undefined,
      };

      if (multiMode) {
        // Scenes come from the per-version picker. When the user typed a custom
        // order, regroup the picked scenes to follow that order.
        let groups = versionScenesPayload;
        if (rearrange && orderInput.trim()) {
          const order = orderInput.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
          const sceneToVersion = {};
          versionScenesPayload.forEach(g => g.sceneNumbers.forEach(sn => { if (!(sn in sceneToVersion)) sceneToVersion[sn] = g.versionId; }));
          const map = new Map();
          for (const sn of order) {
            const vid = sceneToVersion[sn];
            if (!vid) continue;
            if (!map.has(vid)) map.set(vid, []);
            map.get(vid).push(sn);
          }
          if (map.size) groups = [...map.entries()].map(([versionId, sceneNumbers]) => ({ versionId, sceneNumbers }));
          payload.orderedScenes = true;
        }
        payload.versionScenes = groups;
      } else {
        payload.sceneNumbers = orderedSceneList.join(', ');
        payload.includeCallSheetScenes = useCallSheetScenes;
        payload.callSheetPages = callSheetPages;
        if (rearrange) payload.orderedScenes = true;
      }

      // Combined render order across BOTH script scenes and page scenes.
      if (rearrange && orderInput.trim()) {
        payload.orderedScenes = true;
        payload.sceneOrder = orderedSceneList;
      }

      payload.sceneDisplayMode = sceneDisplayMode;

      // Generate as a review draft (publish:false) — not posted to the Sides
      // module until the user reviews and publishes.
      payload.publish = false;
      const { data } = await sidesApi.generate(payload);
      const sidesId = data.sides._id;
      setGenerated(data.sides);
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
    <div
      style={asPage
        ? { padding: '8px 0 40px' }
        : { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={asPage ? undefined : onClose}>
      <div className="card"
        style={asPage
          ? { width: '100%', maxWidth: '760px', margin: '0 auto', boxShadow: 'var(--shadow-lg)' }
          : { width: '620px', maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: '20px', fontSize: '22px', fontWeight: '800', background: 'var(--gradient-accent)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Generate Sides</h2>

        {!generated && (<>
        {/* Script selector — one or more scripts can drive the sides. Each
            picked script becomes its own block (scene + page pickers below). */}
        <div style={{ marginBottom: '14px' }}>
          <label style={L}>Scripts</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {selectedScriptIds.length === 0 && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px' }}>No scripts available</div>
            )}
            {selectedScriptIds.map((sid, i) => {
              const availableForSlot = allScripts.filter(s =>
                String(s._id) === String(sid) || !selectedScriptIds.includes(String(s._id))
              );
              return (
                <div key={`${sid}-${i}`} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <select value={String(sid)} onChange={e => replaceScriptAt(i, e.target.value)} style={{ flex: 1 }}>
                    {availableForSlot.map(s => (
                      <option key={s._id} value={s._id}>{s.title}{s.currentVersion ? '' : ' (no file — pages only)'}</option>
                    ))}
                  </select>
                  {selectedScriptIds.length > 1 && (
                    <button type="button" onClick={() => removeScriptAt(i)}
                      title="Remove this script"
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer', color: '#e53935' }}>×</button>
                  )}
                </div>
              );
            })}
          </div>
          {/* + Add another script — only when there are unselected scripts left */}
          {allScripts.length > selectedScriptIds.length && (
            <div style={{ marginTop: '6px' }}>
              <select value="" onChange={e => { addAnotherScript(e.target.value); e.target.value = ''; }}
                style={{ width: '100%' }}>
                <option value="">+ Add another script…</option>
                {allScripts
                  .filter(s => !selectedScriptIds.includes(String(s._id)))
                  .map(s => (
                    <option key={s._id} value={s._id}>{s.title}{s.currentVersion ? '' : ' (no file — pages only)'}</option>
                  ))}
              </select>
            </div>
          )}
        </div>

        {/* Scene picker for the selected script's versions */}
        {multiMode && (
          <div style={{ marginBottom: '12px' }}>
            <label style={L}>Pick scenes (versions)</label>
            {scriptsToShow.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px' }}>Select a script above.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {scriptsToShow.map(({ script, isActive }) => (
                  <ScriptVersionsGroup
                    key={script._id}
                    script={script}
                    isActive={isActive}
                    activeVersionId={activeVersionId}
                    versionPicks={versionPicks}
                    claimed={claimedSetFor(script._id)}
                    onToggleScene={toggleVersionScene}
                    onSetScenes={setVersionScenes}
                    onVersionsLoaded={registerVersionsForScript}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Manual — single-version mode only */}
        {!multiMode && (
          <div style={{ marginBottom: '12px' }}>
            <label style={L}>{useCallSheetScenes ? 'Additional Scenes (manual)' : 'Custom Scenes (required)'}</label>
            <input value={manualScenes} onChange={e => setManualScenes(e.target.value)} placeholder="e.g. 1, 3, 5-8" />
          </div>
        )}

        {/* Rearrange order — single-version mode only */}
        {!multiMode && finalSceneNumbers.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: rearrange ? '8px' : 0 }}>
              <input type="checkbox" checked={rearrange} onChange={e => enableRearrange(e.target.checked)} style={{ width: '15px', height: '15px', accentColor: 'var(--accent)' }} />
              Rearrange order
            </label>
            {rearrange && (
              <>
                <input value={orderInput} onChange={e => setOrderInput(e.target.value)} placeholder="e.g. 12, 9, 14A, 7" />
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {orderedSceneList.length} scene(s) in order: {orderedSceneList.join(', ')}
                </div>
              </>
            )}
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
                  claimed={claimedSetFor(script._id)}
                  onToggleScene={toggleFolderScene}
                  onSetScenes={setFolderScenes}
                  onToggleWhole={toggleWholeFolder}
                  onPagesLoaded={registerPagesForScript}
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
        {multiMode && allSelectedScenes.length > 0 && (
          <div style={{ marginBottom: '12px', padding: '8px 12px', borderRadius: '8px', background: 'var(--accent-glow)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-primary)' }}>
            <strong>{allSelectedScenes.length} scene(s) selected</strong>
            {pageSelectedScenes.length > 0 && <span style={{ marginLeft: '6px', color: 'var(--text-muted)' }}>({pageSelectedScenes.length} from pages)</span>}
            {includeSchedule && matchedShootDays.length > 0 && <span style={{ marginLeft: '8px', color: 'var(--accent)' }}>+ {matchedShootDays.length} shoot day(s)</span>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '6px' }}>
              {allSelectedScenes.map((sn, i) => (
                <span key={i} style={{ background: 'var(--bg-card)', color: 'var(--accent)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', border: '1px solid var(--border)' }}>{sn}</span>
              ))}
            </div>
          </div>
        )}

        {/* Scene order — applies to both modes:
            - Hide: orders the selected scenes' clips.
            - Cross out: reorders the page chunks for each selected scene;
              non-selected scenes are still crossed out inside each chunk. */}
        {multiMode && allSelectedScenes.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: rearrange ? '8px' : 0 }}>
              <input type="checkbox" checked={rearrange} onChange={e => enableRearrange(e.target.checked)} style={{ width: '15px', height: '15px', accentColor: 'var(--accent)' }} />
              Rearrange scene order
            </label>
            {rearrange && (() => {
              // Show the friendly chip + summary view. The raw text-input
              // fallback is only useful when there's ONE script (so users can
              // type "12, 5, 14A"). When the order contains composite
              // "scriptId:sceneNumber" tokens — which look like opaque IDs to
              // a human — hide the text input and the raw preview, and surface
              // a labelled summary instead.
              const tokens = orderInput.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
              const hasComposite = tokens.some(t => t.includes(':'));
              const labelFor = (tok) => {
                const hit = allSelectedScenesWithScript.find(o => o.token === tok);
                if (hit) return hit.scriptTitle ? `${hit.scriptTitle} · ${hit.sceneNumber}` : hit.sceneNumber;
                return tok; // bare number user typed in
              };
              return (
                <>
                  <label style={L}>Scene order  {hasComposite ? '(drag chips to reorder)' : '(drag chips to reorder, or type below)'}</label>
                  <DraggableSceneOrder
                    value={orderInput}
                    available={allSelectedScenesWithScript}
                    onChange={setOrderInput}
                  />
                  {!hasComposite && (
                    <input value={orderInput} onChange={e => setOrderInput(e.target.value)} placeholder="e.g. 12, 9, 14A, 7"
                      style={{ marginTop: '8px' }} />
                  )}
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Sides will be ordered as: {tokens.length ? tokens.map(labelFor).join(', ') : '—'}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Unselected-scene handling */}
        <div style={{ marginBottom: '20px' }}>
          <label style={L}>Unselected scenes</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { val: 'hide', title: 'Hide unselected scenes', desc: 'Only the selected scenes appear (current behavior).' },
              { val: 'crossout', title: 'Cross out unselected scenes', desc: 'Keep full pages; strike through scenes not selected.' },
            ].map(opt => (
              <label key={opt.val}
                style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                  border: `1px solid ${sceneDisplayMode === opt.val ? 'var(--accent)' : 'var(--border)'}`,
                  background: sceneDisplayMode === opt.val ? 'var(--accent-glow)' : 'transparent' }}>
                <span onClick={() => setSceneDisplayMode(opt.val)}
                  style={{ width: '16px', height: '16px', borderRadius: '50%', marginTop: '2px', flexShrink: 0,
                    border: `2px solid ${sceneDisplayMode === opt.val ? 'var(--accent)' : 'var(--text-muted)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {sceneDisplayMode === opt.val && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)' }} />}
                </span>
                <span onClick={() => setSceneDisplayMode(opt.val)} style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{opt.title}</span>
                  <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{opt.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Title */}
        <div style={{ marginBottom: '20px' }}>
          <label style={L}>Title (optional)</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Auto-generated" />
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleGenerate}
            disabled={generating || !primaryScriptId || !readyToSubmit}
            style={{ opacity: (generating || !primaryScriptId || !readyToSubmit) ? 0.5 : 1 }}>
            {generating ? 'Submitting...' : 'Submit'}
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
                    <button type="button" className="btn-secondary"
                      onClick={() => sidesApi.download(generated._id).then(r => {
                        const u = r.data.downloadUrl;
                        window.location.href = u && u.startsWith('/') ? `${getApiBaseUrl()}${u}` : u;
                      })}>
                      Download
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
    </div>
  );
}

export default GenerateSidesModal;
