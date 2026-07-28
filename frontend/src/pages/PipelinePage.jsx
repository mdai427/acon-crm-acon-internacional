import React, { useState, useEffect, useMemo } from 'react';
import { getKanban, moveLead } from '../services/api';
import { ScoreBadge } from '../components/Badges';
import { Flame, Thermometer, Snowflake, Zap, RefreshCw, DollarSign, Users } from 'lucide-react';

const STAGES = [
  { id: 'new',         label: 'Nuevos',      color: '#6366f1' },
  { id: 'contacted',   label: 'Contactados', color: '#3b82f6' },
  { id: 'qualified',   label: 'Calificados', color: '#eab308' },
  { id: 'proposal',    label: 'Propuesta',   color: '#f97316' },
  { id: 'negotiation', label: 'Negociación', color: '#8b5cf6' },
  { id: 'closed_won',  label: '✓ Ganados',   color: '#22c55e' },
  { id: 'closed_lost', label: '✗ Perdidos',  color: '#ef4444' },
];

// ── Temperature ────────────────────────────────────────────────────────────────
function getTemp(lead) {
  const score = lead.score || 0;
  const days = lead.daysSinceLastContact || 0;
  const hasFollowUp = lead.nextFollowUpDate && new Date(lead.nextFollowUpDate) <= new Date();

  if (score >= 80 && hasFollowUp)   return { label: 'Urgente',  color: '#ef4444', bg: '#fef2f2', Icon: Zap };
  if (score >= 70 || days <= 2)     return { label: 'Caliente', color: '#f97316', bg: '#fff7ed', Icon: Flame };
  if (score >= 40 && days <= 7)     return { label: 'Tibio',    color: '#eab308', bg: '#fefce8', Icon: Thermometer };
  return                                   { label: 'Frío',     color: '#06b6d4', bg: '#ecfeff', Icon: Snowflake };
}

const fmtVal = (v) => {
  if (!v || v === 0) return null;
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000)    return `$${(v / 1000).toFixed(0)}K`;
  return `$${Math.round(v).toLocaleString()}`;
};

// ── Kanban Card ────────────────────────────────────────────────────────────────
function KanbanCard({ lead, stage, onDragStart, onClick }) {
  const temp = getTemp(lead);
  const TempIcon = temp.Icon;
  const val = fmtVal(lead.value);
  const daysSince = lead.daysSinceLastContact;

  return (
    <div
      className="pipeline-card"
      draggable
      onDragStart={e => onDragStart(e, lead, stage)}
      onClick={() => onClick(lead._id)}
    >
      {/* Temperature badge */}
      <div className="pc-temp" style={{ background: temp.bg, color: temp.color }}>
        <TempIcon size={10} strokeWidth={2.5} />
        <span>{temp.label}</span>
      </div>

      {/* Company */}
      <div className="pc-company">{lead.company}</div>
      <div className="pc-contact">{lead.contact?.name || lead.contact}</div>

      {/* Meta row */}
      <div className="pc-meta-row">
        <ScoreBadge score={lead.score || 0} />
        {val && (
          <span className="pc-value">
            <DollarSign size={10} /> {val}
          </span>
        )}
      </div>

      {/* Assigned */}
      {lead.assignedTo && (
        <div className="pc-assigned">
          <div className="avatar" style={{ width: 18, height: 18, fontSize: 7 }}>
            {lead.assignedTo.name?.slice(0, 2).toUpperCase()}
          </div>
          <span>{lead.assignedTo.name}</span>
        </div>
      )}

      {/* Warning */}
      {daysSince > 3 && (
        <div className="pc-warning">
          ⚠ Sin contacto · {daysSince}d
        </div>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function PipelinePage({ toast, onSelect }) {
  const [columns, setColumns]   = useState({});
  const [loading, setLoading]   = useState(true);
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

  // Stage totals
  const stageTotals = useMemo(() => {
    const totals = {};
    for (const s of STAGES) {
      const cards = columns[s.id] || [];
      totals[s.id] = {
        count: cards.length,
        value: cards.reduce((sum, l) => sum + (l.value || 0), 0),
      };
    }
    return totals;
  }, [columns]);

  if (loading) return (
    <div className="loading"><div className="spinner" />Cargando pipeline...</div>
  );

  const totalActive = STAGES
    .filter(s => !['closed_won', 'closed_lost'].includes(s.id))
    .reduce((sum, s) => sum + (stageTotals[s.id]?.count || 0), 0);

  const totalValue = STAGES
    .filter(s => !['closed_won', 'closed_lost'].includes(s.id))
    .reduce((sum, s) => sum + (stageTotals[s.id]?.value || 0), 0);

  return (
    <div className="page pipeline-page">
      <div className="page-header">
        <div>
          <div className="page-title">Pipeline Comercial</div>
          <div className="page-sub">
            <Users size={12} /> {totalActive} oportunidades activas ·
            <DollarSign size={12} /> {fmtVal(totalValue) || '$0'} en pipeline
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="pipeline-legend">
            {[
              { label: 'Urgente', color: '#ef4444', Icon: Zap },
              { label: 'Caliente', color: '#f97316', Icon: Flame },
              { label: 'Tibio', color: '#eab308', Icon: Thermometer },
              { label: 'Frío', color: '#06b6d4', Icon: Snowflake },
            ].map(({ label, color, Icon }) => (
              <span key={label} className="pipeline-legend-item" style={{ color }}>
                <Icon size={11} /> {label}
              </span>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={load}>
            <RefreshCw size={13} /> Actualizar
          </button>
        </div>
      </div>

      <div className="kanban">
        {STAGES.map(stage => {
          const cards = columns[stage.id] || [];
          const totals = stageTotals[stage.id];
          const isDragOver = dragOver === stage.id;

          return (
            <div
              key={stage.id}
              className={`kanban-col ${isDragOver ? 'kanban-col-drag' : ''}`}
              style={{ borderTop: `3px solid ${stage.color}` }}
              onDragOver={e => { e.preventDefault(); setDragOver(stage.id); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => handleDrop(e, stage.id)}
            >
              {/* Column Header */}
              <div className="kanban-header">
                <span className="kanban-title" style={{ color: stage.color }}>{stage.label}</span>
                <span className="kanban-count" style={{ background: stage.color + '18', color: stage.color }}>
                  {totals.count}
                </span>
              </div>
              {/* Stage Value */}
              {totals.value > 0 && (
                <div className="kanban-stage-value">
                  {fmtVal(totals.value)}
                </div>
              )}

              {/* Cards */}
              <div className="kanban-cards">
                {cards.map(lead => (
                  <KanbanCard
                    key={lead._id}
                    lead={lead}
                    stage={stage.id}
                    onDragStart={handleDragStart}
                    onClick={onSelect}
                  />
                ))}
                {cards.length === 0 && (
                  <div className="kanban-empty">
                    Arrastra aquí
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
