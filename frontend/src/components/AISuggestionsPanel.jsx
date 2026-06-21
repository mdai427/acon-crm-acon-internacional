import React, { useState, useEffect } from 'react';
import { getStageSuggestions, createStageTasks } from '../services/api';
import { Sparkles, CheckCircle2, Plus, RefreshCw, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

const STAGE_LABELS = {
  new: 'Nuevo', contacted: 'Contactado', qualified: 'Calificado',
  proposal: 'Propuesta', negotiation: 'Negociación',
  closed_won: 'Ganado', closed_lost: 'Perdido',
};

const STAGE_COLORS = {
  new: '#2563EB', contacted: '#7C3AED', qualified: '#CA8A04',
  proposal: '#F2641E', negotiation: '#EA580C',
  closed_won: '#16A34A', closed_lost: '#DC2626',
};

export default function AISuggestionsPanel({ leadId, stage, onTasksCreated, toast }) {
  const [tasks, setTasks]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [creating, setCreating] = useState(false);
  const [source, setSource]     = useState('ai');
  const [collapsed, setCollapsed] = useState(false);
  const [created, setCreated]   = useState(false);

  const load = async () => {
    if (!leadId || !stage) return;
    setLoading(true);
    setCreated(false);
    try {
      const r = await getStageSuggestions(leadId, stage);
      setTasks(r.data.data.tasks || []);
      setSource(r.data.data.source || 'ai');
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [leadId, stage]);

  const handleCreateAll = async () => {
    setCreating(true);
    try {
      const r = await createStageTasks(leadId, stage);
      setCreated(true);
      toast?.(`${r.data.data.created} tareas creadas en el timeline`, 'success');
      onTasksCreated?.();
    } catch {
      toast?.('Error al crear tareas', 'error');
    } finally {
      setCreating(false);
    }
  };

  const stageColor = STAGE_COLORS[stage] || '#F2641E';

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(242,100,30,.05) 0%, rgba(11,37,69,.04) 100%)',
      border: `1px solid rgba(242,100,30,.2)`,
      borderRadius: 12,
      marginBottom: 16,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px', cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid rgba(242,100,30,.12)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #F2641E, #d4531a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(242,100,30,.3)',
          }}>
            <Sparkles size={14} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy-900)' }}>
              Tareas recomendadas por IA
            </div>
            <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 1 }}>
              Etapa: <span style={{ color: stageColor, fontWeight: 600 }}>{STAGE_LABELS[stage] || stage}</span>
              {source === 'playbook' && <span style={{ marginLeft: 6, background: '#EDE9FE', color: '#7C3AED', padding: '1px 6px', borderRadius: 10, fontSize: 9 }}>PLAYBOOK</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!loading && (
            <button
              onClick={(e) => { e.stopPropagation(); load(); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', padding: 4, borderRadius: 4, display: 'flex' }}
              title="Regenerar"
            >
              <RefreshCw size={13} />
            </button>
          )}
          {collapsed ? <ChevronDown size={16} color="var(--gray-400)" /> : <ChevronUp size={16} color="var(--gray-400)" />}
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div style={{ padding: '12px 14px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gray-400)', fontSize: 12, padding: '8px 0' }}>
              <Loader2 size={14} className="spin-slow" style={{ animation: 'spin .8s linear infinite' }} />
              Generando recomendaciones con IA...
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {tasks.map((task, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '8px 10px',
                    background: created ? 'rgba(22,163,74,.06)' : '#fff',
                    border: `1px solid ${created ? 'rgba(22,163,74,.2)' : 'var(--gray-200)'}`,
                    borderRadius: 8,
                    transition: 'all .3s',
                  }}>
                    {created
                      ? <CheckCircle2 size={15} color="#16A34A" style={{ flexShrink: 0, marginTop: 1 }} />
                      : <div style={{
                          width: 15, height: 15, borderRadius: '50%',
                          border: '2px solid var(--gray-300)',
                          flexShrink: 0, marginTop: 1,
                        }} />
                    }
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: 'var(--gray-900)', fontWeight: 500, lineHeight: 1.4 }}>
                        {task.title}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 2 }}>
                        Vence en {task.dueInDays} día{task.dueInDays !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {!created ? (
                <button
                  onClick={handleCreateAll}
                  disabled={creating || tasks.length === 0}
                  style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '9px 14px',
                    background: 'linear-gradient(135deg, #F2641E, #d4531a)',
                    border: 'none', borderRadius: 8,
                    color: '#fff', fontSize: 12, fontWeight: 700,
                    cursor: creating ? 'not-allowed' : 'pointer',
                    opacity: creating ? .7 : 1,
                    boxShadow: '0 2px 10px rgba(242,100,30,.3)',
                    transition: 'all .2s',
                  }}
                >
                  {creating
                    ? <><Loader2 size={13} style={{ animation: 'spin .8s linear infinite' }} /> Creando tareas...</>
                    : <><Plus size={13} /> Agregar {tasks.length} tareas al timeline</>
                  }
                </button>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '8px 14px',
                  background: 'rgba(22,163,74,.08)', border: '1px solid rgba(22,163,74,.2)',
                  borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#16A34A',
                }}>
                  <CheckCircle2 size={13} /> {tasks.length} tareas agregadas al timeline
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
