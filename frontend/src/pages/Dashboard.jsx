import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  TrendingUp, DollarSign, Users, Target, Zap,
  Clock, Activity, AlertTriangle, CheckCircle2, Package,
  BarChart3, Plus, ArrowRight,
  Inbox, Award, FileText,
  ChevronUp, ChevronDown, Layers, Star, Flame, Calendar, RefreshCw
} from 'lucide-react';
import { getDashboard } from '../services/api';

// ── Constants ──────────────────────────────────────────────────────────────────
const STAGE_LABELS = {
  new: 'Nuevo', contacted: 'Contactado', qualified: 'Calificado',
  proposal: 'Propuesta', negotiation: 'Negociación',
  closed_won: 'Ganado', closed_lost: 'Perdido'
};
const STAGE_COLORS = {
  new: '#6366f1', contacted: '#3b82f6', qualified: '#eab308',
  proposal: '#f97316', negotiation: '#8b5cf6',
  closed_won: '#22c55e', closed_lost: '#ef4444'
};
const SOURCE_LABELS = {
  linkedin: 'LinkedIn', facebook: 'Facebook', instagram: 'Instagram',
  whatsapp: 'WhatsApp', email: 'Email', web: 'Web',
  referral: 'Referido', cold_call: 'Prospección', event: 'Evento'
};
const SOURCE_COLORS = ['#f97316','#3b82f6','#22c55e','#8b5cf6','#eab308','#06b6d4','#ec4899','#14b8a6','#f43f5e'];
const PERIODS = [
  { key: 'today', label: 'Hoy' },
  { key: 'week',  label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'quarter', label: 'Trimestre' },
  { key: 'year', label: 'Año' },
];

// ── Formatters ─────────────────────────────────────────────────────────────────
const fmt$ = (v) => {
  if (!v && v !== 0) return '$0';
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000)    return `$${(v / 1000).toFixed(0)}K`;
  return `$${Math.round(v).toLocaleString()}`;
};
const fmtN = (v) => (v || 0).toLocaleString();

