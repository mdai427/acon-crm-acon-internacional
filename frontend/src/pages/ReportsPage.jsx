import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { getDashboard, getTeamReport, getConversionReport, exportCSV, rescoreAllLeads, getOperationsReport } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  FileDown, FileSpreadsheet, RefreshCw, TrendingUp, Users,
  CheckCircle2, DollarSign, Target, Award, BarChart3, AlertTriangle
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────
const STAGE_LABELS = {
  new: 'Nuevos', contacted: 'Contactados', qualified: 'Calificados',
  proposal: 'Propuesta', negotiation: 'Negociación',
  closed_won: 'Ganados', closed_lost: 'Perdidos'
};
const STAGE_COLORS = {
  new: '#2563EB', contacted: '#7C3AED', qualified: '#CA8A04',
  proposal: '#F2641E', negotiation: '#EA580C',
  closed_won: '#16A34A', closed_lost: '#DC2626'
};
const PALETTE = ['#F2641E','#2563EB','#16A34A','#7C3AED','#CA8A04','#DC2626','#0891B2','#DB2777'];

const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#fff', border: '1px solid #E3E6EA', borderRadius: 10,
    fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,.1)', color: '#1A1F2E', padding: '10px 14px'
  },
  cursor: { fill: 'rgba(242,100,30,.06)' }
};

// ── Custom Tooltip ─────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label, prefix = '', suffix = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #E3E6EA', borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,.1)', fontSize: 12 }}>
      <div style={{ fontWeight: 700, color: '#0B2545', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, color: p.color || '#1A1F2E' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
          <span style={{ color: '#5A6472' }}>{p.name}:</span>
          <span style={{ fontWeight: 700 }}>{prefix}{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}{suffix}</span>
        </div>
      ))}
    </div>
  );
};

// ── KPI Card ──────────────────────────────────────────────────────────────
function KpiCard({ label, value, delta, deltaUp, Icon, color }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: `${color}18`, color }}>
        <Icon size={18} strokeWidth={1.75} />
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {delta && <div className={`stat-delta ${deltaUp ? 'up' : ''}`}>{delta}</div>}
    </div>
  );
}

// ── Tab button ─────────────────────────────────────────────────────────────
function Tab({ id, label, active, onClick }) {
  return (
    <button onClick={() => onClick(id)} style={{
      padding: '9px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
      background: 'transparent', color: active ? 'var(--navy-900)' : 'var(--gray-400)',
      borderBottom: active ? '2px solid var(--orange-500)' : '2px solid transparent',
      transition: 'all .15s'
    }}>{label}</button>
  );
}

