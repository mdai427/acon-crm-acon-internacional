import React, { useEffect, useState, useCallback } from 'react';
import {
  getPostVenta, getPostVentaSummary, updatePostVenta, submitNPS, syncPostVenta, getRenewals
} from '../services/api';
import { HeartHandshake, AlertTriangle, Star, TrendingUp, DollarSign, RefreshCw, Plus, CheckCircle2, Clock } from 'lucide-react';

const STATUS_COLORS = { active: '#16A34A', at_risk: '#F59E0B', churned: '#DC2626', renewed: '#2563EB' };
const STATUS_LABELS = { active: 'Activo', at_risk: 'En Riesgo', churned: 'Perdido', renewed: 'Renovado' };

const NPS_COLOR = (score) => {
  if (score >= 9) return '#16A34A';
  if (score >= 7) return '#F59E0B';
  return '#DC2626';
};

const TABS = [
  { id: 'clients',  label: 'Clientes Activos',  Icon: HeartHandshake },
  { id: 'nps',      label: 'Satisfacción NPS',   Icon: Star },
  { id: 'renewals', label: 'Renovaciones',        Icon: RefreshCw },
];

export default function PostVentaPage({ toast }) {
  const [tab, setTab] = useState('clients');
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [renewals, setRenewals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [npsModal, setNpsModal] = useState(null);
  const [npsForm, setNpsForm] = useState({ score: 9, comment: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, sRes, rnRes] = await Promise.all([getPostVenta(), getPostVentaSummary(), getRenewals()]);
      setRecords(rRes.data.data || []);
      setSummary(sRes.data.data);
      setRenewals(rnRes.data.data || []);
    } catch { toast('Error al cargar post-venta', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSync = async () => {
    try {
      const r = await syncPostVenta();
      toast(`${r.data.data.synced} clientes sincronizados desde leads ganados`, 'success');
      load();
    } catch { toast('Error al sincronizar', 'error'); }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await updatePostVenta(id, { status });
      toast('Estado actualizado', 'success');
      load();
    } catch { toast('Error', 'error'); }
  };

  const handleSubmitNPS = async (e) => {
    e.preventDefault();
    try {
      await submitNPS(npsModal._id, npsForm);
      toast('NPS registrado', 'success');
      setNpsModal(null);
      setNpsForm({ score: 9, comment: '' });
      load();
    } catch { toast('Error al guardar NPS', 'error'); }
  };

  if (loading) return <div className="loading"><div className="spinner" />Cargando post-venta...</div>;

  const npsClients = records.filter(r => r.npsScore !== undefined && r.npsScore !== null);
  const avgNPS = npsClients.length ? (npsClients.reduce((a, r) => a + r.npsScore, 0) / npsClients.length).toFixed(1) : '—';
  const promoters = npsClients.filter(r => r.npsScore >= 9).length;
  const detractors = npsClients.filter(r => r.npsScore <= 6).length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Post-Venta</div>
          <div className="page-sub">Gestión de clientes activos, NPS y renovaciones de ACON Internacional</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={handleSync} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={13} /> Sincronizar Ganados
        </button>
      </div>

      {/* KPIs */}
      {summary && (
        <div className="stats-grid" style={{ marginBottom: 20 }}>
          {[
            { label: 'Clientes Activos', value: summary.active || 0, Icon: CheckCircle2, color: '#16A34A' },
            { label: 'En Riesgo', value: summary.atRisk || 0, Icon: AlertTriangle, color: '#F59E0B' },
            { label: 'NPS Promedio', value: avgNPS, Icon: Star, color: '#F2641E' },
            { label: 'Revenue Total', value: `$${((summary.totalRevenue || 0) / 1000).toFixed(0)}K`, Icon: DollarSign, color: '#0B2545' },
          ].map(({ label, value, Icon, color }) => (
            <div key={label} className="stat-card">
              <div className="stat-icon" style={{ background: `${color}14`, color }}><Icon size={18} /></div>
              <div className="stat-label">{label}</div>
              <div className="stat-value">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--gray-200)', marginBottom: 20 }}>
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 20px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: 'transparent', color: tab === id ? '#0B2545' : '#9AA3AE',
            borderBottom: tab === id ? '2px solid #F2641E' : '2px solid transparent',
          }}>
            <Icon size={14} strokeWidth={1.75} /> {label}
          </button>
        ))}
      </div>

      {/* ── CLIENTS ── */}
      {tab === 'clients' && (
        records.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <HeartHandshake size={40} color="#9AA3AE" />
              <p style={{ color: '#9AA3AE' }}>No hay clientes en post-venta.<br />Sincroniza los leads ganados primero.</p>
              <button className="btn btn-primary btn-sm" onClick={handleSync}><RefreshCw size={13} /> Sincronizar</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {records.map(r => (
              <div key={r._id} className="card" style={{ padding: '14px 20px', borderLeft: `4px solid ${STATUS_COLORS[r.status]}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#0B2545' }}>{r.lead?.company || '—'}</div>
                      <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${STATUS_COLORS[r.status]}14`, color: STATUS_COLORS[r.status] }}>
                        {STATUS_LABELS[r.status]}
                      </span>
                      {r.npsScore !== null && r.npsScore !== undefined && (
                        <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${NPS_COLOR(r.npsScore)}14`, color: NPS_COLOR(r.npsScore) }}>
                          NPS {r.npsScore}/10
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#9AA3AE' }}>
                      <span>Servicios: <strong style={{ color: '#5A6472' }}>{(r.services || []).join(', ') || '—'}</strong></span>
                      <span>Revenue: <strong style={{ color: '#16A34A' }}>${((r.totalRevenue || 0)).toLocaleString()} USD</strong></span>
                      {r.shipmentCount > 0 && <span>Embarques: <strong style={{ color: '#2563EB' }}>{r.shipmentCount}</strong></span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setNpsModal(r)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Star size={12} /> NPS
                    </button>
                    <select
                      value={r.status}
                      onChange={e => handleStatusChange(r._id, e.target.value)}
                      style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid #E3E6EA', fontSize: 12, background: '#fff', cursor: 'pointer' }}
                    >
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── NPS ── */}
      {tab === 'nps' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'NPS Promedio', value: avgNPS, color: '#F2641E', Icon: Star, desc: 'Escala del 0 al 10' },
              { label: 'Promotores', value: promoters, color: '#16A34A', Icon: TrendingUp, desc: 'Score 9-10' },
              { label: 'Detractores', value: detractors, color: '#DC2626', Icon: AlertTriangle, desc: 'Score 0-6' },
            ].map(({ label, value, color, Icon, desc }) => (
              <div key={label} className="card" style={{ textAlign: 'center', borderTop: `3px solid ${color}` }}>
                <Icon size={24} color={color} style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 32, fontWeight: 800, color }}>{value}</div>
                <div style={{ fontWeight: 600, color: '#0B2545', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: '#9AA3AE' }}>{desc}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <div style={{ fontWeight: 700, color: '#0B2545', marginBottom: 16 }}>Encuestas de Satisfacción</div>
            {npsClients.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#9AA3AE', fontSize: 13 }}>
                No hay encuestas NPS registradas aún. Haz clic en "NPS" en un cliente activo.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {npsClients.map(r => (
                  <div key={r._id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: '#F9FAFB', borderRadius: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: `${NPS_COLOR(r.npsScore)}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: NPS_COLOR(r.npsScore) }}>{r.npsScore}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#0B2545' }}>{r.lead?.company}</div>
                      {r.npsComment && <div style={{ fontSize: 12, color: '#5A6472', marginTop: 2, fontStyle: 'italic' }}>"{r.npsComment}"</div>}
                    </div>
                    <span style={{ fontSize: 11, color: '#9AA3AE' }}>{new Date(r.updatedAt).toLocaleDateString('es-MX')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── RENEWALS ── */}
      {tab === 'renewals' && (
        renewals.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <Clock size={40} color="#9AA3AE" />
              <p style={{ color: '#9AA3AE' }}>No hay renovaciones próximas en los siguientes 30 días.</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {renewals.map(r => {
              const daysLeft = Math.ceil((new Date(r.nextRenewalDate) - new Date()) / (1000 * 60 * 60 * 24));
              return (
                <div key={r._id} className="card" style={{ padding: '14px 20px', borderLeft: `4px solid ${daysLeft <= 7 ? '#DC2626' : daysLeft <= 14 ? '#F59E0B' : '#2563EB'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#0B2545', marginBottom: 4 }}>{r.lead?.company}</div>
                      <div style={{ fontSize: 12, color: '#9AA3AE' }}>Renovación: {new Date(r.nextRenewalDate).toLocaleDateString('es-MX')} · Revenue: ${(r.totalRevenue || 0).toLocaleString()} USD</div>
                    </div>
                    <div style={{
                      padding: '6px 14px', borderRadius: 20, fontWeight: 700, fontSize: 12,
                      background: daysLeft <= 7 ? '#FEE2E2' : daysLeft <= 14 ? '#FEF3C7' : '#DBEAFE',
                      color: daysLeft <= 7 ? '#DC2626' : daysLeft <= 14 ? '#D97706' : '#2563EB',
                    }}>
                      {daysLeft === 0 ? 'Hoy' : `${daysLeft} días`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* NPS Modal */}
      {npsModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <div className="modal-title">Encuesta NPS — {npsModal.lead?.company}</div>
            </div>
            <form onSubmit={handleSubmitNPS} style={{ padding: '16px 20px' }}>
              <div className="form-group">
                <label className="form-label">¿Qué probabilidad hay de que recomienden ACON? (0-10)</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                    <button key={n} type="button" onClick={() => setNpsForm(f => ({...f, score: n}))} style={{
                      width: 36, height: 36, borderRadius: 8, border: '2px solid', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                      background: npsForm.score === n ? NPS_COLOR(n) : '#fff',
                      color: npsForm.score === n ? '#fff' : NPS_COLOR(n),
                      borderColor: NPS_COLOR(n),
                    }}>{n}</button>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: '#9AA3AE' }}>
                  {npsForm.score >= 9 ? '😊 Promotor — recomendaría activamente' : npsForm.score >= 7 ? '😐 Pasivo — satisfecho pero no activo' : '😞 Detractor — hay áreas de mejora'}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Comentario (opcional)</label>
                <textarea className="form-input" rows={3} placeholder="¿Qué podemos mejorar?" value={npsForm.comment} onChange={e => setNpsForm(f => ({...f, comment: e.target.value}))} />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">Guardar NPS</button>
                <button type="button" className="btn btn-ghost" onClick={() => setNpsModal(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
