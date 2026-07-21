import React, { useState, useEffect } from 'react';
import { getDireccionReport } from '../services/api';
import { TrendingUp, TrendingDown, DollarSign, Users, AlertTriangle, Clock, Target, BarChart2, RefreshCw } from 'lucide-react';

const STAGE_LABELS = { new:'Nuevo', contacted:'Contactado', qualified:'Calificado', proposal:'Propuesta', negotiation:'Negociación', closed_won:'Ganado', closed_lost:'Perdido' };
const STAGE_COLOR  = { new:'#6B7280', contacted:'#2563EB', qualified:'#7C3AED', proposal:'#D97706', negotiation:'#EA580C', closed_won:'#16A34A', closed_lost:'#DC2626' };

function KpiCard({ label, value, prev, suffix = '', icon: Icon, color = 'var(--blue)', format = 'number' }) {
  const numVal = Number(value) || 0;
  const numPrev = Number(prev) || 0;
  const pct = numPrev > 0 ? Math.round(((numVal - numPrev) / numPrev) * 100) : null;
  const up = pct !== null && pct >= 0;
  const fmtVal = format === 'usd'
    ? `$${numVal >= 1000 ? (numVal / 1000).toFixed(1) + 'k' : numVal.toLocaleString()}`
    : numVal.toLocaleString();

  return (
    <div className="card card-sm" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600 }}>{label}</div>
        {Icon && <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={14} style={{ color }} />
        </div>}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>
        {fmtVal}{suffix}
      </div>
      {pct !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          {up ? <TrendingUp size={12} style={{ color: '#16A34A' }} /> : <TrendingDown size={12} style={{ color: '#DC2626' }} />}
          <span style={{ color: up ? '#16A34A' : '#DC2626', fontWeight: 600 }}>{up ? '+' : ''}{pct}%</span>
          <span style={{ color: 'var(--text3)' }}>vs mes anterior</span>
        </div>
      )}
    </div>
  );
}

