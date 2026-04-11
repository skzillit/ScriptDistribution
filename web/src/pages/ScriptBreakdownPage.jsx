import React, { useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scriptsApi, scriptBreakdownApi } from '../api/scripts.api';
import { toast } from 'react-toastify';
import ScriptTextViewer from '../components/scriptBreakdown/ScriptTextViewer';
import BreakdownSheet from '../components/scriptBreakdown/BreakdownSheet';
import CategoryPicker from '../components/scriptBreakdown/CategoryPicker';
import AISuggestionReview from '../components/scriptBreakdown/AISuggestionReview';
import ScenesListSidebar from '../components/scriptBreakdown/ScenesListSidebar';
import CastAssignPopover from '../components/scriptBreakdown/CastAssignPopover';
import LocationAssignPopover from '../components/scriptBreakdown/LocationAssignPopover';

function ScriptBreakdownPage() {
  const { id: scriptId } = useParams();
  const queryClient = useQueryClient();
  const [selectedSceneId, setSelectedSceneId] = useState(null);
  const [pickerState, setPickerState] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [locationPopover, setLocationPopover] = useState(null); // { anchorEl }
  const [castPopover, setCastPopover] = useState(null); // { anchorEl }

  const { data: scriptData } = useQuery({
    queryKey: ['script', scriptId],
    queryFn: () => scriptsApi.get(scriptId).then(r => r.data),
    enabled: !!scriptId,
  });
  const script = scriptData?.script;
  const versionId = script?.currentVersion?._id || script?.currentVersion;

  const { data: scenesData } = useQuery({
    queryKey: ['scenes-list', versionId],
    queryFn: () => scriptBreakdownApi.getScenesList(versionId).then(r => r.data),
    enabled: !!versionId,
  });

  const scenes = scenesData?.scenes || [];
  const currentSceneId = selectedSceneId || scenes[0]?._id;
  const currentSceneMeta = scenes.find(s => s._id === currentSceneId);

  const { data: sheetData } = useQuery({
    queryKey: ['breakdown-sheet', scriptId, currentSceneId],
    queryFn: () => scriptBreakdownApi.getBreakdownSheet(scriptId, currentSceneId).then(r => r.data),
    enabled: !!scriptId && !!currentSceneId,
  });

  const { data: catData } = useQuery({
    queryKey: ['breakdown-categories', scriptId],
    queryFn: () => scriptBreakdownApi.getCategories(scriptId).then(r => r.data),
    enabled: !!scriptId,
  });

  const { data: castData } = useQuery({
    queryKey: ['project-cast', scriptId],
    queryFn: () => scriptBreakdownApi.getCast(scriptId).then(r => r.data),
    enabled: !!scriptId,
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['breakdown-sheet'] });
    queryClient.invalidateQueries({ queryKey: ['scenes-list', versionId] });
    queryClient.invalidateQueries({ queryKey: ['project-cast', scriptId] });
  };

  const tagMutation = useMutation({
    mutationFn: (data) => scriptBreakdownApi.tagText(scriptId, currentSceneId, data),
    onSuccess: (res) => {
      refreshAll();
      const autoCount = res?.data?.autoTagCount || 0;
      toast.success(autoCount > 0 ? `Tagged (+${autoCount} auto-detected across script)` : 'Tagged');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Tag failed'),
  });

  const removeTagMutation = useMutation({
    mutationFn: (tagId) => scriptBreakdownApi.removeTag(scriptId, tagId),
    onSuccess: () => refreshAll(),
  });

  const updateSceneMutation = useMutation({
    mutationFn: (updates) => scriptBreakdownApi.updateScene(scriptId, currentSceneId, updates),
    onSuccess: () => {
      refreshAll();
    },
    onError: () => toast.error('Failed to update scene'),
  });

  const handleTextSelected = useCallback((sel) => {
    setPickerState({
      position: { top: sel.rect.top, left: sel.rect.left },
      lineIndex: sel.lineIndex,
      charStart: sel.charStart,
      charEnd: sel.charEnd,
      text: sel.text,
    });
  }, []);

  const handleCategorySelect = ({ category_slug, element_name }) => {
    if (!pickerState) return;
    tagMutation.mutate({
      line_index: pickerState.lineIndex,
      char_start: pickerState.charStart,
      char_end: pickerState.charEnd,
      tagged_text: pickerState.text,
      category_slug,
      element_name,
    });
    setPickerState(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleAiAnalyze = async () => {
    if (!scriptId || !currentSceneId) return;
    setAiLoading(true);
    try {
      const { data } = await scriptBreakdownApi.aiAnalyze(scriptId, currentSceneId);
      if (data.suggestions?.length) {
        setAiSuggestions(data.suggestions);
      } else {
        toast.info(data.message || 'No suggestions found');
      }
      refreshAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'AI analysis failed');
    } finally {
      setAiLoading(false);
    }
  };

  const handleBulkDecisions = async (decisions) => {
    try {
      await scriptBreakdownApi.bulkDecisions(scriptId, currentSceneId, decisions);
      refreshAll();
      setAiSuggestions(null);
      toast.success('Decisions applied');
    } catch (err) {
      toast.error('Failed to apply');
    }
  };

  const handleSynopsisChange = (text) => {
    updateSceneMutation.mutate({ synopsis: text });
  };

  const handleSaveLocation = ({ location, locationAddress }) => {
    updateSceneMutation.mutate({ location, locationAddress });
    setLocationPopover(null);
    toast.success('Location updated');
  };

  const handleRemoveLocation = () => {
    updateSceneMutation.mutate({ location: '', locationAddress: '' });
    setLocationPopover(null);
  };

  const handleToggleCast = (castId) => {
    const current = (currentSceneMeta?.cast_names || []);
    const castList = castData?.cast || [];
    // We need to store IDs, not names — fetch current assignedIds from scene's cast_ids
    // For simplicity, build list of IDs from current scene's assigned cast (via name match)
    const assignedIds = castList
      .filter(c => current.includes(c.name))
      .map(c => String(c._id));
    const idStr = String(castId);
    const newIds = assignedIds.includes(idStr)
      ? assignedIds.filter(id => id !== idStr)
      : [...assignedIds, idStr];
    updateSceneMutation.mutate({ cast_ids: newIds });
  };

  const currentIdx = scenes.findIndex(s => s._id === currentSceneId);

  if (!scriptId) {
    return <div style={{ padding: 32, color: 'var(--text-muted)', textAlign: 'center' }}>No script selected.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{
        padding: '12px 20px', background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link to={`/scripts/${scriptId}`} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14,
              transition: 'all 0.2s',
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
              &#8592;
            </Link>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.2px' }}>
                Script Breakdown
              </h2>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{script?.title || ''}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 8 }}>
              Scene {currentIdx + 1} / {scenes.length}
            </span>
            <button onClick={handleAiAnalyze} disabled={aiLoading}
              style={{
                padding: '7px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
                cursor: aiLoading ? 'default' : 'pointer',
                background: 'var(--gradient-accent)', color: '#fff',
                opacity: aiLoading ? 0.6 : 1, transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: aiLoading ? 'none' : '0 2px 8px var(--accent-glow)',
              }}>
              {aiLoading ? (
                <>
                  <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                  Analyzing...
                </>
              ) : (
                <>{'\uD83E\uDDE0'} AI Tag</>
              )}
            </button>
            <button onClick={() => setShowPanel(!showPanel)}
              title={showPanel ? 'Hide breakdown panel' : 'Show breakdown panel'}
              style={{
                width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--border)', background: showPanel ? 'var(--accent)' : 'var(--bg-card)',
                color: showPanel ? '#fff' : 'var(--text-secondary)', fontSize: 15, cursor: 'pointer', transition: 'all 0.2s',
              }}>
              {showPanel ? '\u2759' : '\u2630'}
            </button>
          </div>
        </div>
      </div>

      {/* Main: Scenes sidebar + Script viewer + Breakdown panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'var(--bg-primary)' }}>
        <ScenesListSidebar
          scenes={scenes}
          currentSceneId={currentSceneId}
          onSelectScene={setSelectedSceneId}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        <div style={{ flex: 1, overflow: 'hidden', transition: 'all 0.3s ease', background: 'var(--bg-primary)' }}>
          <ScriptTextViewer
            scriptText={sheetData?.scene?.script_text || []}
            tags={sheetData?.allTags || []}
            onTextSelected={handleTextSelected}
            onRemoveTag={(tagId) => removeTagMutation.mutate(tagId)}
            sceneNumber={sheetData?.scene?.sceneNumbers?.[0]}
          />
        </div>

        {showPanel && (
          <div style={{
            width: 340, borderLeft: '1px solid var(--border)', background: 'var(--bg-secondary)',
            overflow: 'hidden', transition: 'all 0.3s ease', flexShrink: 0,
          }}>
            <BreakdownSheet
              categories={sheetData?.categories || []}
              sceneInfo={sheetData?.scene}
              sceneMeta={currentSceneMeta}
              onRemoveTag={(tagId) => removeTagMutation.mutate(tagId)}
              onSynopsisChange={handleSynopsisChange}
              onOpenLocationPicker={(anchorEl) => setLocationPopover({ anchorEl })}
              onOpenCastPicker={(anchorEl) => setCastPopover({ anchorEl })}
            />
          </div>
        )}
      </div>

      {/* Category picker popup */}
      {pickerState && (
        <CategoryPicker
          categories={catData?.categories || []}
          position={pickerState.position}
          onSelect={handleCategorySelect}
          onClose={() => { setPickerState(null); window.getSelection()?.removeAllRanges(); }}
        />
      )}

      {/* AI suggestion review modal */}
      {aiSuggestions && (
        <AISuggestionReview
          suggestions={aiSuggestions}
          onDecide={handleBulkDecisions}
          onClose={() => setAiSuggestions(null)}
        />
      )}

      {/* Location popover */}
      {locationPopover && (
        <LocationAssignPopover
          visible={true}
          anchorEl={locationPopover.anchorEl}
          currentLocation={currentSceneMeta?.location || ''}
          currentAddress={currentSceneMeta?.locationAddress || ''}
          onSave={handleSaveLocation}
          onRemove={handleRemoveLocation}
          onClose={() => setLocationPopover(null)}
        />
      )}

      {/* Cast popover */}
      {castPopover && (
        <CastAssignPopover
          visible={true}
          anchorEl={castPopover.anchorEl}
          cast={castData?.cast || []}
          assignedIds={(castData?.cast || [])
            .filter(c => (currentSceneMeta?.cast_names || []).includes(c.name))
            .map(c => String(c._id))}
          onToggle={handleToggleCast}
          onClose={() => setCastPopover(null)}
        />
      )}
    </div>
  );
}

export default ScriptBreakdownPage;
