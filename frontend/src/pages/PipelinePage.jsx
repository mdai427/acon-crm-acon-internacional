import React, { useState, useEffect } from 'react';
import { getKanban, moveLead } from '../services/api';
import { ScoreBadge } from '../components/Badges';

const STAGES = [
  { id: 'new', label: 'Nuevos', color: '#3B82F6' },
  { id: 'contacted', label: 'Contactados', color: '#A855F7' },
  { id: 'qualified', label: 'Calificados', color: '#EAB308' },
  { id: 'proposal', label: 'Propuesta', color: '#F07B1A' },
  { id: 'negotiation', label: 'Negociación', color: '#FB923C' },
  { id: 'closed_won', label: '✓ Ganados', color: '#22C55E' },
  { id: 'closed_lost', label: '✗ Perdidos', color: '#EF4444' },
];

export default function PipelinePage({ toast, onSelect }) {
  const [columns, setColumns] = useState({});
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const load = () => {
    setLoading(true);
    getKanban()
      .then(r => setColumns(r.data.data || {}))
      .catch(() => toast('Error al cargar pipeline', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDragStart = (e, lead, stage) => {
    setDragging({ lead, stage });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e, targetStage) => {
    e.preventDefault();
    if (!dragging || dragging.stage === targetStage) return;
    try {
      await moveLead({ leadId: dragging.lead._id, newStage: targetStage });
      toast(`Movido a ${STAGES.find(s => s.id === targetStage)?.label}`, 'success');
      load();
    } catch { toast('Error al mover lead', 'error'); }
    setDragging(null);
    setDragOver(null);
  };

  if (loading) return <div className="loading"><div className="spinner" />Cargando pipeline...</div>;

  return (
    <div className="page" style={{ overflowX: 'auto' }}>
      <div className="page-header">
        <div>
          <div className="page-title">Pipeline Kanban</div>
          <div className="page-sub">Arrastra los leads entre etapas</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>↻ Actualizar</button>
      </div>

      <div className="kanban">
        {STAGES.map(stage => {
          const cards = columns[stage.id] || [];
          return (
            <div key={stage.id} className="kanban-col"
              onDragOver={e => { e.preventDefault(); setDragOver(stage.id); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => handleDrop(e, stage.id)}
              style={{ borderTop: `3px solid ${stage.color}`, opacity: dragOver === stage.id ? 0.85 : 1 }}>
              <div className="kanban-header">
                <span className="kanban-title" style={{ color: stage.color }}>{stage.label}</span>
                <span className="kanban-count">{cards.length}</span>
              </div>
              <div className="kanban-cards">
                {cards.map(lead => (
                  <div key={lead._id} className="kanban-card"
                    draggable
                    onDragStart={e => handleDragStart(e, lead, stage.id)}
                    onClick={() => onSelect(lead._id)}>
                    <div className="kc-company">{lead.company}</div>
                    <div className="kc-contact" style={{ color: 'var(--text2)', fontSize: 11 }}>
                      {lead.contact?.name || lead.contact}
                    </div>
                    <div className="kc-meta">
                      <ScoreBadge score={lead.score || 0} />
                      {lead.value > 0 && <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>${lead.value.toLocaleString()}</span>}
                    </div>
                    {lead.assignedTo && (
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text3)' }}>
                        <div className="avatar" style={{ width: 20, height: 20, fontSize: 8 }}>
                          {lead.assignedTo.avatar || lead.assignedTo.name?.slice(0,2).toUpperCase()}
                        </div>
                        {lead.assignedTo.name}
                      </div>
                    )}
                    {lead.daysSinceLastContact > 3 && (
                      <div style={{ marginTop: 6, fontSize: 10, color: 'var(--red)' }}>
                        ⚠ Sin contacto {lead.daysSinceLastContact}d
                      </div>
                    )}
                  </div>
                ))}
                {cards.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 10px', color: 'var(--text3)', fontSize: 12, borderRadius: 8, border: '2px dashed var(--border)' }}>
                    Arrastra leads aquí
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
