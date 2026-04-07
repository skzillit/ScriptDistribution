import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { breakdownApi } from '../api/scripts.api';
import { toast } from 'react-toastify';
import BreakdownViewer from '../components/breakdown/BreakdownViewer';

const CATEGORIES = [
  { key: 'CAST_MEMBER', label: 'Cast Member', color: '#FF6B6B' },
  { key: 'EXTRA', label: 'Extra', color: '#FF8E8E' },
  { key: 'PROP', label: 'Prop', color: '#4ECDC4' },
  { key: 'SET_DRESSING', label: 'Set Dressing', color: '#45B7D1' },
  { key: 'LOCATION', label: 'Location', color: '#96CEB4' },
  { key: 'VEHICLE', label: 'Vehicle', color: '#FFEAA7' },
  { key: 'WARDROBE', label: 'Wardrobe', color: '#DDA0DD' },
  { key: 'MAKEUP_HAIR', label: 'Makeup/Hair', color: '#FFB6C1' },
  { key: 'VFX', label: 'VFX', color: '#A29BFE' },
  { key: 'SFX', label: 'SFX', color: '#FD79A8' },
  { key: 'SOUND_EFFECT', label: 'Sound Effect', color: '#E17055' },
  { key: 'MUSIC', label: 'Music', color: '#00B894' },
  { key: 'SPECIAL_EQUIPMENT', label: 'Equipment', color: '#FDCB6E' },
  { key: 'ANIMAL', label: 'Animal', color: '#6C5CE7' },
  { key: 'STUNT', label: 'Stunt', color: '#D63031' },
  { key: 'GREENERY', label: 'Greenery', color: '#00B894' },
];

