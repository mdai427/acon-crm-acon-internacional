import React, { useState, useEffect } from 'react';
import { getQuotes, createQuote, updateQuoteStatus, deleteQuote, getLeads, getExchangeRate, refreshExchangeRate, setManualExchangeRate, requestQuoteApproval, reviewQuote, getQuoteVersions, downloadQuotePDF } from '../services/api';
import { useAuth } from '../context/AuthContext';
import QuotePreviewModal from '../components/QuotePreviewModal';
import QuoteWizard from '../components/QuoteWizard';
import { SERVICE_TYPES, IS_MARITIME, STATUS_MAP, EMPTY_FORM, EMPTY_ROUTE } from '../constants/quotes';
import {
  Calculator, Plus, FileDown, Trash2, Send, Check, X,
  Search, Eye, DollarSign, History
} from 'lucide-react';

// ── Main Component ──────────────────────────────────────────────────────────────
export default function QuoterPage({ toast }) {
  const { user } = useAuth();
  const [quotes, setQuotes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState(EMPTY_FORM);
  const [leads, setLeads]     = useState([]);
  const [saving, setSaving]   = useState(false);
  const [search, setSearch]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [previewQuote, setPreviewQuote] = useState(null);
  const [dofRate, setDofRate] = useState(null);
  const [dofLoading, setDofLoading] = useState(false);
  const [editingRate, setEditingRate] = useState(false);
  const [manualRateInput, setManualRateInput] = useState('');

  // Cargar tipo de cambio DOF al montar
  useEffect(() => {
    getExchangeRate()
      .then(r => {
        const rate = r.data?.data;
        if (rate) {
          setDofRate(rate);
          setForm(p => ({ ...p, exchangeRate: rate.rate }));
        }
      })
      .catch(() => {});
  }, []);

  const handleRefreshRate = async () => {
    setDofLoading(true);
    try {
      const r = await refreshExchangeRate();
      const rate = r.data?.data;
      if (rate) {
        setDofRate(rate);
        setForm(p => ({ ...p, exchangeRate: rate.rate }));
        toast(`Tipo de cambio actualizado: $${rate.rate} MXN/USD`, 'success');
      }
    } catch { toast('Error al actualizar tipo de cambio', 'error'); }
    finally { setDofLoading(false); }
  };

  const handleManualRate = async () => {
    const val = parseFloat(manualRateInput);
    if (!val || val < 1) return toast('Valor inválido', 'error');
    try {
      await setManualExchangeRate(val);
      setDofRate(r => ({ ...r, rate: val, source: 'manual' }));
      setForm(p => ({ ...p, exchangeRate: val }));
      setEditingRate(false);
      toast(`Tipo de cambio manual: $${val} MXN/USD`, 'success');
    } catch { toast('Error al guardar tipo de cambio', 'error'); }
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      getQuotes({ search, status: statusFilter }),
      getLeads({ limit: 200 }),
    ]).then(([qr, lr]) => {
      setQuotes(qr.data.data || []);
      setLeads(lr.data.data || []);
    }).catch(() => toast('Error al cargar', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, statusFilter]);

  // Arranca el asistente en limpio, clonando arreglos para no reusar las
  // referencias de EMPTY_FORM entre cotizaciones. Conserva el tipo de cambio ya
  // consultado al DOF.
  const openWizard = () => {
    setForm(prev => ({
      ...EMPTY_FORM,
      items: EMPTY_FORM.items.map(i => ({ ...i })),
      routes: [{ ...EMPTY_ROUTE }],
      additionalCharges: { ...EMPTY_FORM.additionalCharges },
      exchangeRate: prev.exchangeRate,
      salesRep: user?.name || '',
    }));
    setShowForm(true);
  };

  const handleCreate = async () => {
    if (!form.clientName) return toast('El nombre del cliente es requerido', 'error');
    setSaving(true);
    try {
      const payload = {
        ...form,
        routes: IS_MARITIME(form.serviceType) ? form.routes : [],
      };
      const r = await createQuote(payload);
      toast(`Cotización ${r.data.data.folio} creada`, 'success');
      setShowForm(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      toast(e.response?.data?.message || 'Error al crear cotización', 'error');
    } finally { setSaving(false); }
  };

  const handleCreateAndPreview = async () => {
    if (!form.clientName) return toast('El nombre del cliente es requerido', 'error');
    setSaving(true);
    try {
      const payload = { ...form, routes: IS_MARITIME(form.serviceType) ? form.routes : [] };
      const r = await createQuote(payload);
      toast(`${r.data.data.folio} creada`, 'success');
      setShowForm(false);
      setForm(EMPTY_FORM);
      load();
      setPreviewQuote(r.data.data);
    } catch (e) {
      toast('Error', 'error');
    } finally { setSaving(false); }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await updateQuoteStatus(id, status);
      toast('Estado actualizado', 'success');
      load();
    } catch { toast('Error al actualizar', 'error'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta cotización?')) return;
    try {
      await deleteQuote(id);
      toast('Cotización eliminada', 'success');
      load();
    } catch { toast('Error al eliminar', 'error'); }
  };

  const handleDownloadPDF = async (q) => {
    try {
      const r = await downloadQuotePDF(q._id);
      const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${q.folio || 'cotizacion'}.pdf`;
      a.click();
      toast('PDF descargado', 'success');
    } catch { toast('Error al generar PDF', 'error'); }
  };

  const [versionsModal, setVersionsModal] = useState(null); // { quoteId, folio, data }
  const handleViewVersions = async (q) => {
    try {
      const r = await getQuoteVersions(q._id);
      setVersionsModal({ quoteId: q._id, folio: q.folio, data: r.data.data || [] });
    } catch { toast('Error al cargar versiones', 'error'); }
  };

  const handleRequestApproval = async (id, folio) => {
    if (!window.confirm(`¿Enviar cotización ${folio} a aprobación de gerencia?`)) return;
    try {
      await requestQuoteApproval(id);
      toast('Cotización enviada a aprobación', 'success');
      load();
    } catch { toast('Error al solicitar aprobación', 'error'); }
  };

  const handleReview = async (id, folio, decision) => {
    const comments = decision === 'rejected'
      ? window.prompt(`Motivo del rechazo para ${folio}:`)
      : null;
    if (decision === 'rejected' && comments === null) return; // canceló el prompt
    try {
      await reviewQuote(id, { decision, comments });
      toast(decision === 'approved' ? 'Cotización aprobada ✓' : 'Cotización rechazada', decision === 'approved' ? 'success' : 'error');
      load();
    } catch { toast('Error al revisar', 'error'); }
  };

  if (showForm) {
    return (
      <QuoteWizard
        form={form}
        setForm={setForm}
        leads={leads}
        user={user}
        saving={saving}
        toast={toast}
        onCancel={() => setShowForm(false)}
        onSave={handleCreate}
        onSaveAndPreview={handleCreateAndPreview}
        onLeadCreated={(lead) => setLeads(ls => [lead, ...ls])}
      />
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Cotizador ACON</div>
          <div className="page-sub">{quotes.length} cotizaciones · genera documentos con diseño de marca</div>
        </div>
        <button className="btn btn-primary" onClick={openWizard} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Nueva Cotización
        </button>
      </div>

      {/* Widget Tipo de Cambio DOF */}
      <div className="card card-sm" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--blue-50, #EFF6FF)', borderColor: 'var(--blue-200, #BFDBFE)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <DollarSign size={15} color="#2563EB" />
          <span style={{ fontWeight: 600, color: 'var(--gray-800)', fontSize: 13 }}>Tipo de cambio DOF:</span>
          {dofRate ? (
            <>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#2563EB' }}>${dofRate.rate?.toFixed(4)} MXN/USD</span>
              <span style={{ fontSize: 11, color: 'var(--gray-500)', background: dofRate.source === 'manual' ? '#FEF9C3' : '#DCFCE7', padding: '2px 8px', borderRadius: 20 }}>
                {dofRate.source === 'manual' ? 'Manual' : dofRate.source === 'dof' ? 'DOF oficial' : 'Caché'} · {dofRate.date}
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--gray-400)', fontSize: 13 }}>Cargando...</span>
          )}
        </div>
        {editingRate ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="number" step="0.01" placeholder="Ej: 17.45" value={manualRateInput} onChange={e => setManualRateInput(e.target.value)}
              style={{ width: 110, padding: '4px 8px', border: '1px solid var(--blue-300, #93C5FD)', borderRadius: 6, fontSize: 13 }} />
            <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={handleManualRate}>Guardar</button>
            <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setEditingRate(false)}>Cancelar</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            {user?.role === 'admin' && (
              <>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => { setManualRateInput(dofRate?.rate || ''); setEditingRate(true); }}>Ajustar manual</button>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={handleRefreshRate} disabled={dofLoading}>
                  {dofLoading ? 'Actualizando...' : '↻ Actualizar DOF'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="card card-sm" style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
          <input className="form-input" style={{ paddingLeft: 30 }} placeholder="Buscar folio, cliente..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading"><div className="spinner" />Cargando cotizaciones...</div>
        ) : quotes.length === 0 ? (
          <div className="empty-state">
            <Calculator size={44} />
            <p>No hay cotizaciones. ¡Crea la primera!</p>
            <button className="btn btn-primary btn-sm" onClick={openWizard}><Plus size={13} /> Nueva Cotización</button>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Folio</th><th>Cliente</th><th>Servicio</th><th>Ruta</th>
                  <th>Total</th><th>Validez</th><th>Estado</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map(q => {
                  const svc = SERVICE_TYPES.find(s => s.id === q.serviceType);
                  const st  = STATUS_MAP[q.status] || STATUS_MAP.draft;
                  const expired = q.validUntil && new Date(q.validUntil) < new Date() && q.status === 'sent';
                  return (
                    <tr key={q._id}>
                      <td>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--navy-900)', fontSize: 13 }}>{q.folio}</div>
                        <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>{new Date(q.createdAt).toLocaleDateString('es-MX')}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{q.clientName || q.lead?.company || '—'}</div>
                        {q.contactName && <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{q.contactName}</div>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: svc?.color || 'var(--gray-500)' }}>
                          {svc && <svc.Icon size={13} strokeWidth={1.75} />}
                          {svc?.label || q.serviceType}
                        </div>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                        {q.origin && q.destination ? `${q.origin} → ${q.destination}` : '—'}
                      </td>
                      <td>
                        {q.totalUSD > 0 && <div style={{ fontWeight: 700, color: 'var(--navy-900)', fontSize: 13 }}>USD {q.totalUSD.toLocaleString('es-MX', { minimumFractionDigits: 0 })}</div>}
                        {q.totalMXN > 0 && <div style={{ fontWeight: q.totalUSD > 0 ? 400 : 700, color: q.totalUSD > 0 ? 'var(--gray-500)' : 'var(--navy-900)', fontSize: q.totalUSD > 0 ? 11 : 13 }}>MXN {q.totalMXN.toLocaleString('es-MX', { minimumFractionDigits: 0 })}</div>}
                        {q.routes?.length > 0 && !q.totalUSD && (
                          <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>{q.routes.length} rutas FCL</div>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: expired ? 'var(--red)' : 'var(--gray-500)' }}>
                        {q.validUntil ? new Date(q.validUntil).toLocaleDateString('es-MX') : '—'}
                        {expired && <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 600 }}>VENCIDA</div>}
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>
                          {st.label}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {/* Preview button */}
                          <button className="btn btn-ghost btn-sm" title="Vista previa / PDF" onClick={() => setPreviewQuote(q)} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f97316' }}>
                            <Eye size={13} /> Vista previa
                          </button>
                          {/* Flujo de aprobación */}
                          {q.status === 'draft' && (
                            <button className="btn btn-ghost btn-sm" onClick={() => handleRequestApproval(q._id, q.folio)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                              ✉ Pedir aprobación
                            </button>
                          )}
                          {q.status === 'pending_approval' && user?.role === 'admin' && (
                            <>
                              <button className="btn btn-sm" style={{ background: '#DCFCE7', color: '#16A34A', border: 'none', cursor: 'pointer', fontSize: 11 }} onClick={() => handleReview(q._id, q.folio, 'approved')}>
                                ✓ Aprobar
                              </button>
                              <button className="btn btn-sm" style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer', fontSize: 11 }} onClick={() => handleReview(q._id, q.folio, 'rejected')}>
                                ✗ Rechazar
                              </button>
                            </>
                          )}
                          {q.status === 'approved' && (
                            <button className="btn btn-primary btn-sm" onClick={() => handleStatusChange(q._id, 'sent')} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Send size={12} /> Enviar cliente
                            </button>
                          )}
                          {q.status === 'sent' && (
                            <>
                              <button className="btn btn-sm" style={{ background: '#DCFCE7', color: '#16A34A', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => handleStatusChange(q._id, 'accepted')}>
                                <Check size={12} />
                              </button>
                              <button className="btn btn-sm" style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => handleStatusChange(q._id, 'rejected')}>
                                <X size={12} />
                              </button>
                            </>
                          )}
                          <button className="btn btn-ghost btn-sm" title="Descargar PDF" onClick={() => handleDownloadPDF(q)} style={{ padding: '5px 8px', color: 'var(--primary)' }}>
                            <FileDown size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm" title="Historial de versiones" onClick={() => handleViewVersions(q)} style={{ padding: '5px 8px' }}>
                            <History size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(q._id)} style={{ color: 'var(--red)', padding: '5px 8px' }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Preview Modal ── */}
      {previewQuote && (
        <QuotePreviewModal
          quote={previewQuote}
          user={user}
          onClose={() => setPreviewQuote(null)}
        />
      )}

      {/* Versions Modal */}
      {versionsModal && (
        <div className="modal-overlay" onClick={() => setVersionsModal(null)}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Historial de versiones — {versionsModal.folio}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setVersionsModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {versionsModal.data.length === 0 ? (
                <div style={{ color: 'var(--text3)', textAlign: 'center', padding: '24px 0' }}>Sin versiones guardadas aún.<br /><small>Las versiones se crean automáticamente al editar la cotización.</small></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {versionsModal.data.map((v, i) => (
                    <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>Versión {v.versionNumber}</div>
                        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                          {v.savedBy?.name || 'Sistema'} · {new Date(v.savedAt).toLocaleString('es-MX')}
                        </div>
                      </div>
                      {v.snapshot && (
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6, display: 'flex', gap: 16 }}>
                          <span>Total USD: <strong>${(v.snapshot.totalUSD || 0).toLocaleString()}</strong></span>
                          <span>Total MXN: <strong>${(v.snapshot.totalMXN || 0).toLocaleString()}</strong></span>
                          <span>Estado: <strong>{v.snapshot.status || '—'}</strong></span>
                          <span>Partidas: <strong>{v.snapshot.items?.length || 0}</strong></span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
