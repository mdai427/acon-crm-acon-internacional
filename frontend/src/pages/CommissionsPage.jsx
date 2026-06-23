import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, Plus, Search, RefreshCw, X, ChevronDown,
  CheckCircle, Clock, XCircle, TrendingUp, Award, Download,
  FileText, User
} from 'lucide-react';
import {
  getCommissions, getCommissionsSummary, getCommissionsConfig,
  createCommission, updateCommission, deleteCommission
} from '../services/api';

// ── Constants ─────────────────────────────────────────────────────────────────
const SERVICE_LABELS = {
  maritimo_import:    'Marítimo Importación',
  maritimo_export:    'Marítimo Exportación',
  aereo_import:       'Aéreo Importación',
  aereo_export:       'Aéreo Exportación',
  terrestre_usa:      'Terrestre USA',
  terrestre_nacional: 'Terrestre Nacional',
  despacho_aduanal:   'Despacho Aduanal',
  almacenaje:         'Almacenaje',
  seguro_carga:       'Seguro de Carga',
  otro:               'Otro',
};

const STATUS_CONFIG = {
  pending:   { label: 'Pendiente',  color: '#d97706', bg: '#fef3c7', Icon: Clock },
  approved:  { label: 'Aprobada',   color: '#2563eb', bg: '#dbeafe', Icon: CheckCircle },
  paid:      { label: 'Pagada',     color: '#16a34a', bg: '#dcfce7', Icon: CheckCircle },
  cancelled: { label: 'Cancelada',  color: '#dc2626', bg: '#fee2e2', Icon: XCircle },
};

const fmtMXN = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(n || 0);

const PERIODS = (() => {
  const periods = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    periods.push({ val, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return periods;
})();

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      color: cfg.color, background: cfg.bg,
    }}>
      <cfg.Icon size={12} />
      {cfg.label}
    </span>
  );
}

