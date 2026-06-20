import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell
} from 'recharts';
import { getDashboard } from '../services/api';
import { StageBadge } from '../components/Badges';
import { Users, TrendingUp, CheckCircle2, DollarSign, Package, Plus, BarChart3, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const COLORS = ['#F2641E', '#2563EB', '#16A34A', '#7C3AED', '#CA8A04', '#DC2626', '#0891B2'];

const PIPELINE_STAGES = [
  { id: 'new',         label: 'Nuevos',      color: '#2563EB' },
  { id: 'contacted',   label: 'Contactados', color: '#7C3AED' },
  { id: 'qualified',   label: 'Calificados', color: '#CA8A04' },
  { id: 'proposal',    label: 'Propuesta',   color: '#F2641E' },
  { id: 'negotiation', label: 'Negociación', color: '#EA580C' },
  { id: 'closed_won',  label: 'Ganados',     color: '#16A34A' },
  { id: 'closed_lost', label: 'Perdidos',    color: '#DC2626' },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff', border: '1px solid #E3E6EA', borderRadius: 10,
      padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,.1)', fontSize: 12,
    }}>
      <div style={{ fontWeight: 700, color: '#0B2545', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>
          {p.value} leads
        </div>
      ))}
    </div>
  );
};

export default function Dashboard({ user, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboard()
      .then(r => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats = data?.summary || { totalLeads: 0, activeDeals: 0, closedWon: 0, pipelineValue: 0 };
  const pipeline = data?.byStage || [];
  const sourceData = data?.bySource || [];
  const trendData = data?.monthlyTrend?.length ? data.monthlyTrend : [
    { mes: 'Ene', leads: 8 }, { mes: 'Feb', leads: 14 }, { mes: 'Mar', leads: 19 },
    { mes: 'Abr', leads: 22 }, { mes: 'May', leads: 17 }, { mes: 'Jun', leads: 28 },
  ];

  if (loading) return <div className="loading"><div className="spinner" />Cargando dashboard...</div>;

  const maxPipeline = Math.max(...PIPELINE_STAGES.map(s => pipeline.find(p => p._id === s.id)?.count || 0), 1);

  // Compute trend delta (last 2 months)
  const lastVal = trendData[trendData.length - 1]?.leads || 0;
  const prevVal = trendData[trendData.length - 2]?.leads || 0;
  const trendDelta = prevVal ? Math.round(((lastVal - prevVal) / prevVal) * 100) : 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">
            Bienvenido, {user?.name} · {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('leads')} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Plus size={14} /> Nuevo Lead
          </button>
          <button className="btn btn-navy btn-sm" onClick={() => onNavigate('operations')} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Package size={14} /> Nueva Operación
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate('reports')} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <BarChart3 size={14} /> Reportes
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Leads', value: stats.totalLeads || 0, delta: 'Pipeline activo', up: true, Icon: Users, color: '#F2641E' },
          { label: 'Deals Activos', value: stats.activeDeals || 0, delta: 'En proceso', up: false, Icon: TrendingUp, color: '#2563EB' },
          { label: 'Ganados', value: stats.closedWon || 0, delta: 'Cerrados con éxito', up: true, Icon: CheckCircle2, color: '#16A34A' },
          { label: 'Valor Pipeline', value: `$${((stats.pipelineValue || 0) / 1000).toFixed(0)}K`, delta: 'USD estimado', up: true, Icon: DollarSign, color: '#0B2545' },
        ].map(({ label, value, delta, up, Icon, color }) => (
          <div key={label} className="stat-card">
            <div className="stat-icon" style={{ background: `${color}14`, color }}>
              <Icon size={18} strokeWidth={1.75} />
            </div>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
            <div className={`stat-delta ${up ? 'up' : ''}`}>{delta}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Pipeline por etapa */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16, color: 'var(--navy-900)', fontSize: 14 }}>Pipeline por Etapa</div>
          {PIPELINE_STAGES.map(s => {
            const count = pipeline.find(p => p._id === s.id)?.count || 0;
            return (
              <div key={s.id} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--gray-500)' }}>{s.label}</span>
                  <span style={{ fontWeight: 700, color: s.color }}>{count}</span>
                </div>
                <div style={{ height: 6, background: 'var(--gray-100)', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${(count / maxPipeline) * 100}%`, background: s.color, borderRadius: 3, transition: 'width .6s' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Tendencia mensual — Area chart with gradient */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
            <div style={{ fontWeight: 700, color: 'var(--navy-900)', fontSize: 14 }}>Leads por Mes</div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700,
              color: trendDelta >= 0 ? '#16A34A' : '#DC2626',
              background: trendDelta >= 0 ? '#DCFCE7' : '#FEE2E2',
              padding: '3px 8px', borderRadius: 20,
            }}>
              {trendDelta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {Math.abs(trendDelta)}% vs mes anterior
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#0B2545', marginBottom: 2 }}>{lastVal}</div>
          <div style={{ fontSize: 11, color: '#9AA3AE', marginBottom: 14 }}>leads este mes</div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F2641E" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#F2641E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F3" vertical={false} />
              <XAxis dataKey="mes" tick={{ fill: '#9AA3AE', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9AA3AE', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone" dataKey="leads"
                stroke="#F2641E" strokeWidth={2.5}
                fill="url(#dashGrad)"
                dot={{ fill: '#F2641E', r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, strokeWidth: 0, fill: '#F2641E' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Fuentes */}
      {sourceData.length > 0 && (
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16, color: 'var(--navy-900)', fontSize: 14 }}>Leads por Fuente</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
            <ResponsiveContainer width={170} height={170}>
              <PieChart>
                <Pie data={sourceData} dataKey="count" nameKey="_id" cx="50%" cy="50%" outerRadius={78} innerRadius={48} paddingAngle={2}>
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
      )}

      {sourceData.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <BarChart3 size={40} />
            <p>Aún no hay suficientes datos para mostrar la distribución por fuente.</p>
            <button className="btn btn-primary btn-sm" onClick={() => onNavigate('leads')}>
              <Plus size={13} /> Agregar primer lead
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
