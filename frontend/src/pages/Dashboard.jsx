import React, { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { getDashboard } from '../services/api';
import { StageBadge } from '../components/Badges';

const COLORS = ['#F07B1A', '#3B82F6', '#22C55E', '#A855F7', '#EAB308', '#EF4444', '#06B6D4'];

const PIPELINE_STAGES = [
  { id: 'new', label: 'Nuevos', color: '#3B82F6' },
  { id: 'contacted', label: 'Contactados', color: '#A855F7' },
  { id: 'qualified', label: 'Calificados', color: '#EAB308' },
  { id: 'proposal', label: 'Propuesta', color: '#F07B1A' },
  { id: 'negotiation', label: 'Negociación', color: '#FB923C' },
  { id: 'closed_won', label: 'Ganados', color: '#22C55E' },
  { id: 'closed_lost', label: 'Perdidos', color: '#EF4444' },
];

export default function Dashboard({ user, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboard()
      .then(r => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // La API devuelve summary, byStage, bySource, recentActivities
  const stats = data?.summary || { totalLeads: 0, activeDeals: 0, closedWon: 0, pipelineValue: 0 };
  const pipeline = data?.byStage || [];
  const sourceData = data?.bySource || [];
  const trendData = data?.monthlyTrend || [
    { mes: 'Oct', leads: 12 }, { mes: 'Nov', leads: 18 }, { mes: 'Dic', leads: 14 },
    { mes: 'Ene', leads: 22 }, { mes: 'Feb', leads: 19 }, { mes: 'Mar', leads: 28 },
  ];

  if (loading) return <div className="loading"><div className="spinner" />Cargando dashboard...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Bienvenido, {user?.name} · {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('leads')}>+ Nuevo Lead</button>
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate('reports')}>📊 Reportes</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="stats-grid">
        <div className="stat-card orange">
          <div className="stat-label">Total Leads</div>
          <div className="stat-value orange">{stats.totalLeads || 0}</div>
          <div className="stat-delta up">↑ Pipeline activo</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Deals Activos</div>
          <div className="stat-value green">{stats.activeDeals || 0}</div>
          <div className="stat-delta">En proceso</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">Ganados</div>
          <div className="stat-value blue">{stats.closedWon || 0}</div>
          <div className="stat-delta up">Cerrados con éxito</div>
        </div>
        <div className="stat-card purple">
          <div className="stat-label">Valor Pipeline</div>
          <div className="stat-value purple">${((stats.pipelineValue || 0) / 1000).toFixed(0)}K</div>
          <div className="stat-delta">USD estimado</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Pipeline */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16 }}>Pipeline por Etapa</div>
          {PIPELINE_STAGES.map(s => {
            const count = pipeline.find(p => p._id === s.id)?.count || 0;
            const max = Math.max(...PIPELINE_STAGES.map(st => pipeline.find(p => p._id === st.id)?.count || 1), 1);
            return (
              <div key={s.id} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text2)' }}>{s.label}</span>
                  <span style={{ fontWeight: 600, color: s.color }}>{count}</span>
                </div>
                <div style={{ height: 6, background: 'var(--dark4)', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${(count / max) * 100}%`, background: s.color, borderRadius: 3, transition: 'width .5s' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Tendencia */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16 }}>Leads por Mes</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData}>
              <XAxis dataKey="mes" tick={{ fill: 'var(--text3)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text3)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'var(--dark3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="leads" stroke="var(--orange)" strokeWidth={2.5} dot={{ fill: 'var(--orange)', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Fuentes */}
      {sourceData.length > 0 && (
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16 }}>Leads por Fuente</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie data={sourceData} dataKey="count" nameKey="_id" cx="50%" cy="50%" outerRadius={80} innerRadius={50}>
                  {sourceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sourceData.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length] }} />
                  <span style={{ color: 'var(--text2)' }}>{s._id}</span>
                  <span style={{ fontWeight: 600, marginLeft: 'auto' }}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