export default function DireccionPage({ toast, onSelectLead }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await getDireccionReport();
      setData(r.data.data);
    } catch (e) {
      toast(e.response?.data?.message || 'Error al cargar dashboard', 'error');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="loading"><div className="spinner" />Cargando dashboard dirección...</div>;
  if (!data) return null;

  const { kpis, forecast, pipelineByStage, quotesByStatus, inactiveLeads, expiredOpportunities, revenueByExec, leadsByExec } = data;
  const totalPipeline = pipelineByStage.reduce((s, r) => s + r.value, 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard Dirección</div>
          <div className="page-sub">Vista estratégica — forecast, objetivos y alertas de negocio</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /> Actualizar</button>
      </div>

      {/* ── Forecast Banner ── */}
      <div style={{ background: 'linear-gradient(135deg, var(--navy-900) 0%, #1e3a5f 100%)', borderRadius: 14, padding: '20px 24px', marginBottom: 20, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: '#93c5fd', fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>FORECAST MENSUAL (PROYECCIÓN)</div>
          <div style={{ fontSize: 36, fontWeight: 900, lineHeight: 1 }}>
            ${forecast.month >= 1000 ? (forecast.month / 1000).toFixed(0) + 'k' : forecast.month.toLocaleString()} USD
          </div>
          <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 6 }}>
            Basado en {forecast.daysElapsed} días transcurridos de {forecast.daysInMonth} · Revenue real: ${(kpis.wonThisMonth.value || 0).toLocaleString()} USD
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>${(kpis.wonThisQ.value || 0) >= 1000 ? ((kpis.wonThisQ.value || 0) / 1000).toFixed(0) + 'k' : (kpis.wonThisQ.value || 0).toLocaleString()}</div>
            <div style={{ fontSize: 11, color: '#93c5fd' }}>Revenue Trimestre</div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>${(kpis.wonThisYear.value || 0) >= 1000 ? ((kpis.wonThisYear.value || 0) / 1000).toFixed(0) + 'k' : (kpis.wonThisYear.value || 0).toLocaleString()}</div>
            <div style={{ fontSize: 11, color: '#93c5fd' }}>Revenue Anual</div>
          </div>
        </div>
      </div>

      {/* ── KPI Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Revenue este mes" value={kpis.wonThisMonth.value} prev={kpis.wonLastMonth.value} icon={DollarSign} color="var(--green)" format="usd" />
        <KpiCard label="Pipeline activo" value={kpis.activePipeline.value} icon={Target} color="var(--blue)" format="usd" />
        <KpiCard label="Nuevos leads (mes)" value={kpis.newLeadsMonth.current} prev={kpis.newLeadsMonth.previous} icon={Users} color="var(--purple)" />
        <KpiCard label="Tareas vencidas" value={kpis.overdueTasks} icon={Clock} color="var(--red)" />
      </div>

      {/* ── Alert Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Clientes inactivos */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} style={{ color: '#D97706' }} />
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Clientes Inactivos</span>
              <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12 }}>{inactiveLeads.length}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Sin contacto &gt;14 días</div>
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {inactiveLeads.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Sin clientes inactivos</div>
            ) : inactiveLeads.map(l => {
              const daysSince = l.lastContactDate
                ? Math.floor((Date.now() - new Date(l.lastContactDate)) / 86400000)
                : Math.floor((Date.now() - new Date(l.createdAt)) / 86400000);
              return (
                <div key={l._id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: onSelectLead ? 'pointer' : 'default' }}
                  onClick={() => onSelectLead && onSelectLead(l._id)}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{l.company}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{l.assignedTo?.name || 'Sin asignar'} · {STAGE_LABELS[l.stage] || l.stage}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: daysSince > 30 ? '#DC2626' : '#D97706' }}>{daysSince}d</div>
                    {l.value > 0 && <div style={{ fontSize: 11, color: 'var(--text3)' }}>${l.value.toLocaleString()}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Oportunidades vencidas */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} style={{ color: '#DC2626' }} />
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Oportunidades Vencidas</span>
              <span style={{ background: '#FEE2E2', color: '#991B1B', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12 }}>{expiredOpportunities.length}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>&gt;30 días en propuesta/negociación</div>
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {expiredOpportunities.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Sin oportunidades vencidas</div>
            ) : expiredOpportunities.map(l => {
              const stalled = Math.floor((Date.now() - new Date(l.updatedAt)) / 86400000);
              return (
                <div key={l._id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: onSelectLead ? 'pointer' : 'default' }}
                  onClick={() => onSelectLead && onSelectLead(l._id)}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{l.company}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{l.assignedTo?.name || 'Sin asignar'} · {STAGE_LABELS[l.stage] || l.stage}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#DC2626' }}>{stalled}d estancada</div>
                    {l.value > 0 && <div style={{ fontSize: 11, color: 'var(--text3)' }}>${l.value.toLocaleString()}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Pipeline & Revenue Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Pipeline por etapa */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Pipeline por Etapa</div>
          {pipelineByStage.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: 20 }}>Sin datos</div>
          ) : pipelineByStage.map(r => {
            const pct = totalPipeline > 0 ? Math.round((r.value / totalPipeline) * 100) : 0;
            return (
              <div key={r._id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: STAGE_COLOR[r._id] || 'var(--text)' }}>{STAGE_LABELS[r._id] || r._id}</span>
                  <span style={{ color: 'var(--text2)' }}>{r.count} leads · ${(r.value || 0).toLocaleString()}</span>
                </div>
                <div style={{ height: 6, background: 'var(--gray-100)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: STAGE_COLOR[r._id] || 'var(--blue)', borderRadius: 3, transition: 'width .4s' }} />
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
            <span style={{ color: 'var(--text3)' }}>Total pipeline</span>
            <span style={{ color: 'var(--text)' }}>${totalPipeline.toLocaleString()} USD</span>
          </div>
        </div>

        {/* Revenue por ejecutivo */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Revenue por Ejecutivo (Año)</div>
          {revenueByExec.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: 20 }}>Sin deals cerrados este año</div>
          ) : revenueByExec.map((r, i) => {
            const maxVal = revenueByExec[0]?.value || 1;
            const pct = Math.round((r.value / maxVal) * 100);
            return (
              <div key={r._id || i} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{r.name}</span>
                  <span style={{ color: 'var(--text2)' }}>{r.count} deals · ${(r.value || 0).toLocaleString()}</span>
                </div>
                <div style={{ height: 6, background: 'var(--gray-100)', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'var(--orange)', borderRadius: 3, transition: 'width .4s' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Leads por ejecutivo ── */}
      <div className="card">
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Pipeline Activo por Ejecutivo</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
              {['Ejecutivo', 'Leads activos', 'Valor pipeline'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--text3)', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leadsByExec.length === 0 ? (
              <tr><td colSpan={3} style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>Sin datos</td></tr>
            ) : leadsByExec.map((r, i) => (
              <tr key={r._id || i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text)' }}>{r.name}</td>
                <td style={{ padding: '10px 12px', color: 'var(--text2)' }}>{r.count}</td>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--blue)' }}>${(r.pipelineValue || 0).toLocaleString()} USD</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
