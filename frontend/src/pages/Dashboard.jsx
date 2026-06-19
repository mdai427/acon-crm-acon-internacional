import React, { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { getDashboard, getOperationsSummary } from '../services/api';
import { StageBadge } from '../components/Badges';
import { Users, TrendingUp, CheckCircle2, DollarSign, Package, Plus, BarChart3, Ship, Truck, Clock } from 'lucide-react';

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

const KPI_TOOLTIP = {
  contentStyle: {
    background: '#fff',
    border: '1px solid #E3E6EA',
    borderRadius: 8,
    fontSize: 12,
    boxShadow: '0 4px 12px rgba(0,0,0,.08)',
    color: '#1A1F2E',
  },
  cursor: { fill: 'rgba(242,100,30,.06)' }
};

export default function Dashboard({ user, onNavigate }) {
  const [data, setData] = useState(null);
  const [opsData, setOpsData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getDashboard().then(r => setData(r.data.data)).catch(() => {}),
      getOperationsSummary().then(r => setOpsData(r.data.data)).catch(() => {})
    ]).finally(() => setLoading(false));
  }, []);

  const stats = data?.summary || { totalLeads: 0, activeDeals: 0, closedWon: 0, pipelineValue: 0 };
  const pipeline = data?.byStage || [];
  const sourceData = data?.bySource || [];
  const trendData = data?.monthlyTrend || [
    { mes: 'Ene', leads: 8 }, { mes: 'Feb', leads: 14 }, { mes: 'Mar', leads: 19 },
    { mes: 'Abr', leads: 22 }, { mes: 'May', leads: 17 }, { mes: 'Jun', leads: 28 },
  ];

  if (loading) return <div className="loading"><div className="spinner" />Cargando dashboard...</div>;

  const maxPipeline = Math.max(...PIPELINE_STAGES.map(s => pipeline.find(p => p._id === s.id)?.count || 0), 1);

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
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon orange"><Users size={18} /></div>
          <div className="stat-label">Total Leads</div>
          <div className="stat-value">{stats.totalLeads || 0}</div>
          <div className="stat-delta up">Pipeline activo</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><TrendingUp size={18} /></div>
          <div className="stat-label">Deals Activos</div>
          <div className="stat-value">{stats.activeDeals || 0}</div>
          <div className="stat-delta">En proceso</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><CheckCircle2 size={18} /></div>
          <div className="stat-label">Ganados</div>
          <div className="stat-value">{stats.closedWon || 0}</div>
          <div className="stat-delta up">Cerrados con éxito</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon navy"><DollarSign size={18} /></div>
          <div className="stat-label">Valor Pipeline</div>
          <div className="stat-value">${((stats.pipelineValue || 0) / 1000).toFixed(0)}K</div>
          <div className="stat-delta">USD estimado</div>
        </div>
      </div>

      {/* Operations KPIs */}
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-icon navy"><Ship size={18} /></div>
          <div className="stat-label">Total Operaciones</div>
          <div className="stat-value">{opsData?.total || 0}</div>
          <div className="stat-delta">Embarques activos</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><Truck size={18} /></div>
          <div className="stat-label">En Tránsito</div>
          <div className="stat-value">{opsData?.inTransit || 0}</div>
          <div className="stat-delta">Departido / Aduana</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><CheckCircle2 size={18} /></div>
          <div className="stat-label">Entregados</div>
          <div className="stat-value">{opsData?.delivered || 0}</div>
          <div className="stat-delta up">Completados</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('operations')}>
          <div className="stat-icon blue"><Clock size={18} /></div>
          <div className="stat-label">Ver Operaciones</div>
          <div className="stat-value" style={{ fontSize: 16 }}>→</div>
          <div className="stat-delta">Ir al módulo</div>
        </div>
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
                <div style={{ height: 5, background: 'var(--gray-100)', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${(count / maxPipeline) * 100}%`, background: s.color, borderRadius: 3, transition: 'width .6s' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Tendencia mensual */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16, color: 'var(--navy-900)', fontSize: 14 }}>Leads por Mes</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData}>
              <XAxis dataKey="mes" tick={{ fill: 'var(--gray-400)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--gray-400)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip {...KPI_TOOLTIP} />
              <Line type="monotone" dataKey="leads" stroke="var(--orange-500)" strokeWidth={2.5} dot={{ fill: 'var(--orange-500)', r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} />
            </LineChart>
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
                <Tooltip {...KPI_TOOLTIP} />
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
