import React, { useEffect, useState } from 'react';
import { getPlaybooks, updatePlaybook, seedPlaybooks } from '../services/api';
import { Sparkles, BookOpen, Plus, Trash2, Save, ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Wand2 } from 'lucide-react';

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
const STAGE_ICONS = {
  new: '🆕', contacted: '📞', qualified: '✅',
  proposal: '📄', negotiation: '🤝',
  closed_won: '🏆', closed_lost: '❌',
};

function PlaybookCard({ playbook: initialPb, onSave, toast }) {
  const [pb, setPb]           = useState(initialPb);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [dirty, setDirty]     = useState(false);

  const update = (patch) => { setPb(p => ({ ...p, ...patch })); setDirty(true); };
  const updateTask = (i, patch) => {
    const tasks = [...pb.tasks];
    tasks[i] = { ...tasks[i], ...patch };
    update({ tasks });
  };
  const addTask = () => update({ tasks: [...pb.tasks, { title: '', dueInDays: 3, order: pb.tasks.length }] });
  const removeTask = (i) => update({ tasks: pb.tasks.filter((_, idx) => idx !== i) });

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(pb.stage, { tasks: pb.tasks, isActive: pb.isActive, useAI: pb.useAI });
      setDirty(false);
      toast('Playbook guardado', 'success');
    } catch { toast('Error al guardar', 'error'); }
    finally { setSaving(false); }
  };

  const color = STAGE_COLORS[pb.stage] || '#F2641E';

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${expanded ? color + '40' : 'var(--gray-200)'}`,
      borderRadius: 12,
      overflow: 'hidden',
      transition: 'border-color .2s',
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', cursor: 'pointer',
          background: expanded ? `${color}06` : '#fff',
          borderBottom: expanded ? `1px solid ${color}20` : 'none',
          transition: 'background .2s',
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 9, flexShrink: 0,
          background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18,
        }}>
          {STAGE_ICONS[pb.stage]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy-900)' }}>
            {STAGE_LABELS[pb.stage]}
          </div>
          <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>
            {pb.tasks?.length || 0} tareas ·{' '}
            {pb.useAI
              ? <span style={{ color: '#7C3AED', fontWeight: 600 }}>✨ Generadas por IA</span>
              : <span style={{ color: '#16A34A', fontWeight: 600 }}>📋 Playbook fijo</span>
            }
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {dirty && (
            <span style={{ fontSize: 10, fontWeight: 600, color: '#CA8A04', background: '#FEF9C3', padding: '2px 8px', borderRadius: 10 }}>
              Sin guardar
            </span>
          )}
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: pb.isActive ? '#16A34A' : '#9AA3AE',
          }} />
          {expanded ? <ChevronUp size={16} color="var(--gray-400)" /> : <ChevronDown size={16} color="var(--gray-400)" />}
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div style={{ padding: '16px' }}>
          {/* Controls */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <button
              onClick={() => update({ isActive: !pb.isActive })}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 20, border: 'none',
                background: pb.isActive ? 'var(--green-bg)' : 'var(--gray-100)',
                color: pb.isActive ? 'var(--green)' : 'var(--gray-500)',
                cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}
            >
              {pb.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              {pb.isActive ? 'Activo' : 'Inactivo'}
            </button>

            <button
              onClick={() => update({ useAI: !pb.useAI })}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 20, border: 'none',
                background: pb.useAI ? '#EDE9FE' : '#F0FDF4',
                color: pb.useAI ? '#7C3AED' : '#16A34A',
                cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}
            >
              {pb.useAI ? <Sparkles size={13} /> : <BookOpen size={13} />}
              {pb.useAI ? 'Modo IA' : 'Playbook fijo'}
            </button>
          </div>

          {pb.useAI && (
            <div style={{
              padding: '10px 12px', background: '#F5F3FF',
              border: '1px solid #DDD6FE', borderRadius: 8, marginBottom: 14,
              fontSize: 12, color: '#6D28D9',
            }}>
              <Sparkles size={13} style={{ display: 'inline', marginRight: 5 }} />
              En <strong>modo IA</strong>, las tareas se generan automáticamente con GPT-4 al entrar a esta etapa, adaptadas al perfil de cada lead. Las tareas aquí son de referencia / respaldo.
            </div>
          )}

          {/* Task list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {pb.tasks?.map((task, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: `${color}18`, color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700,
                }}>
                  {i + 1}
                </div>
                <input
                  className="form-input"
                  value={task.title}
                  onChange={e => updateTask(i, { title: e.target.value })}
                  placeholder="Descripción de la tarea..."
                  style={{ flex: 1, fontSize: 12 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <input
                    type="number"
                    min="1" max="30"
                    value={task.dueInDays}
                    onChange={e => updateTask(i, { dueInDays: Number(e.target.value) })}
                    className="form-input"
                    style={{ width: 52, fontSize: 12, textAlign: 'center', padding: '6px 8px' }}
                    title="Días para vencer"
                  />
                  <span style={{ fontSize: 10, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>días</span>
                  <button
                    onClick={() => removeTask(i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', padding: 4, borderRadius: 4, display: 'flex' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={addTask} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Plus size={13} /> Agregar tarea
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={saving || !dirty}
              style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}
            >
              <Save size={13} /> {saving ? 'Guardando...' : 'Guardar playbook'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlaybooksPage({ toast }) {
  const [playbooks, setPlaybooks] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [seeding, setSeeding]     = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await getPlaybooks();
      setPlaybooks(r.data.data || []);
    } catch { toast('Error al cargar playbooks', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedPlaybooks();
      toast('Playbooks inicializados con plantillas ACON', 'success');
      load();
    } catch { toast('Error', 'error'); }
    finally { setSeeding(false); }
  };

  const handleSave = async (stage, data) => {
    await updatePlaybook(stage, data);
    load();
  };

  if (loading) return <div className="loading"><div className="spinner" />Cargando playbooks...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Playbooks por Etapa</div>
          <div className="page-sub">Define las tareas que se crean automáticamente cuando un lead avanza de etapa</div>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSeed}
          disabled={seeding}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Wand2 size={14} /> {seeding ? 'Inicializando...' : 'Cargar plantillas ACON'}
        </button>
      </div>

      {/* Info banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(124,58,237,.06), rgba(11,37,69,.04))',
        border: '1px solid rgba(124,58,237,.2)', borderRadius: 12,
        padding: '14px 18px', marginBottom: 20,
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <Sparkles size={20} color="#7C3AED" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#5B21B6', marginBottom: 4 }}>
            Cómo funcionan los playbooks
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', lineHeight: 1.6 }}>
            Cada vez que un lead <strong>cambia de etapa</strong>, el sistema genera automáticamente las tareas del playbook correspondiente y las agrega al timeline del lead.<br />
            En <strong>modo IA</strong>: GPT-4 genera tareas personalizadas basadas en el perfil del lead (empresa, servicios, país, valor).<br />
            En <strong>playbook fijo</strong>: se usan exactamente las tareas que defines aquí, editables en cualquier momento.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {playbooks.map(pb => (
          <PlaybookCard key={pb.stage} playbook={pb} onSave={handleSave} toast={toast} />
        ))}
      </div>
    </div>
  );
}