// ── PDF export ─────────────────────────────────────────────────────────────
async function exportToPDF(reportRef, filename) {
  const { default: html2canvas } = await import('html2canvas');
  const { jsPDF } = await import('jspdf');

  const canvas = await html2canvas(reportRef, {
    scale: 2, useCORS: true, backgroundColor: '#F4F5F7', logging: false
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = (canvas.height * pdfW) / canvas.width;

  let position = 0;
  const pageH = pdf.internal.pageSize.getHeight();

  // Add pages if content is taller than one page
  while (position < pdfH) {
    if (position > 0) pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, -position, pdfW, pdfH);
    position += pageH;
  }

  pdf.save(filename);
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function ReportsPage({ toast }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const reportRef = useRef(null);

  const [data, setData]       = useState(null);
  const [team, setTeam]       = useState([]);
  const [conv, setConv]       = useState(null);
  const [opsReport, setOpsReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rescoring, setRescoring] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [tab, setTab]         = useState('overview');

  const load = useCallback(() => {
    setLoading(true);
    const reqs = [getDashboard(), getOperationsReport()];
    if (isAdmin) reqs.push(getTeamReport(), getConversionReport());
    Promise.all(reqs)
      .then(([r1, rOps, r2, r3]) => {
        setData(r1.data.data);
        setOpsReport(rOps.data.data);
        if (r2) setTeam(r2.data.data || []);
        if (r3) setConv(r3.data.data);
      })
      .catch(() => toast('Error al cargar reportes', 'error'))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const handleExportCSV = async () => {
    try {
      const r = await exportCSV();
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `acon_leads_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      toast('CSV descargado', 'success');
    } catch { toast('Error al exportar', 'error'); }
  };

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      await exportToPDF(reportRef.current, `acon_reporte_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast('PDF generado', 'success');
    } catch (e) {
      toast('Error al generar PDF', 'error');
    } finally { setExporting(false); }
  };

  const handleRescore = async () => {
    setRescoring(true);
    try {
      const r = await rescoreAllLeads();
      toast(`Rescoring iniciado: ${r.data.count} leads`, 'success');
    } catch { toast('Error al rescorear', 'error'); }
    finally { setRescoring(false); }
  };

  if (loading) return <div className="loading"><div className="spinner" />Cargando reportes...</div>;

  const stats    = data?.summary || {};
  const pipeline = data?.byStage || [];
  const sourceData = data?.bySource || [];
  const trendData  = data?.monthlyTrend || [];

  const barData = pipeline.map(p => ({
    name: STAGE_LABELS[p._id] || p._id,
    count: p.count,
    value: (p.value || 0) / 1000,
    fill: STAGE_COLORS[p._id] || '#F2641E'
  }));

  const tabs = [
    { id: 'overview',    label: 'Resumen' },
    { id: 'operations',  label: 'Operaciones' },
    ...(isAdmin ? [
      { id: 'conversion', label: 'Conversión' },
      { id: 'team',       label: 'Equipo' },
    ] : []),
  ];

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Reportes</div>
          <div className="page-sub">KPIs, análisis de conversión y performance del equipo</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && (
            <button className="btn btn-ghost btn-sm" onClick={handleRescore} disabled={rescoring} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <RefreshCw size={13} className={rescoring ? 'spin' : ''} />
              {rescoring ? 'Rescorando...' : 'Re-Score IA'}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={handleExportCSV} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <FileSpreadsheet size={13} /> CSV
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleExportPDF} disabled={exporting} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <FileDown size={13} /> {exporting ? 'Generando...' : 'Exportar PDF'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--gray-200)' }}>
        {tabs.map(t => <Tab key={t.id} id={t.id} label={t.label} active={tab === t.id} onClick={setTab} />)}
      </div>

      {/* ─── PRINTABLE AREA ─────────────────────────────────── */}
      <div ref={reportRef}>

        {/* ── TAB: OVERVIEW ── */}
        {tab === 'overview' && (
          <>
            {/* KPIs */}
            <div className="stats-grid" style={{ marginBottom: 20 }}>
              <KpiCard label="Total Leads" value={stats.totalLeads || 0} delta="Pipeline activo" deltaUp Icon={Users} color="#F2641E" />
              <KpiCard label="Deals Activos" value={stats.activeDeals || 0} delta="En proceso" Icon={TrendingUp} color="#2563EB" />
              <KpiCard label="Ganados" value={stats.closedWon || 0} delta="Cerrados con éxito" deltaUp Icon={CheckCircle2} color="#16A34A" />
              <KpiCard label="Valor Pipeline" value={`$${((stats.pipelineValue || 0) / 1000).toFixed(0)}K`} delta="USD estimado" Icon={DollarSign} color="#0B2545" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {/* Bar chart: leads por etapa */}
              <div className="card">
                <div style={{ fontWeight: 700, color: 'var(--navy-900)', marginBottom: 16, fontSize: 14 }}>Leads por Etapa</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={barData} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: '#9AA3AE', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#9AA3AE', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Leads" radius={[6, 6, 0, 0]}>
                      {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Area chart: tendencia */}
              <div className="card">
                <div style={{ fontWeight: 700, color: 'var(--navy-900)', marginBottom: 16, fontSize: 14 }}>Tendencia Mensual</div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={trendData.length ? trendData : [
                    { mes: 'Ene', leads: 8 }, { mes: 'Feb', leads: 14 }, { mes: 'Mar', leads: 19 },
                    { mes: 'Abr', leads: 22 }, { mes: 'May', leads: 17 }, { mes: 'Jun', leads: 28 },
                  ]}>
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F2641E" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#F2641E" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F3" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fill: '#9AA3AE', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#9AA3AE', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="leads" name="Leads" stroke="#F2641E" strokeWidth={2.5} fill="url(#areaGrad)" dot={{ fill: '#F2641E', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Pie: fuentes */}
            {sourceData.length > 0 && (
              <div className="card">
                <div style={{ fontWeight: 700, color: 'var(--navy-900)', marginBottom: 16, fontSize: 14 }}>Distribución por Fuente</div>
                <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24, alignItems: 'center' }}>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={sourceData} dataKey="count" nameKey="_id" cx="50%" cy="50%" outerRadius={90} innerRadius={55} paddingAngle={2}>
                        {sourceData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sourceData.map((s, i) => {
                      const total = sourceData.reduce((a, b) => a + b.count, 0);
                      const pct = total ? Math.round((s.count / total) * 100) : 0;
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 2, background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                              <span style={{ fontSize: 12, color: 'var(--gray-700)', textTransform: 'capitalize' }}>{s._id || 'Otro'}</span>
                              <span style={{ fontSize: 12, fontWeight: 700 }}>{s.count} <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>({pct}%)</span></span>
                            </div>
                            <div style={{ height: 4, background: 'var(--gray-100)', borderRadius: 2 }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: PALETTE[i % PALETTE.length], borderRadius: 2 }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── TAB: OPERATIONS ── */}
        {tab === 'operations' && (
          <>
            {opsReport ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  {/* By service type */}
                  <div className="card">
                    <div style={{ fontWeight: 700, color: 'var(--navy-900)', marginBottom: 16, fontSize: 14 }}>Operaciones por Servicio</div>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={opsReport.byService.map(s => ({ name: s._id?.replace(/_/g, ' '), count: s.count }))} layout="vertical" barCategoryGap="25%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F3" horizontal={false} />
                        <XAxis type="number" tick={{ fill: '#9AA3AE', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fill: '#5A6472', fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" name="Ops" fill="var(--navy-900)" radius={[0, 5, 5, 0]}>
                          {opsReport.byService.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {/* By status */}
                  <div className="card">
                    <div style={{ fontWeight: 700, color: 'var(--navy-900)', marginBottom: 16, fontSize: 14 }}>Estado de Embarques</div>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={opsReport.byStatus} dataKey="count" nameKey="_id" cx="50%" cy="50%" outerRadius={90} innerRadius={55} paddingAngle={2}
                          label={({ _id, percent }) => `${(_id || '').replace(/_/g, ' ')} ${Math.round(percent * 100)}%`}
                          labelLine={false}>
                          {opsReport.byStatus.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Top routes */}
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, color: 'var(--navy-900)', marginBottom: 14, fontSize: 14 }}>Rutas más Frecuentes</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {opsReport.topRoutes.map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 12px', background: 'var(--gray-50)', borderRadius: 8 }}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: PALETTE[i % PALETTE.length], color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
                        <div style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{r._id?.origin || '—'} → {r._id?.destination || '—'}</div>
                        <div style={{ fontSize: 12, color: 'var(--text3)' }}>{r.carriers?.filter(Boolean).slice(0,2).join(', ') || '—'}</div>
                        <div style={{ fontWeight: 700, color: 'var(--orange-500)', fontSize: 13 }}>{r.count} ops</div>
                      </div>
                    ))}
                    {opsReport.topRoutes.length === 0 && <div style={{ color: 'var(--text3)', textAlign: 'center', padding: 20 }}>Sin operaciones registradas</div>}
                  </div>
                </div>

                {/* Docs expiring */}
                {opsReport.docsExpiring?.length > 0 && (
                  <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--red)', marginBottom: 14, fontSize: 14 }}>
                      <AlertTriangle size={16} /> Documentos por Vencer (7 días)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {opsReport.docsExpiring.map((op, i) => (
                        <div key={i} style={{ padding: '8px 12px', background: 'rgba(220,38,38,.04)', border: '1px solid rgba(220,38,38,.15)', borderRadius: 8 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{op.bookingNumber} — {op.clientName}</div>
                          {op.documents.filter(d => d.deadline && new Date(d.deadline) <= new Date(Date.now() + 7*24*60*60*1000) && d.status !== 'received').map((d, j) => (
                            <div key={j} style={{ fontSize: 12, color: 'var(--red)', marginTop: 3 }}>
                              {d.type}: vence {new Date(d.deadline).toLocaleDateString('es-MX')}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="card"><div className="empty-state">Sin datos de operaciones</div></div>
            )}
          </>
        )}

        {/* ── TAB: CONVERSION ── */}
        {tab === 'conversion' && conv && (
          <>
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
              <KpiCard label="Win Rate" value={`${conv.winRate}%`} delta={conv.winRate >= 40 ? 'Por encima del objetivo' : 'Mejorar conversión'} deltaUp={conv.winRate >= 40} Icon={Target} color="#16A34A" />
              <KpiCard label="Ganados" value={conv.won || 0} Icon={Award} color="#F2641E" />
              <KpiCard label="Perdidos" value={conv.lost || 0} Icon={AlertTriangle} color="#DC2626" />
              <KpiCard label="Ciclo de Venta" value={`${conv.avgCycledays || '—'}d`} delta="Promedio hasta cierre" Icon={TrendingUp} color="#2563EB" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {/* Funnel visual */}
              <div className="card">
                <div style={{ fontWeight: 700, color: 'var(--navy-900)', marginBottom: 16, fontSize: 14 }}>Funnel de Conversión</div>
                {conv.funnel?.map((f, i) => {
                  const color = STAGE_COLORS[f.stage] || '#F2641E';
                  const maxCount = Math.max(...conv.funnel.map(x => x.count), 1);
                  const barW = Math.max((f.count / maxCount) * 100, 2);
                  return (
                    <div key={f.stage} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5, alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          <span style={{ fontWeight: 500, color: 'var(--gray-700)' }}>{STAGE_LABELS[f.stage] || f.stage}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                          <span style={{ color: 'var(--gray-400)' }}>{f.count} leads</span>
                          <span style={{ fontWeight: 700, color, minWidth: 38, textAlign: 'right' }}>{f.pct}%</span>
                          <span style={{ color: '#16A34A', fontWeight: 600, minWidth: 50, textAlign: 'right', fontSize: 11 }}>
                            ${((f.value || 0) / 1000).toFixed(0)}K
                          </span>
                        </div>
                      </div>
                      <div style={{ height: 8, background: 'var(--gray-100)', borderRadius: 4, position: 'relative' }}>
                        <div style={{ height: '100%', width: `${barW}%`, background: color, borderRadius: 4, transition: 'width .6s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bar: valor por etapa */}
              <div className="card">
                <div style={{ fontWeight: 700, color: 'var(--navy-900)', marginBottom: 16, fontSize: 14 }}>Valor por Etapa (USD K)</div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={conv.funnel?.map(f => ({ name: STAGE_LABELS[f.stage]?.slice(0,8) || f.stage, value: parseFloat(((f.value || 0) / 1000).toFixed(1)), fill: STAGE_COLORS[f.stage] || '#F2641E' })) || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: '#9AA3AE', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#9AA3AE', fontSize: 11 }} axisLine={false} tickLine={false} unit="K" />
                    <Tooltip content={<CustomTooltip suffix="K USD" />} />
                    <Bar dataKey="value" name="Valor" radius={[6, 6, 0, 0]}>
                      {(conv.funnel || []).map((f, i) => <Cell key={i} fill={STAGE_COLORS[f.stage] || '#F2641E'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tiempo por etapa */}
            {conv.timeInStage?.length > 0 && (
              <div className="card">
                <div style={{ fontWeight: 700, color: 'var(--navy-900)', marginBottom: 14, fontSize: 14 }}>Tiempo Promedio por Etapa</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={conv.timeInStage.map(t => ({ name: STAGE_LABELS[t.stage]?.slice(0,9) || t.stage, días: t.avgDays }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: '#9AA3AE', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#9AA3AE', fontSize: 11 }} axisLine={false} tickLine={false} unit="d" />
                    <Tooltip content={<CustomTooltip suffix=" días" />} />
                    <Bar dataKey="días" fill="#0B2545" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}

        {/* ── TAB: TEAM ── */}
        {tab === 'team' && (
          <>
            {team.length > 0 && (
              <>
                {/* Radar chart: comparativo de equipo */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div className="card">
                    <div style={{ fontWeight: 700, color: 'var(--navy-900)', marginBottom: 16, fontSize: 14 }}>Win Rate por Ejecutivo</div>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={team.map(t => ({ name: t.executive?.name?.split(' ')[0] || '?', winRate: t.stats?.winRate || 0 }))} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F3" horizontal={false} />
                        <XAxis type="number" tick={{ fill: '#9AA3AE', fontSize: 11 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                        <YAxis type="category" dataKey="name" tick={{ fill: '#5A6472', fontSize: 12 }} axisLine={false} tickLine={false} width={80} />
                        <Tooltip content={<CustomTooltip suffix="%" />} />
                        <Bar dataKey="winRate" name="Win Rate" fill="#F2641E" radius={[0, 6, 6, 0]} maxBarSize={24} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="card">
                    <div style={{ fontWeight: 700, color: 'var(--navy-900)', marginBottom: 16, fontSize: 14 }}>Pipeline por Ejecutivo (K USD)</div>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={team.map(t => ({ name: t.executive?.name?.split(' ')[0] || '?', pipeline: parseFloat(((t.stats?.activePipeline || 0) / 1000).toFixed(1)) }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: '#9AA3AE', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#9AA3AE', fontSize: 11 }} axisLine={false} tickLine={false} unit="K" />
                        <Tooltip content={<CustomTooltip suffix="K USD" />} />
                        <Bar dataKey="pipeline" name="Pipeline" fill="#0B2545" radius={[6, 6, 0, 0]} maxBarSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Tabla detallada */}
                <div className="card" style={{ padding: 0 }}>
                  <div style={{ padding: '16px 20px', fontWeight: 700, color: 'var(--navy-900)', fontSize: 14, borderBottom: '1px solid var(--gray-200)' }}>
                    Performance Detallada
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          {['Ejecutivo', 'Leads', 'Ganados', 'Perdidos', 'Win Rate', 'Pipeline', 'Actividad sem.'].map(h => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {team.map((t, i) => {
                          const wr = t.stats?.winRate || 0;
                          return (
                            <tr key={t.executive?._id}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: PALETTE[i % PALETTE.length], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>
                                    {(t.executive?.name || '?').slice(0, 2).toUpperCase()}
                                  </div>
                                  <span style={{ fontWeight: 600 }}>{t.executive?.name || '—'}</span>
                                </div>
                              </td>
                              <td style={{ fontWeight: 600 }}>{t.stats?.totalLeads || 0}</td>
                              <td><span style={{ color: '#16A34A', fontWeight: 700 }}>{t.stats?.closedWon || 0}</span></td>
                              <td><span style={{ color: '#DC2626', fontWeight: 600 }}>{t.stats?.closedLost || 0}</span></td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ flex: 1, height: 5, background: 'var(--gray-100)', borderRadius: 3 }}>
                                    <div style={{ height: '100%', width: `${wr}%`, background: wr >= 50 ? '#16A34A' : wr >= 30 ? '#F2641E' : '#DC2626', borderRadius: 3 }} />
                                  </div>
                                  <span style={{ fontWeight: 700, fontSize: 12, color: wr >= 50 ? '#16A34A' : wr >= 30 ? '#F2641E' : '#DC2626', minWidth: 36 }}>{wr}%</span>
                                </div>
                              </td>
                              <td style={{ fontWeight: 600, color: 'var(--orange-500)' }}>${((t.stats?.activePipeline || 0) / 1000).toFixed(0)}K</td>
                              <td style={{ color: 'var(--gray-500)', fontSize: 12 }}>{t.stats?.activitiesThisWeek || 0} actividades</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
            {team.length === 0 && (
              <div className="card">
                <div className="empty-state">
                  <BarChart3 size={40} />
                  <p>No hay ejecutivos con datos disponibles aún.</p>
                </div>
              </div>
            )}
          </>
        )}

      </div>
      {/* ─── END PRINTABLE AREA ── */}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
