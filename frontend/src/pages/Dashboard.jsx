import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  RadialBarChart, RadialBar, Legend,
  PieChart, Pie, Cell
} from 'recharts';
import { getDashboard } from '../services/api';
import {
  Users, TrendingUp, CheckCircle2, DollarSign,
  Package, Plus, BarChart3, Inbox
} from 'lucide-react';

const COLORS = ['#F2641E','#2563EB','#16A34A','#7C3AED','#CA8A04','#DC2626','#0891B2'];

const PIPELINE_STAGES = [
  { id: 'new',         label: 'Nuevos',      color: '#2563EB' },
  { id: 'contacted',   label: 'Contactados', color: '#7C3AED' },
  { id: 'qualified',   label: 'Calificados', color: '#CA8A04' },
  { id: 'proposal',    label: 'Propuesta',   color: '#F2641E' },
  { id: 'negotiation', label: 'Negociación', color: '#EA580C' },
  { id: 'closed_won',  label: 'Ganados',     color: '#16A34A' },
  { id: 'closed_lost', label: 'Perdidos',    color: '#DC2626' },
];

const FunnelTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff', border: '1px solid #E3E6EA', borderRadius: 10,
      padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,.1)', fontSize: 12,
    }}>
      <div style={{ fontWeight: 700, color: '#0B2545', marginBottom: 4 }}>{payload[0].payload.label}</div>
      <div style={{ color: payload[0].color, fontWeight: 600 }}>
        {payload[0].value} leads · ${(payload[0].payload.value / 1000).toFixed(0)}K
      </div>
    </div>
  );
};

// Empty state for charts
function ChartEmpty({ message = 'Sin datos aún' }) {
  return (
    <div style={{
      height: 180, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 10, color: 'var(--gray-400)',
    }}>
      <Inbox size={36} strokeWidth={1.25} style={{ opacity: .4 }} />
      <span style={{ fontSize: 12 }}>{message}</span>
    </div>
  );
}

export default function Dashboard({ user, onNavigate }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboard()
      .then(r => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats    = data?.summary  || { totalLeads: 0, activeDeals: 0, closedWon: 0, pipelineValue: 0 };
  const pipeline = data?.byStage  || [];
  const sourceData = data?.bySource || [];

  if (loading) return <div className="loading"><div className="spinner" />Cargando dashboard...</div>;

  const maxCount = Math.max(...PIPELINE_STAGES.map(s => pipeline.find(p => p._id === s.id)?.count || 0), 1);
  const hasData  = pipeline.some(p => p.count > 0);

  // Build funnel data for bar chart (count + value per stage)
  const funnelData = PIPELINE_STAGES.map(s => {
    const found = pipeline.find(p => p._id === s.id) || {};
    return {
      label: s.label,
      count: found.count || 0,
      value: found.totalValue || 0,
      color: s.color,
    };
  });

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">
            Bienvenido, {user?.name} · {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('leads')}>
            <Plus size={14} /> Nuevo Lead
          </button>
          <button className="btn btn-navy btn-sm" onClick={() => onNavigate('operations')}>
            <Package size={14} /> Nueva Operación
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate('reports')}>
            <BarChart3 size={14} /> Reportes
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Leads',    value: stats.totalLeads    || 0, sub: 'Pipeline activo',    Icon: Users,        color: '#F2641E' },
          { label: 'Deals Activos',  value: stats.activeDeals   || 0, sub: 'En proceso',          Icon: TrendingUp,   color: '#2563EB' },
          { label: 'Ganados',        value: stats.closedWon     || 0, sub: 'Cerrados con éxito',  Icon: CheckCircle2, color: '#16A34A' },
          { label: 'Valor Pipeline', value: `$${((stats.pipelineValue || 0) / 1000).toFixed(0)}K`, sub: 'USD estimado', Icon: DollarSign, color: '#0B2545' },
        ].map(({ label, value, sub, Icon, color }) => (
          <div key={label} className="stat-card">
            <div className="stat-icon" style={{ background: `${color}14`, color }}>
              <Icon size={18} strokeWidth={1.75} />
            </div>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
            <div className="stat-delta">{sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Pipeline por etapa — barras horizontales */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16, color: 'var(--navy-900)', fontSize: 14 }}>
            Pipeline por Etapa
          </div>
          {PIPELINE_STAGES.map(s => {
            const count = pipeline.find(p => p._id === s.id)?.count || 0;
            return (
              <div key={s.id} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--gray-500)' }}>{s.label}</span>
                  <span style={{ fontWeight: 700, color: s.color }}>{count}</span>
                </div>
                <div style={{ height: 6, background: 'var(--gray-100)', borderRadius: 3 }}>
                  <div style={{
                    height: '100%',
                    width: `${(count / maxCount) * 100}%`,
                    background: s.color,
                    borderRadius: 3,
                    transition: 'width .6s ease',
                    minWidth: count > 0 ? 6 : 0,
                  }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Valor por etapa — Bar chart */}
        <div className="card">
          <div style={{ fontWeight: 700, color: 'var(--navy-900)', fontSize: 14, marginBottom: 4 }}>
            Leads por Etapa
          </div>
          <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 14 }}>
            Cantidad de prospectos en cada fase
          </div>

          {hasData ? (
            <ResponsiveContainer width="100%" height={190}>
              <BarChart
                data={funnelData}
                margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#9AA3AE', fontSize: 9 }}
                  axisLine={false} tickLine={false}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={42}
                />
                <YAxis
                  tick={{ fill: '#9AA3AE', fontSize: 11 }}
                  axisLine={false} tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<FunnelTooltip />} cursor={{ fill: 'rgba(242,100,30,.06)' }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {funnelData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty message="Agrega tu primer lead para ver la distribución" />
          )}
        </div>
      </div>

      {/* Fuentes */}
      {sourceData.length > 0 ? (
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16, color: 'var(--navy-900)', fontSize: 14 }}>
            Leads por Fuente
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 40, flexWrap: 'wrap' }}>
            <ResponsiveContainer width={170} height={170}>
              <PieChart>
                <Pie
                  data={sourceData} dataKey="count" nameKey="_id"
                  cx="50%" cy="50%" outerRadius={78} innerRadius={48} paddingAngle={2}
                >
                  {sourceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              {sourceData.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                  <span style={{ color: 'var(--gray-500)', flex: 1, textTransform: 'capitalize' }}>{s._id || 'Otro'}</span>
                  <span style={{ fontWeight: 700, color: 'var(--gray-900)' }}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <BarChart3 size={40} />
            <p>Aún no hay datos para mostrar. Comienza agregando leads al sistema.</p>
            <button className="btn btn-primary btn-sm" onClick={() => onNavigate('leads')}>
              <Plus size={13} /> Agregar primer lead
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
