import React, { useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scriptsApi, scriptBreakdownApi } from '../api/scripts.api';
import { toast } from 'react-toastify';
import ScriptTextViewer from '../components/scriptBreakdown/ScriptTextViewer';
import BreakdownSheet from '../components/scriptBreakdown/BreakdownSheet';
import CategoryPicker from '../components/scriptBreakdown/CategoryPicker';
import AISuggestionReview from '../components/scriptBreakdown/AISuggestionReview';

function ScriptBreakdownPage() {
  const { id: scriptId } = useParams();
  const queryClient = useQueryClient();
  const [selectedSceneId, setSelectedSceneId] = useState(null);
  const [pickerState, setPickerState] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showPanel, setShowPanel] = useState(true);

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

  const tagMutation = useMutation({
    mutationFn: (data) => scriptBreakdownApi.tagText(scriptId, currentSceneId, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['breakdown-sheet'] });
      const autoCount = res?.data?.autoTagCount || 0;
      toast.success(autoCount > 0 ? `Tagged (+${autoCount} auto-detected across script)` : 'Tagged');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Tag failed'),
  });

  const removeTagMutation = useMutation({
    mutationFn: (tagId) => scriptBreakdownApi.removeTag(scriptId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['breakdown-sheet'] });
    },
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
      queryClient.invalidateQueries({ queryKey: ['breakdown-sheet'] });
    } catch (err) {
      toast.error(err.response?.data?.error || 'AI analysis failed');
    } finally {
      setAiLoading(false);
    }
  };

  const handleBulkDecisions = async (decisions) => {
    try {
      await scriptBreakdownApi.bulkDecisions(scriptId, currentSceneId, decisions);
      queryClient.invalidateQueries({ queryKey: ['breakdown-sheet'] });
      setAiSuggestions(null);
      toast.success('Decisions applied');
    } catch (err) {
      toast.error('Failed to apply');
    }
  };

  const currentIdx = scenes.findIndex(s => s._id === currentSceneId);
  const goPrev = () => { if (currentIdx > 0) setSelectedSceneId(scenes[currentIdx - 1]._id); };
  const goNext = () => { if (currentIdx < scenes.length - 1) setSelectedSceneId(scenes[currentIdx + 1]._id); };

  if (!scriptId) {
    return <div style={{ padding: 32, color: 'var(--text-muted)', textAlign: 'center' }}>No script selected.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{
        padding: '12px 20px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Left: Back + Title */}
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

          {/* Center: Scene navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={goPrev} disabled={currentIdx <= 0}
              style={{
                width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)',
                fontSize: 13, cursor: currentIdx > 0 ? 'pointer' : 'default', opacity: currentIdx <= 0 ? 0.35 : 1,
                transition: 'all 0.2s',
              }}>
              &#8592;
            </button>
            <select value={currentSceneId || ''} onChange={e => setSelectedSceneId(e.target.value)}
              style={{
                padding: '6px 28px 6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)',
                minWidth: 160, cursor: 'pointer', appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%239a918a' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
              }}>
              {scenes.map(s => (
                <option key={s._id} value={s._id}>
                  Page {s.pageNumber} {s.sceneNumbers?.length ? `— Sc. ${s.sceneNumbers.join(', ')}` : ''}
                </option>
              ))}
            </select>
            <button onClick={goNext} disabled={currentIdx >= scenes.length - 1}
              style={{
                width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)',
                fontSize: 13, cursor: currentIdx < scenes.length - 1 ? 'pointer' : 'default',
                opacity: currentIdx >= scenes.length - 1 ? 0.35 : 1, transition: 'all 0.2s',
              }}>
              &#8594;
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
              {currentIdx + 1} / {scenes.length}
            </span>
          </div>

          {/* Right: Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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

      {/* Main: Script viewer + Breakdown panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'var(--bg-primary)' }}>
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
              onRemoveTag={(tagId) => removeTagMutation.mutate(tagId)}
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
    </div>
  );
}

export default ScriptBreakdownPage;