// ── CreateModal ───────────────────────────────────────────────────────────────
function CreateModal({ config, onClose, onSaved }) {
  const [form, setForm] = useState({
    clientName: '', serviceType: 'maritimo_import',
    dealValue: '', costValue: '0', commissionPct: '',
    notes: '', dealDate: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => {
    const next = { ...f, [k]: v };
    // Auto-fill pct from config
    if (k === 'serviceType' && config) next.commissionPct = config[v] || '';
    return next;
  });

  const profit = (parseFloat(form.dealValue) || 0) - (parseFloat(form.costValue) || 0);
  const commission = profit * ((parseFloat(form.commissionPct) || 0) / 100);

  const save = async () => {
    if (!form.clientName || !form.dealValue || !form.commissionPct) return;
    setSaving(true);
    try {
      await createCommission({
        ...form,
        dealValue: parseFloat(form.dealValue),
        costValue: parseFloat(form.costValue) || 0,
        commissionPct: parseFloat(form.commissionPct),
      });
      onSaved();
    } catch (e) {
      alert(e.response?.data?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0B2545' }}>Nueva Comisión</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={20} /></button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Cliente *</label>
            <input style={inputStyle} value={form.clientName} onChange={e => set('clientName', e.target.value)} placeholder="Nombre del cliente" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Tipo de servicio</label>
              <select style={inputStyle} value={form.serviceType} onChange={e => set('serviceType', e.target.value)}>
                {Object.entries(SERVICE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Fecha del deal</label>
              <input type="date" style={inputStyle} value={form.dealDate} onChange={e => set('dealDate', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Valor del deal (MXN) *</label>
              <input type="number" style={inputStyle} value={form.dealValue} onChange={e => set('dealValue', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label style={labelStyle}>Costo/Gasto (MXN)</label>
              <input type="number" style={inputStyle} value={form.costValue} onChange={e => set('costValue', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label style={labelStyle}>% Comisión *</label>
              <input type="number" style={inputStyle} value={form.commissionPct} onChange={e => set('commissionPct', e.target.value)} placeholder="5" step="0.5" />
            </div>
          </div>
          {form.dealValue && form.commissionPct && (
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#0369a1' }}>
                <span>Utilidad: <strong>{fmtMXN(profit)}</strong></span>
                <span>Comisión calculada: <strong style={{ color: '#16a34a', fontSize: 15 }}>{fmtMXN(commission)}</strong></span>
              </div>
            </div>
          )}
          <div>
            <label style={labelStyle}>Notas</label>
            <textarea style={{ ...inputStyle, height: 70, resize: 'vertical' }} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Observaciones..." />
          </div>
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary}>Cancelar</button>
          <button onClick={save} disabled={saving} style={btnPrimary}>
            {saving ? 'Guardando...' : 'Guardar Comisión'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CommissionsPage() {
  const [commissions, setCommissions] = useState([]);
  const [totals, setTotals] = useState({});
  const [summary, setSummary] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'summary'
  const [showCreate, setShowCreate] = useState(false);
  const [filters, setFilters] = useState({ period: PERIODS[0].val, status: '', userId: '' });
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.period) params.period = filters.period;
      if (filters.status) params.status = filters.status;
      if (filters.userId) params.userId = filters.userId;

      const [listRes, summaryRes, cfgRes] = await Promise.all([
        getCommissions(params),
        getCommissionsSummary({ period: filters.period }),
        config ? Promise.resolve({ data: { data: config } }) : getCommissionsConfig(),
      ]);
      setCommissions(listRes.data.data || []);
      setTotals(listRes.data.totals || {});
      setSummary(summaryRes.data.data || []);
      if (!config) setConfig(cfgRes.data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filters, config]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (id, status) => {
    try {
      await updateCommission(id, { status });
      setCommissions(cs => cs.map(c => c._id === id ? { ...c, status } : c));
    } catch (e) {
      alert(e.response?.data?.message || 'Error');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('¿Eliminar esta comisión?')) return;
    try {
      await deleteCommission(id);
      setCommissions(cs => cs.filter(c => c._id !== id));
    } catch (e) {
      alert(e.response?.data?.message || 'Error');
    }
  };

  const filtered = commissions.filter(c =>
    !search || c.clientName?.toLowerCase().includes(search.toLowerCase()) ||
    c.user?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const exportCSV = () => {
    const rows = [
      ['Ejecutivo', 'Cliente', 'Servicio', 'Período', 'Valor Deal', 'Utilidad', 'Comisión', 'Estado'],
      ...filtered.map(c => [
        c.user?.name || '', c.clientName, SERVICE_LABELS[c.serviceType] || c.serviceType,
        c.period, c.dealValue, c.profitValue, c.commissionAmt, c.status,
      ])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `comisiones_${filters.period}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0B2545' }}>Comisiones</h1>
          <p style={{ margin: '2px 0 0', color: '#6b7280', fontSize: 14 }}>Seguimiento de comisiones por ejecutivo y servicio</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={exportCSV} style={btnSecondary}>
            <Download size={15} /> Exportar CSV
          </button>
          <button onClick={() => setShowCreate(true)} style={btnPrimary}>
            <Plus size={15} /> Nueva Comisión
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Valor Total Deals', value: fmtMXN(totals.dealValue), icon: TrendingUp, color: '#0B2545' },
          { label: 'Total Comisiones', value: fmtMXN(totals.commissionAmt), icon: DollarSign, color: '#F2641E' },
          { label: 'Comisiones Pagadas', value: fmtMXN(totals.paid), icon: CheckCircle, color: '#16a34a' },
          { label: 'Pendientes de Pago', value: fmtMXN(totals.pending), icon: Clock, color: '#d97706' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={{ background: '#fff', borderRadius: 10, padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={20} color={color} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs + Filters */}
      <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #e5e7eb', padding: '0 20px', gap: 4 }}>
          {['list', 'summary'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '14px 16px',
              fontWeight: 600, fontSize: 14, color: view === v ? '#0B2545' : '#6b7280',
              borderBottom: view === v ? '2px solid #F2641E' : '2px solid transparent',
              transition: 'all 0.15s',
            }}>
              {v === 'list' ? '📋 Detalle' : '🏆 Por Ejecutivo'}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={load} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 8 }}>
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Filters bar */}
        <div style={{ padding: '12px 20px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input style={{ ...inputStyle, paddingLeft: 32, width: 200, margin: 0 }}
              placeholder="Buscar cliente o ejecutivo..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select style={{ ...inputStyle, margin: 0, width: 180 }} value={filters.period}
            onChange={e => setFilters(f => ({ ...f, period: e.target.value }))}>
            <option value="">Todos los períodos</option>
            {PERIODS.map(p => <option key={p.val} value={p.val}>{p.label}</option>)}
          </select>
          <select style={{ ...inputStyle, margin: 0, width: 150 }} value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>
            <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
            <div>Cargando comisiones...</div>
          </div>
        ) : view === 'list' ? (
          <CommissionsList commissions={filtered} onChangeStatus={changeStatus} onDelete={remove} />
        ) : (
          <SummaryView summary={summary} period={filters.period} />
        )}
      </div>

      {showCreate && (
        <CreateModal config={config} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── CommissionsList ────────────────────────────────────────────────────────────
function CommissionsList({ commissions, onChangeStatus, onDelete }) {
  if (!commissions.length) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>
        <DollarSign size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
        <div style={{ fontWeight: 600 }}>No hay comisiones registradas</div>
        <div style={{ fontSize: 13 }}>Crea la primera comisión para este período</div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f9fafb' }}>
            {['Ejecutivo', 'Cliente', 'Servicio', 'Período', 'Deal', 'Utilidad', 'Comisión', 'Estado', ''].map(h => (
              <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {commissions.map(c => (
            <tr key={c._id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={td}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#0B2545', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                    {(c.user?.name || '?')[0].toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 500, color: '#111827' }}>{c.user?.name || '—'}</span>
                </div>
              </td>
              <td style={td}><span style={{ color: '#111827', fontWeight: 500 }}>{c.clientName}</span></td>
              <td style={td}><span style={{ color: '#6b7280', fontSize: 12 }}>{SERVICE_LABELS[c.serviceType] || c.serviceType}</span></td>
              <td style={td}><span style={{ color: '#6b7280' }}>{c.period}</span></td>
              <td style={td}><span style={{ fontWeight: 600, color: '#111827' }}>{fmtMXN(c.dealValue)}</span></td>
              <td style={td}><span style={{ color: '#0B2545' }}>{fmtMXN(c.profitValue)}</span></td>
              <td style={td}><span style={{ fontWeight: 700, color: '#F2641E', fontSize: 14 }}>{fmtMXN(c.commissionAmt)}</span></td>
              <td style={td}><StatusBadge status={c.status} /></td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>
                <StatusActions status={c.status} onChange={s => onChangeStatus(c._id, s)} onDelete={() => onDelete(c._id)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusActions({ status, onChange, onDelete }) {
  const [open, setOpen] = useState(false);
  const next = status === 'pending' ? ['approved', 'cancelled']
             : status === 'approved' ? ['paid', 'cancelled']
             : [];

  return (
    <div style={{ position: 'relative', display: 'flex', gap: 6, alignItems: 'center' }}>
      {next.length > 0 && (
        <div style={{ position: 'relative' }}>
          <button onClick={() => setOpen(o => !o)} style={{ ...btnSecondary, padding: '4px 10px', fontSize: 12 }}>
            Acción <ChevronDown size={12} />
          </button>
          {open && (
            <div style={{ position: 'absolute', right: 0, top: '100%', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, minWidth: 130 }}>
              {next.map(s => (
                <button key={s} onClick={() => { onChange(s); setOpen(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                  <StatusBadge status={s} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {status !== 'paid' && (
        <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }}>
          <X size={15} />
        </button>
      )}
    </div>
  );
}

// ── SummaryView ────────────────────────────────────────────────────────────────
function SummaryView({ summary, period }) {
  if (!summary.length) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>
        <Award size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
        <div style={{ fontWeight: 600 }}>No hay datos de resumen</div>
      </div>
    );
  }

  const max = Math.max(...summary.map(s => s.totalCommission || 0));

  return (
    <div style={{ padding: 20 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#0B2545' }}>
        Ranking de Ejecutivos — {period || 'Todos los períodos'}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {summary.map((s, i) => {
          const pct = max > 0 ? (s.totalCommission / max) * 100 : 0;
          return (
            <div key={s._id?.user || i} style={{ background: '#f9fafb', borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: i === 0 ? '#F2641E' : '#0B2545', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>
                    {i + 1}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: '#111827' }}>{s.user?.name || 'Sin nombre'}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{s.user?.email} · {s.count} operaciones</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: 18, color: '#F2641E' }}>{fmtMXN(s.totalCommission)}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    Pagado: {fmtMXN(s.paidCommission)} · Pendiente: {fmtMXN(s.pendingCommission)}
                  </div>
                </div>
              </div>
              <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: i === 0 ? '#F2641E' : '#0B2545', borderRadius: 4, transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                <span>Deal total: <strong style={{ color: '#111827' }}>{fmtMXN(s.totalDeal)}</strong></span>
                <span>Utilidad: <strong style={{ color: '#0B2545' }}>{fmtMXN(s.totalProfit)}</strong></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
  borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box',
  background: '#fff', color: '#111827',
};
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 };
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px',
  background: '#F2641E', color: '#fff', border: 'none', borderRadius: 8,
  fontWeight: 600, fontSize: 14, cursor: 'pointer',
};
const btnSecondary = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px',
  background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8,
  fontWeight: 600, fontSize: 14, cursor: 'pointer',
};
const td = { padding: '12px 16px', verticalAlign: 'middle' };