function BreakdownPage() {
  const { id, versionId } = useParams();
  const [selectedElement, setSelectedElement] = useState(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [panelTab, setPanelTab] = useState('elements'); // 'elements' | 'add'
  const queryClient = useQueryClient();

  const retryMutation = useMutation({
    mutationFn: () => breakdownApi.trigger(versionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['breakdown', versionId] }),
  });

  const { data: breakdownData, isLoading } = useQuery({
    queryKey: ['breakdown', versionId],
    queryFn: () => breakdownApi.get(versionId).then(r => r.data),
    refetchInterval: (query) => {
      const status = query.state.data?.breakdown?.status;
      return status === 'pending' || status === 'processing' ? 3000 : false;
    },
  });

  const breakdown = breakdownData?.breakdown;
  const isProcessing = breakdown?.status === 'pending' || breakdown?.status === 'processing';

  if (isLoading) return <div className="loading-spinner">Loading breakdown...</div>;

  if (isProcessing) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '80vh', textAlign: 'center', padding: '40px',
      }}>
        <div style={{
          width: '80px', height: '80px', margin: '0 auto 24px', borderRadius: '20px',
          background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: '36px', height: '36px', border: '3px solid var(--border)',
            borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite',
          }} />
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: '700', background: 'var(--gradient-accent)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          AI is analyzing your script...
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '8px', fontSize: '14px' }}>This may take 30-60 seconds</p>
      </div>
    );
  }

  if (breakdown?.status === 'error') {
    return (
      <div className="container" style={{ paddingTop: '40px' }}>
        <Link to={`/scripts/${id}`}>&larr; Back</Link>
        <div className="card" style={{ marginTop: '16px', borderColor: 'var(--error)' }}>
          <h3 style={{ color: 'var(--error)' }}>Breakdown Failed</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>{breakdown.error}</p>
          <button className="btn-primary" style={{ marginTop: '16px' }}
            onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}>
            {retryMutation.isPending ? 'Retrying...' : 'Retry Breakdown'}
          </button>
        </div>
      </div>
    );
  }

  // No breakdown at all — show option to create
  if (!breakdown) {
    return (
      <div className="container" style={{ paddingTop: '40px', textAlign: 'center' }}>
        <Link to={`/scripts/${id}`}>&larr; Back</Link>
        <div className="card" style={{ marginTop: '24px', padding: '40px' }}>
          <h3>No Breakdown Yet</h3>
          <p style={{ color: 'var(--text-secondary)', margin: '12px 0 20px' }}>
            Start a breakdown to identify cast, props, locations, and more.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button className="btn-primary" onClick={() => retryMutation.mutate()}>
              AI Breakdown
            </button>
            <button className="btn-secondary" onClick={() => {
              breakdownApi.trigger(versionId + '?mode=manual').then(() => {
                queryClient.invalidateQueries({ queryKey: ['breakdown', versionId] });
              });
            }}>
              Manual Breakdown
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
        padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link to={`/scripts/${id}`} style={{ fontSize: '13px' }}>&larr; Back to Script</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {breakdown?.summary && (
            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <span>{breakdown.summary.totalScenes} scenes</span>
              <span>{breakdown.summary.totalPages} pages</span>
              <span>{breakdown.summary.castCount} cast</span>
              <span>{breakdown.summary.locationCount} locations</span>
              <span>{breakdown.elements?.length || 0} elements</span>
            </div>
          )}
          <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: '11px' }}
            onClick={() => { setShowAddPanel(!showAddPanel); setPanelTab('elements'); }}>
            {showAddPanel ? 'Hide Panel' : 'Edit Breakdown'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Main viewer */}
        <div style={{ flex: 1 }}>
          <BreakdownViewer versionId={versionId} onElementTap={setSelectedElement} />
        </div>

        {/* Right panel: element detail OR manual edit panel */}
        {(showAddPanel || selectedElement) && (
          <div style={{
            width: '320px', background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Panel tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
              {[
                { key: 'elements', label: `Elements (${breakdown?.elements?.length || 0})` },
                { key: 'add', label: '+ Add' },
              ].map(t => (
                <button key={t.key} onClick={() => { setPanelTab(t.key); setShowAddPanel(true); }}
                  style={{
                    flex: 1, padding: '10px', border: 'none', fontSize: '12px', fontWeight: '600',
                    background: panelTab === t.key ? 'var(--bg-card)' : 'transparent',
                    color: panelTab === t.key ? 'var(--text-primary)' : 'var(--text-muted)',
                    borderBottom: panelTab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
                    cursor: 'pointer',
                  }}>
                  {t.label}
                </button>
              ))}
              <button onClick={() => { setShowAddPanel(false); setSelectedElement(null); }}
                style={{ padding: '10px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px' }}>
                &times;
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {panelTab === 'elements' && (
                <ElementsList breakdown={breakdown} onSelect={setSelectedElement} selected={selectedElement} />
              )}
              {panelTab === 'add' && (
                <AddElementForm breakdownId={breakdown?._id} onAdded={() => {
                  queryClient.invalidateQueries({ queryKey: ['breakdown', versionId] });
                  setPanelTab('elements');
                }} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ElementsList({ breakdown, onSelect, selected }) {
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: ({ breakdownId, elementId }) => breakdownApi.deleteElement(breakdownId, elementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['breakdown'] });
      toast.success('Element deleted');
    },
  });

  const elements = breakdown?.elements || [];
  // Group by category
  const grouped = {};
  elements.forEach(el => {
    if (!grouped[el.category]) grouped[el.category] = [];
    grouped[el.category].push(el);
  });

  if (elements.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
        No elements yet. Click the <strong>+ Add</strong> tab to create one.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {Object.entries(grouped).map(([cat, els]) => {
        const catInfo = CATEGORIES.find(c => c.key === cat);
        return (
          <div key={cat}>
            <div style={{
              fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px',
              color: catInfo?.color || 'var(--text-muted)', marginBottom: '6px',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: catInfo?.color || '#888' }} />
              {catInfo?.label || cat} ({els.length})
            </div>
            {els.map(el => (
              <div key={el._id} onClick={() => onSelect(el)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 8px', borderRadius: '6px', marginBottom: '3px', cursor: 'pointer',
                  background: selected?._id === el._id ? 'var(--accent-glow)' : 'transparent',
                  border: selected?._id === el._id ? '1px solid var(--border-hover)' : '1px solid transparent',
                  transition: 'all 0.15s',
                }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {el.name}
                  </div>
                  {el.description && (
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {el.description}
                    </div>
                  )}
                </div>
                <button onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Delete "${el.name}"?`)) {
                    deleteMutation.mutate({ breakdownId: breakdown._id, elementId: el._id });
                  }
                }}
                  style={{
                    background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '14px',
                    cursor: 'pointer', padding: '2px 4px', flexShrink: 0, borderRadius: '4px',
                  }}>
                  &times;
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function AddElementForm({ breakdownId, onAdded }) {
  const [category, setCategory] = useState('CAST_MEMBER');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Name is required');
    setSubmitting(true);
    try {
      await breakdownApi.addElement(breakdownId, {
        category,
        name: name.trim(),
        description: description.trim() || undefined,
        occurrences: [],
      });
      toast.success(`Added: ${name}`);
      setName('');
      setDescription('');
      onAdded();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add element');
    } finally {
      setSubmitting(false);
    }
  };

  const labelStyle = {
    fontSize: '10px', color: 'var(--text-secondary)', display: 'block',
    marginBottom: '4px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px',
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <label style={labelStyle}>Category</label>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px',
        }}>
          {CATEGORIES.map(cat => (
            <button key={cat.key} type="button" onClick={() => setCategory(cat.key)}
              style={{
                padding: '6px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '600',
                cursor: 'pointer', border: '1px solid', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: '5px',
                background: category === cat.key ? cat.color + '22' : 'var(--bg-primary)',
                color: category === cat.key ? cat.color : 'var(--text-muted)',
                borderColor: category === cat.key ? cat.color : 'var(--border)',
              }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={labelStyle}>Name *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. BRUCE WAYNE"
          style={{ padding: '8px 10px', fontSize: '13px' }} required />
      </div>

      <div>
        <label style={labelStyle}>Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Optional description" style={{ padding: '8px 10px', fontSize: '13px' }} />
      </div>

      <button type="submit" className="btn-primary" disabled={submitting || !name.trim()}
        style={{ opacity: (submitting || !name.trim()) ? 0.5 : 1, padding: '10px', fontSize: '13px' }}>
        {submitting ? 'Adding...' : 'Add Element'}
      </button>
    </form>
  );
}

export default BreakdownPage;