// ── Skeleton ───────────────────────────────────────────────────────────────────
function Skeleton({ w = '100%', h = 20, r = 6, mb = 0 }) {
  return <div className="skeleton-box" style={{ width: w, height: h, borderRadius: r, marginBottom: mb }} />;
}

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, trend, color = '#f97316', loading, suffix = '', alert }) {
  const up = trend > 0;
  const neutral = !trend && trend !== 0;
  return (
    <div className="kpi-card" style={{ '--kpi-color': color, borderTop: `3px solid ${color}` }}>
      {loading ? (
        <><Skeleton h={12} w="55%" mb={10} /><Skeleton h={28} w="70%" mb={8} /><Skeleton h={10} w="45%" /></>
      ) : (
        <>
          <div className="kpi-card-header">
            <span className="kpi-label">{label}</span>
            <div className="kpi-icon" style={{ background: color + '1a', color }}>
              <Icon size={14} strokeWidth={2} />
            </div>
          </div>
          <div className="kpi-value">
            {value}{suffix}
            {alert && <span className="kpi-alert" />}
          </div>
          <div className="kpi-footer">
            {sub && <span className="kpi-sub">{sub}</span>}
            {!neutral && trend !== undefined && (
              <span className={`kpi-trend ${up ? 'kpi-trend-up' : 'kpi-trend-dn'}`}>
                {up ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                {Math.abs(trend)}%
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Chart Card ─────────────────────────────────────────────────────────────────
function ChartCard({ title, sub, children, loading, action, style = {} }) {
  return (
    <div className="chart-card" style={style}>
      <div className="chart-card-hd">
        <div>
          <div className="chart-title">{title}</div>
          {sub && <div className="chart-sub">{sub}</div>}
        </div>
        {action}
      </div>
      <div className="chart-card-bd">
        {loading ? <Skeleton h={180} r={8} /> : children}
      </div>
    </div>
  );
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
function CTip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="chart-tip-label">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="chart-tip-row">
          <span style={{ color: p.color }}>●</span>
          <span>{p.name}: <strong>{currency ? fmt$(p.value) : fmtN(p.value)}</strong></span>
        </div>
      ))}
    </div>
  );
}

// ── Stage Bar ──────────────────────────────────────────────────────────────────
function StageBar({ stageKey, count, value, maxCount }) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  const color = STAGE_COLORS[stageKey] || '#6b7280';
  return (
    <div className="stage-bar-row">
      <div className="stage-bar-label">
        <span className="stage-dot" style={{ background: color }} />
        <span>{STAGE_LABELS[stageKey] || stageKey}</span>
      </div>
      <div className="stage-bar-track">
        <div className="stage-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="stage-bar-meta">
        <span className="stage-count-badge">{count}</span>
        {value > 0 && <span className="stage-value-badge">{fmt$(value)}</span>}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function Dashboard({ user, onNavigate, toast }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod]   = useState('month');
  const [tick, setTick]       = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDashboard(period);
      setData(res.data.data);
    } catch (e) {
      console.error(e);
      if (toast) toast('Error al cargar el dashboard', 'error');
    } finally {
      setLoading(false);
    }
  }, [period, tick]);

  useEffect(() => { load(); }, [load]);

  const kpis   = data?.kpis   || {};
  const charts = data?.charts || {};
  const recent = data?.recentLeads || [];
  const top    = data?.topLeads    || [];

  const stageRows = useMemo(() => {
    const ord = ['new','contacted','qualified','proposal','negotiation','closed_won','closed_lost'];
    return ord.map(s => {
      const d = (charts.pipelineByStage || []).find(x => x.stage === s) || { count: 0, value: 0 };
      return { key: s, count: d.count, value: d.value };
    });
  }, [charts.pipelineByStage]);

  const maxCount = useMemo(() => Math.max(...stageRows.map(r => r.count), 1), [stageRows]);

  const sourceData = useMemo(() =>
    (charts.salesBySource || []).filter(s => s.count > 0).map((s, i) => ({
      name: SOURCE_LABELS[s.source] || s.source || 'Otro',
      value: s.count,
      color: SOURCE_COLORS[i % SOURCE_COLORS.length]
    })),
  [charts.salesBySource]);

  const funnelRows = useMemo(() => {
    const f = charts.conversionFunnel || [];
    const max = f[0]?.count || f.reduce((m, x) => Math.max(m, x.count), 1);
    return f.filter(x => x.count > 0 && x.stage !== 'closed_lost').map(x => ({
      label: STAGE_LABELS[x.stage] || x.stage,
      count: x.count,
      pct: max > 0 ? Math.round((x.count / max) * 100) : 0,
      color: STAGE_COLORS[x.stage] || '#6b7280'
    }));
  }, [charts.conversionFunnel]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const pLabel = PERIODS.find(p => p.key === period)?.label || 'Mes';

  return (
    <div className="page-wrap dash-enterprise">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="dash-header">
        <div>
          <div className="dash-greeting">
            {greeting()}, <strong>{user?.name?.split(' ')[0] || 'Equipo'}</strong>
          </div>
          <div className="dash-subtitle">Dashboard Comercial · ACON Internacional</div>
        </div>
        <div className="dash-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setTick(t => t + 1)}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Actualizar
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => onNavigate('reports')}>
            <BarChart3 size={13} /> Reportes
          </button>
          <button className="btn btn-sm btn-navy" onClick={() => onNavigate('operations')}>
            <Package size={13} /> Nueva Op.
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => onNavigate('leads')}>
            <Plus size={13} /> Nuevo Lead
          </button>
        </div>
      </div>

      {/* ── Period Filter ──────────────────────────────────────────────────────── */}
      <div className="period-bar">
        <div className="period-tabs">
          {PERIODS.map(p => (
            <button key={p.key} className={`period-tab ${period === p.key ? 'active' : ''}`} onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        <span className="period-date">
          <Calendar size={12} /> {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      {/* ── KPI: Ventas ───────────────────────────────────────────────────────── */}
      <div className="kpi-section-hd"><DollarSign size={13} /> Ventas · {pLabel}</div>
      <div className="kpi-grid g4">
        <KpiCard icon={DollarSign} label="Valor Vendido" loading={loading}
          value={fmt$(kpis.salesAmount?.current)}
          sub={`Ant: ${fmt$(kpis.salesAmount?.previous)}`}
          trend={kpis.salesAmount?.trend} color="#22c55e" />
        <KpiCard icon={Award} label="Negocios Cerrados" loading={loading}
          value={fmtN(kpis.salesCount?.current)}
          sub={`Ant: ${fmtN(kpis.salesCount?.previous)}`}
          trend={kpis.salesCount?.trend} color="#3b82f6" />
        <KpiCard icon={Target} label="Ticket Promedio" loading={loading}
          value={fmt$(kpis.avgTicket?.current)}
          sub={`Ant: ${fmt$(kpis.avgTicket?.previous)}`}
          trend={kpis.avgTicket?.trend} color="#8b5cf6" />
        <KpiCard icon={Layers} label="Pipeline Total" loading={loading}
          value={fmt$(kpis.pipelineValue?.current)}
          sub={`${fmtN(kpis.activeOpportunities?.current)} oportunidades`}
          color="#f97316" />
      </div>

      {/* ── KPI: Leads ────────────────────────────────────────────────────────── */}
      <div className="kpi-section-hd"><Users size={13} /> Leads · {pLabel}</div>
      <div className="kpi-grid g4">
        <KpiCard icon={Users} label="Leads Nuevos" loading={loading}
          value={fmtN(kpis.newLeads?.current)}
          trend={kpis.newLeads?.trend} color="#6366f1" />
        <KpiCard icon={Activity} label="Leads Contactados" loading={loading}
          value={fmtN(kpis.contactedLeads?.current)} color="#0891b2" />
        <KpiCard icon={Inbox} label="Sin Seguimiento" loading={loading}
          value={fmtN(kpis.noFollowUpLeads?.current)}
          alert={kpis.noFollowUpLeads?.current > 5} color="#eab308" />
        <KpiCard icon={AlertTriangle} label="Seguimientos Vencidos" loading={loading}
          value={fmtN(kpis.overdueFollowUps?.current)}
          alert={kpis.overdueFollowUps?.current > 0} color="#ef4444" />
      </div>

      {/* ── KPI: Conversión ───────────────────────────────────────────────────── */}
      <div className="kpi-section-hd"><Zap size={13} /> Conversión & Actividades</div>
      <div className="kpi-grid g4">
        <KpiCard icon={TrendingUp} label="Lead → Cliente" loading={loading}
          value={fmtN(kpis.leadToClientRate?.current)} suffix="%" color="#22c55e" />
        <KpiCard icon={FileText} label="Cotización → Venta" loading={loading}
          value={fmtN(kpis.quoteToSaleRate?.current)} suffix="%" color="#3b82f6" />
        <KpiCard icon={Clock} label="Tiempo de Cierre" loading={loading}
          value={fmtN(kpis.avgCloseTime?.current)} suffix=" días" color="#8b5cf6" />
        <KpiCard icon={CheckCircle2} label="Actividades Hoy" loading={loading}
          value={fmtN(kpis.activitiesToday?.current)}
          sub={`${fmtN(kpis.pendingTasks?.current)} tareas pendientes`}
          color="#f97316" />
      </div>

      {/* ── Charts Row 1 ──────────────────────────────────────────────────────── */}
      <div className="chart-row c60-40">
        <ChartCard title="Ventas por Mes" sub="Últimos 12 meses · USD" loading={loading}
          action={<button className="btn btn-ghost btn-xs" onClick={() => onNavigate('reports')}>Ver más <ArrowRight size={11} /></button>}
        >
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={charts.salesByMonth || []} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f97316" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={fmt$} axisLine={false} tickLine={false} width={52} />
              <Tooltip content={<CTip currency />} />
              <Area type="monotone" dataKey="total" name="Ventas" stroke="#f97316" fill="url(#sg)" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#f97316' }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Pipeline por Etapa" sub="Leads activos por fase">
          <div className="stage-bar-list">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={28} r={6} mb={10} />)
              : stageRows.filter(r => r.key !== 'closed_lost').map(r => (
                  <StageBar key={r.key} stageKey={r.key} count={r.count} value={r.value} maxCount={maxCount} />
                ))
            }
          </div>
        </ChartCard>
      </div>

      {/* ── Charts Row 2 ──────────────────────────────────────────────────────── */}
      <div className="chart-row c3col">
        <ChartCard title="Ventas por Vendedor" sub={pLabel} loading={loading}>
          {charts.salesByVendor?.length > 0 ? (
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={charts.salesByVendor} layout="vertical" margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" horizontal={false} />
                <XAxis type="number" tickFormatter={fmt$} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} width={75} axisLine={false} tickLine={false} />
                <Tooltip content={<CTip currency />} />
                <Bar dataKey="total" name="Ventas" radius={[0, 4, 4, 0]} fill="#3b82f6" maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyMini label="Sin datos de ventas" />}
        </ChartCard>

        <ChartCard title="Leads por Fuente" sub="Distribución" loading={loading}>
          {sourceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={sourceData} cx="50%" cy="42%" innerRadius={52} outerRadius={75} paddingAngle={3} dataKey="value">
                  {sourceData.map((e, i) => <Cell key={i} fill={e.color} strokeWidth={0} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v + ' leads', n]} />
                <Legend formatter={v => <span style={{ fontSize: 11, color: '#374151' }}>{v}</span>} iconSize={7} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyMini label="Sin datos de fuentes" />}
        </ChartCard>

        <ChartCard title="Embudo de Conversión" sub="Lead → Cliente" loading={loading}>
          {funnelRows.length > 0 ? (
            <div style={{ padding: '4px 0' }}>
              {funnelRows.map(f => (
                <div key={f.label} style={{ marginBottom: 9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: '#374151', fontWeight: 500 }}>{f.label}</span>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>{f.count} · {f.pct}%</span>
                  </div>
                  <div style={{ height: 6, background: '#f0f2f5', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${f.pct}%`, background: f.color, borderRadius: 4, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyMini label="Sin datos de conversión" />}
        </ChartCard>
      </div>

      {/* ── Bottom Row ────────────────────────────────────────────────────────── */}
      <div className="chart-row c60-40">
        <ChartCard title="Leads Recientes" sub="Últimas oportunidades"
          action={<button className="btn btn-ghost btn-xs" onClick={() => onNavigate('leads')}>Ver todos <ArrowRight size={11} /></button>}
          loading={loading}
        >
          {recent.length > 0 ? recent.map(lead => (
            <div key={lead._id} className="recent-row">
              <div className="recent-avatar" style={{ background: (STAGE_COLORS[lead.stage] || '#6366f1') + '20', color: STAGE_COLORS[lead.stage] || '#6366f1' }}>
                {(lead.company || '?').charAt(0).toUpperCase()}
              </div>
              <div className="recent-info">
                <div className="recent-company">{lead.company}</div>
                <div className="recent-contact">{lead.contact}</div>
              </div>
              <div className="recent-right">
                <span className="badge" style={{ background: (STAGE_COLORS[lead.stage] || '#6366f1') + '18', color: STAGE_COLORS[lead.stage] || '#6366f1', border: `1px solid ${STAGE_COLORS[lead.stage] || '#6366f1'}30` }}>
                  {STAGE_LABELS[lead.stage] || lead.stage}
                </span>
                {lead.value > 0 && <div className="recent-value">{fmt$(lead.value)}</div>}
              </div>
            </div>
          )) : <EmptyMini icon={Users} label="No hay leads registrados" />}
        </ChartCard>

        <ChartCard title="Top Oportunidades" sub="Mayor probabilidad de cierre"
          action={<button className="btn btn-ghost btn-xs" onClick={() => onNavigate('pipeline')}>Pipeline <ArrowRight size={11} /></button>}
          loading={loading}
        >
          {top.length > 0 ? top.map((lead, i) => (
            <div key={lead._id} className="top-row">
              <div className="top-rank">
                {i === 0 ? <Flame size={13} style={{ color: '#f97316' }} />
                 : i === 1 ? <Star size={13} style={{ color: '#eab308' }} />
                 : <span style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700 }}>#{i + 1}</span>}
              </div>
              <div className="top-info">
                <div className="top-company">{lead.company}</div>
                <div className="top-stage">{STAGE_LABELS[lead.stage] || lead.stage}</div>
              </div>
              <div className="top-score" style={{
                background: lead.score >= 70 ? '#22c55e18' : lead.score >= 40 ? '#eab30818' : '#ef444418',
                color: lead.score >= 70 ? '#16a34a' : lead.score >= 40 ? '#ca8a04' : '#dc2626'
              }}>{lead.score || 0}</div>
              {lead.value > 0 && <div className="top-value">{fmt$(lead.value)}</div>}
            </div>
          )) : <EmptyMini icon={Target} label="Sin oportunidades calificadas" />}
        </ChartCard>
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────────────────── */}
      <div className="quick-bar">
        {[
          { label: 'Leads',       icon: Users,    page: 'leads',      color: '#6366f1' },
          { label: 'Pipeline',    icon: Layers,   page: 'pipeline',   color: '#f97316' },
          { label: 'Cotizador',   icon: FileText, page: 'quoter',     color: '#3b82f6' },
          { label: 'Operaciones', icon: Package,  page: 'operations', color: '#22c55e' },
          { label: 'Reportes',    icon: BarChart3,page: 'reports',    color: '#8b5cf6' },
          { label: 'Campañas',    icon: Zap,      page: 'marketing',  color: '#ec4899' },
        ].map(({ label, icon: Icon, page, color }) => (
          <button key={page} className="quick-btn" onClick={() => onNavigate(page)}>
            <div className="quick-ico" style={{ background: color + '18', color }}><Icon size={17} /></div>
            <span className="quick-lbl">{label}</span>
          </button>
        ))}
      </div>

    </div>
  );
}

function EmptyMini({ icon: Icon = BarChart3, label }) {
  return (
    <div style={{ textAlign: 'center', padding: '28px 0', color: '#9ca3af' }}>
      <Icon size={24} style={{ marginBottom: 6, opacity: 0.35 }} />
      <div style={{ fontSize: 12 }}>{label}</div>
    </div>
  );
}
