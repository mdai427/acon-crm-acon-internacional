import React, { useState, useEffect } from 'react';
import { getKanban, moveLead } from '../services/api';
import { ScoreBadge } from '../components/Badges';
import {
  RefreshCw, Star, DollarSign, Clock, AlertTriangle,
  Anchor, CheckCircle2, XCircle, Phone, Mail, MessageSquare
} from 'lucide-react';

const STAGES = [
  { id: 'new',         label: 'Nuevos',       color: '#2563EB', bg: '#EFF6FF', icon: '🔵' },
  { id: 'contacted',   label: 'Contactados',  color: '#7C3AED', bg: '#F5F3FF', icon: '💬' },
  { id: 'qualified',   label: 'Calificados',  color: '#CA8A04', bg: '#FEFCE8', icon: '⭐' },
  { id: 'proposal',    label: 'Propuesta',    color: '#F2641E', bg: '#FFF7ED', icon: '📄' },
  { id: 'negotiation', label: 'Negociación',  color: '#EA580C', bg: '#FFF4EE', icon: '🤝' },
  { id: 'closed_won',  label: 'Ganados',      color: '#16A34A', bg: '#F0FDF4', icon: '✅' },
  { id: 'closed_lost', label: 'Perdidos',     color: '#DC2626', bg: '#FEF2F2', icon: '❌' },
];

const SOURCE_ICON = {
  whatsapp: <MessageSquare size={10} />,
  email:    <Mail size={10} />,
  phone:    <Phone size={10} />,
  web:      '🌐',
  facebook: '📘',
  linkedin: '💼',
  referral: '👤',
};

function LeadCard({ lead, stage, onDragStart, onClick }) {
  const isStale = lead.daysSinceLastContact > 3;
  const isUrgent = lead.priority === 'urgent' || lead.priority === 'high';

  return (
    <div
      className="kanban-card"
      draggable
      onDragStart={e => onDragStart(e, lead, stage)}
      onClick={() => onClick(lead._id)}
      style={{
        background: '#fff',
        border: `1px solid ${isStale ? '#FCA5A5' : 'var(--gray-200)'}`,
        borderLeft: `3px solid ${isUrgent ? '#F2641E' : 'var(--gray-200)'}`,
        borderRadius: 10,
        padding: '11px 13px',
        cursor: 'grab',
        transition: 'all .18s',
        boxShadow: '0 1px 4px rgba(11,37,69,.05)',
        position: 'relative',
      }}
    >
      {/* Empresa */}
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy-900)', marginBottom: 2, lineHeight: 1.3 }}>
        {lead.company}
      </div>
      {/* Contacto */}
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
        {lead.contact?.name || lead.contact}
      </div>

      {/* Valor + Score */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <ScoreBadge score={lead.score || 0} />
        {lead.value > 0 && (
          <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
            <DollarSign size={10} />{lead.value.toLocaleString()}
          </span>
        )}
      </div>

      {/* Footer: ejecutivo + inactividad */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        {lead.assignedTo ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div className="avatar" style={{ width: 18, height: 18, fontSize: 7, flexShrink: 0 }}>
              {lead.assignedTo.name?.slice(0, 2).toUpperCase()}
            </div>
            <span style={{ fontSize: 10, color: 'var(--text3)' }}>{lead.assignedTo.name?.split(' ')[0]}</span>
          </div>
        ) : <span />}

        {isStale && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#DC2626', fontWeight: 600 }}>
            <Clock size={10} /> {lead.daysSinceLastContact}d
          </span>
        )}
      </div>
    </div>
  );
}

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
    if (!dragging || dragging.stage === targetStage) { setDragging(null); setDragOver(null); return; }
    try {
      await moveLead({ leadId: dragging.lead._id, newStage: targetStage });
      toast(`Movido a ${STAGES.find(s => s.id === targetStage)?.label}`, 'success');
      load();
    } catch { toast('Error al mover lead', 'error'); }
    setDragging(null);
    setDragOver(null);
  };

  const totalLeads  = Object.values(columns).reduce((a, b) => a + b.length, 0);
  const totalValue  = Object.values(columns).flat().reduce((a, l) => a + (l.value || 0), 0);
  const wonLeads    = (columns['closed_won'] || []).length;

  if (loading) return <div className="loading"><div className="spinner" />Cargando pipeline...</div>;

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Header ── */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'var(--navy-900)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Anchor size={16} color="#fff" />
            </div>
            <div>
              <div className="page-title">Pipeline de Ventas</div>
              <div className="page-sub">Arrastra los prospectos entre etapas</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Mini KPIs */}
          <div style={{ display: 'flex', gap: 20, padding: '8px 20px', background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy-900)' }}>{totalLeads}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 500 }}>Prospectos</div>
            </div>
            <div style={{ width: 1, background: 'var(--gray-200)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#16A34A' }}>{wonLeads}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 500 }}>Ganados</div>
            </div>
            <div style={{ width: 1, background: 'var(--gray-200)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--orange-500)' }}>${(totalValue / 1000).toFixed(0)}K</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 500 }}>Pipeline</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} /> Actualizar
          </button>
        </div>
      </div>

      {/* ── Kanban Board ── */}
      <div style={{ overflowX: 'auto', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STAGES.length}, 230px)`, gap: 12, paddingBottom: 20, minWidth: 'max-content' }}>
          {STAGES.map(stage => {
            const cards = columns[stage.id] || [];
            const stageValue = cards.reduce((a, l) => a + (l.value || 0), 0);
            const isOver = dragOver === stage.id;

            return (
              <div
                key={stage.id}
                onDragOver={e => { e.preventDefault(); setDragOver(stage.id); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => handleDrop(e, stage.id)}
                style={{
                  background: isOver ? stage.bg : '#fff',
                  border: `1px solid ${isOver ? stage.color : 'var(--gray-200)'}`,
                  borderTop: `3px solid ${stage.color}`,
                  borderRadius: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 480,
                  transition: 'all .15s',
                  boxShadow: isOver
                    ? `0 0 0 2px ${stage.color}22, 0 4px 16px rgba(0,0,0,.08)`
                    : '0 1px 4px rgba(11,37,69,.05)',
                }}
              >
                {/* Column Header */}
                <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--gray-100)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13 }}>{stage.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.6px', color: stage.color }}>
                        {stage.label}
                      </span>
                    </div>
                    <div style={{
                      background: stage.bg,
                      color: stage.color,
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 20,
                      border: `1px solid ${stage.color}30`,
                    }}>
                      {cards.length}
                    </div>
                  </div>
                  {stageValue > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <DollarSign size={9} />
                      {stageValue.toLocaleString()} USD en esta etapa
                    </div>
                  )}
                </div>

                {/* Cards */}
                <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  {cards.map(lead => (
                    <LeadCard
                      key={lead._id}
                      lead={lead}
                      stage={stage.id}
                      onDragStart={handleDragStart}
                      onClick={onSelect}
                    />
                  ))}

                  {cards.length === 0 && (
                    <div style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '24px 12px',
                      borderRadius: 8,
                      border: `2px dashed ${isOver ? stage.color : 'var(--gray-200)'}`,
                      color: isOver ? stage.color : 'var(--text3)',
                      fontSize: 12,
                      transition: 'all .15s',
                      minHeight: 100,
                    }}>
                      <span style={{ fontSize: 20, marginBottom: 6, opacity: .5 }}>{stage.icon}</span>
                      Arrastra aquí
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
