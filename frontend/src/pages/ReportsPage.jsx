import React, { useEffect, useState } from 'react';
import { getDashboard, getTeamReport, getConversionReport, exportCSV, rescoreAllLeads } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, FunnelChart, Funnel, LabelList } from 'recharts';

const STAGE_LABELS = {
  new: 'Nuevos', contacted: 'Contactados', qualified: 'Calificados',
  proposal: 'Propuesta', negotiation: 'Negociación',
  closed_won: 'Ganados', closed_lost: 'Perdidos'
};
const STAGE_COLORS = {
  new: '#3B82F6', contacted: '#A855F7', qualified: '#EAB308',
  proposal: '#F07B1A', negotiation: '#FB923C',
  closed_won: '#22C55E', closed_lost: '#EF4444'
};

export default function ReportsPage({ toast, user }) {
  const [data, setData]         = useState(null);
  const [team, setTeam]         = useState([]);
  const [conv, setConv]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [rescoring, setRescoring] = useState(false);
  const [tab, setTab]           = useState('overview');

  useEffect(() => {
    const requests = [getDashboard()];
    if (user?.role === 'admin') {
      requests.push(getTeamReport(), getConversionReport());
    }
    Promise.all(requests)
      .then(([r1, r2, r3]) => {
        setData(r1.data.data);
        if (r2) setTeam(r2.data.data || []);
        if (r3) setConv(r3.data.data);
      })
      .catch(() => toast('Error al cargar reportes', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const handleExport = async () => {
    try {
      const r = await exportCSV();
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `acon_leads_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      toast('CSV descargado', 'success');
    } catch { toast('Error al exportar', 'error'); }
  };

  const handleRescore = async () => {
    try {
      setRescoring(true);
      const r = await rescoreAllLeads();
      toast(`Rescoring iniciado: ${r.data.count} leads`, 'success');
    } catch { toast('Error al rescorear', 'error'); }
    finally { setRescoring(false); }
  };

  if (loading) return <div className="loading"><div className="spinner" />Cargando reportes...</div>;

  const stats    = data?.summary || {};
  const pipeline = data?.byStage || [];
  const teamStats = data?.teamStats || [];

  const tabs = [
    { id: 'overview', label: 'Resumen' },
    ...(user?.role === 'admin' ? [
      { id: 'conversion', label: 'Conversión' },
      { id: 'team', label: 'Equipo' },
    ] : []),
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Reportes</div>
          <div className="page-sub">KPIs y análisis del equipo</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {user?.role === 'admin' && (
            <button className="btn btn-ghost btn-sm" onClick={handleRescore} disabled={rescoring}>
              {rescoring ? '⏳ Rescorando...' : '🤖 Rescorear leads'}
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={handleExport}>📥 Exportar CSV</button>
        </div>
      </div>

      {/* Tabs */}
      {tabs.length > 1 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: 'transparent',
                color: tab === t.id ? 'var(--orange)' : 'var(--text3)',
                borderBottom: tab === t.id ? '2px solid var(--orange)' : '2px solid transparent',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* TAB: OVERVIEW */}
      {tab === 'overview' && (
        <>
          <div className="stats-grid">
            <div className="stat-card orange">
              <div className="stat-label">Total Leads</div>
              <div className="stat-value orange">{stats.totalLeads || 0}</div>
            </div>
            <div className="stat-card green">
              <div className="stat-label">Ganados</div>
              <div className="stat-value green">{stats.closedWon || 0}</div>
            </div>
            <div className="stat-card blue">
              <div className="stat-label">Deals Activos</div>
              <div className="stat-value blue">{stats.activeDeals || 0}</div>
            </div>
            <div className="stat-card purple">
              <div className="stat-label">Valor Pipeline</div>
              <div className="stat-value purple">${((stats.pipelineValue || 0) / 1000).toFixed(0)}K</div>
            </div>
          </div>

          {pipeline.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 16 }}>Leads por Etapa</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={pipeline.map(p => ({ ...p, name: STAGE_LABELS[p._id] || p._id }))}>
                  <XAxis dataKey="name" tick={{ fill: 'var(--text3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--dark3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="count" fill="var(--orange)" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* TAB: CONVERSION */}
      {tab === 'conversion' && conv && (
        <>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="stat-card green">
              <div className="stat-label">Win Rate</div>
              <div className="stat-value green">{conv.winRate}%</div>
            </div>
            <div className="stat-card blue">
              <div className="stat-label">Total Cerrados</div>
              <div className="stat-value blue">{conv.won + conv.lost}</div>
            </div>
            <div className="stat-card orange">
              <div className="stat-label">Total Perdidos</div>
              <div className="stat-value orange">{conv.lost}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 16 }}>Funnel de Conversión</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {conv.funnel?.map(f => (
                <div key={f.stage}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text2)' }}>{STAGE_LABELS[f.stage] || f.stage}</span>
                    <span style={{ display: 'flex', gap: 16 }}>
                      <span style={{ color: 'var(--text3)' }}>{f.count} leads</span>
                      <span style={{ fontWeight: 700, color: STAGE_COLORS[f.stage] || 'var(--orange)' }}>{f.pct}%</span>
                      <span style={{ color: 'var(--green)', fontSize: 11 }}>${((f.value || 0)/1000).toFixed(0)}K</span>
                    </span>
                  </div>
                  <div style={{ height: 8, background: 'var(--dark4)', borderRadius: 4 }}>
                    <div style={{
                      height: '100%',
                      width: `${f.pct}%`,
                      background: STAGE_COLORS[f.stage] || 'var(--orange)',
                      borderRadius: 4,
                      transition: 'width .5s'
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {conv.timeInStage?.length > 0 && (
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 14 }}>Tiempo Promedio por Etapa</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Etapa','Días promedio','Transiciones'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text3)', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {conv.timeInStage.map(t => (
                    <tr key={t.stage}>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>{STAGE_LABELS[t.stage] || t.stage}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--orange)', fontWeight: 600 }}>{t.avgDays}d</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text3)' }}>{t.transitions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* TAB: TEAM */}
      {tab === 'team' && (
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 14 }}>Performance del Equipo</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Ejecutivo','Leads','Ganados','Perdidos','Win Rate','Pipeline','Actividad'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {team.map(t => (
                <tr key={t.executive?._id}>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{t.executive?.name}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>{t.stats?.totalLeads}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--green)' }}>{t.stats?.closedWon || 0}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--red, #EF4444)' }}>{t.stats?.closedLost || 0}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', color: t.stats?.winRate >= 50 ? 'var(--green)' : 'var(--orange)', fontWeight: 600 }}>{t.stats?.winRate || 0}%</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--orange)', fontWeight: 600 }}>${((t.stats?.activePipeline || 0)/1000).toFixed(0)}K</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text3)' }}>{t.stats?.activitiesThisWeek || 0} esta semana</td>
                </tr>
              ))}
              {team.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text3)' }}>No hay ejecutivos registrados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
