import React, { useState, useEffect } from 'react';
import { getQuotes, createQuote, updateQuoteStatus, deleteQuote, getLeads } from '../services/api';
import { useAuth } from '../context/AuthContext';
import QuotePreviewModal from '../components/QuotePreviewModal';
import {
  Calculator, Plus, FileDown, Trash2, Send, Check, X,
  Anchor, Plane, Truck, Warehouse, BadgeCheck, Search,
  Eye, Copy, ChevronDown, ChevronUp, PlusCircle, MinusCircle
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────────
const SERVICE_TYPES = [
  { id: 'maritimo_fcl',        label: 'Marítimo FCL',          Icon: Anchor,     color: '#2563EB' },
  { id: 'maritimo_lcl',        label: 'Marítimo LCL',          Icon: Anchor,     color: '#2563EB' },
  { id: 'aereo',               label: 'Aéreo',                 Icon: Plane,      color: '#7C3AED' },
  { id: 'terrestre_full',      label: 'Terrestre Full',        Icon: Truck,      color: '#F2641E' },
  { id: 'terrestre_sencillo',  label: 'Terrestre Sencillo',    Icon: Truck,      color: '#F2641E' },
  { id: 'terrestre_economico', label: 'Terrestre Económico',   Icon: Truck,      color: '#F2641E' },
  { id: 'almacenaje',          label: 'Almacenaje',            Icon: Warehouse,  color: '#CA8A04' },
  { id: 'aduanal_importacion', label: 'Aduanal Importación',   Icon: BadgeCheck, color: '#16A34A' },
  { id: 'aduanal_exportacion', label: 'Aduanal Exportación',   Icon: BadgeCheck, color: '#16A34A' },
];

const IS_MARITIME = (svc) => svc === 'maritimo_fcl' || svc === 'maritimo_lcl';

const DEFAULT_ITEMS = {
  maritimo_fcl: [
    { concept: 'Flete marítimo FCL', unit: 'Contenedor', qty: 1, unitPrice: 0, currency: 'USD' },
    { concept: 'THC Origen', unit: 'Global', qty: 1, unitPrice: 0, currency: 'USD' },
    { concept: 'THC Destino', unit: 'Global', qty: 1, unitPrice: 0, currency: 'USD' },
    { concept: 'BL Fee', unit: 'Global', qty: 1, unitPrice: 0, currency: 'USD' },
    { concept: 'Seguro de carga (0.3%)', unit: 'Global', qty: 1, unitPrice: 0, currency: 'USD' },
    { concept: 'Honorarios aduanales', unit: 'Global', qty: 1, unitPrice: 0, currency: 'MXN' },
    { concept: 'DTA / IGI (estimado)', unit: 'Global', qty: 1, unitPrice: 0, currency: 'MXN' },
  ],
  maritimo_lcl: [
    { concept: 'Flete marítimo LCL', unit: 'CBM', qty: 1, unitPrice: 0, currency: 'USD' },
    { concept: 'CFS Origen', unit: 'CBM', qty: 1, unitPrice: 0, currency: 'USD' },
    { concept: 'CFS Destino', unit: 'CBM', qty: 1, unitPrice: 0, currency: 'USD' },
    { concept: 'BL Fee', unit: 'Global', qty: 1, unitPrice: 0, currency: 'USD' },
    { concept: 'Seguro de carga', unit: 'Global', qty: 1, unitPrice: 0, currency: 'USD' },
    { concept: 'Honorarios aduanales', unit: 'Global', qty: 1, unitPrice: 0, currency: 'MXN' },
  ],
  aereo: [
    { concept: 'Flete aéreo', unit: 'kg', qty: 1, unitPrice: 0, currency: 'USD' },
    { concept: 'Recargo combustible (FSC)', unit: 'kg', qty: 1, unitPrice: 0, currency: 'USD' },
    { concept: 'Airport fees', unit: 'Global', qty: 1, unitPrice: 0, currency: 'USD' },
    { concept: 'Seguro de carga', unit: 'Global', qty: 1, unitPrice: 0, currency: 'USD' },
    { concept: 'Honorarios aduanales', unit: 'Global', qty: 1, unitPrice: 0, currency: 'MXN' },
    { concept: 'DTA / IGI (estimado)', unit: 'Global', qty: 1, unitPrice: 0, currency: 'MXN' },
  ],
  terrestre_full: [
    { concept: 'Flete terrestre full', unit: 'Viaje', qty: 1, unitPrice: 0, currency: 'MXN' },
    { concept: 'Seguro de carga', unit: 'Global', qty: 1, unitPrice: 0, currency: 'MXN' },
    { concept: 'Maniobras de carga/descarga', unit: 'Global', qty: 1, unitPrice: 0, currency: 'MXN' },
  ],
  terrestre_sencillo: [
    { concept: 'Flete terrestre sencillo', unit: 'Viaje', qty: 1, unitPrice: 0, currency: 'MXN' },
    { concept: 'Seguro de carga', unit: 'Global', qty: 1, unitPrice: 0, currency: 'MXN' },
  ],
  terrestre_economico: [
    { concept: 'Flete terrestre económico', unit: 'Viaje', qty: 1, unitPrice: 0, currency: 'MXN' },
  ],
  almacenaje: [
    { concept: 'Almacenaje mensual', unit: 'Pallet/mes', qty: 1, unitPrice: 0, currency: 'MXN' },
    { concept: 'Recepción de mercancía', unit: 'Global', qty: 1, unitPrice: 0, currency: 'MXN' },
    { concept: 'Maniobras', unit: 'Pallet', qty: 1, unitPrice: 0, currency: 'MXN' },
  ],
  aduanal_importacion: [
    { concept: 'Honorarios aduanales (importación)', unit: 'Pedimento', qty: 1, unitPrice: 0, currency: 'MXN' },
    { concept: 'DTA', unit: 'Global', qty: 1, unitPrice: 0, currency: 'MXN' },
    { concept: 'IGI (estimado)', unit: 'Global', qty: 1, unitPrice: 0, currency: 'MXN' },
    { concept: 'Gestión de previo', unit: 'Global', qty: 1, unitPrice: 0, currency: 'MXN' },
  ],
  aduanal_exportacion: [
    { concept: 'Honorarios aduanales (exportación)', unit: 'Pedimento', qty: 1, unitPrice: 0, currency: 'MXN' },
    { concept: 'Gestión documental', unit: 'Global', qty: 1, unitPrice: 0, currency: 'MXN' },
  ],
};

const INCOTERMS = ['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'];

const STATUS_MAP = {
  draft:    { label: 'Borrador',  bg: '#F4F5F7', color: '#5A6472' },
  sent:     { label: 'Enviada',   bg: '#DBEAFE', color: '#2563EB' },
  accepted: { label: 'Aceptada', bg: '#DCFCE7', color: '#16A34A' },
  rejected: { label: 'Rechazada',bg: '#FEE2E2', color: '#DC2626' },
  expired:  { label: 'Vencida',  bg: '#F4F5F7', color: '#9AA3AE' },
};

const FREQUENT_PORTS = [
  'Manzanillo, MX','Lázaro Cárdenas, MX','Veracruz, MX','Altamira, MX',
  'Shanghai, CN','Ningbo, CN','Guangzhou, CN','Long Beach, US','Los Ángeles, US',
  'Ciudad de México, MX','Guadalajara, MX','Monterrey, MX',
  'Aeropuerto MEX','Aeropuerto GDL','Aeropuerto LAX',
  'Vitória, BR','Santos, BR','Rio de Janeiro, BR','Navegantes, BR',
];

const EMPTY_ROUTE = { origen: '', pol: '', pod: '', transitDays: '', price20: '', price40: '', price40HC: '', currency: 'USD' };

const EMPTY_FORM = {
  serviceType: 'maritimo_fcl',
  clientName: '', clientEmail: '', clientPhone: '',
  contactName: '', clientAddress: '',
  salesRep: '', paymentTerms: 'Due on receipt service',
  origin: '', destination: '',
  incoterm: 'FOB', carrier: '',
  containerType: '', weight: '', volume: '', units: '', commodity: '',
  items: DEFAULT_ITEMS['maritimo_fcl'],
  routes: [{ ...EMPTY_ROUTE }],
  additionalCharges: { docFee: 120, releaseFee: 55, cartaGarantia: 'Aplicable', freeDays: 21 },
  currency: 'USD', exchangeRate: 17,
  validity: 15,
  notes: '',
  terms: 'Asegure su carga (COBERTURA TOTAL – TODO RIESGO). NO nos haremos responsables de ningún daño, retraso o pérdida monetaria de ningún tipo si decide no contratar el seguro. El equipo y el espacio están sujetos a disponibilidad. Pueden aplicarse costos de reposición. Las tarifas están sujetas a cambios sin previo aviso. No seremos responsables por caso fortuito o fuerza mayor: demoras climáticas, tormentas, inundaciones, guerra, incendios, entre otros.',
  lead: '',
};

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
  const [showRoutes, setShowRoutes] = useState(true);

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

  const f = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const handleServiceChange = (svc) => {
    setForm(p => ({
      ...p,
      serviceType: svc,
      items: (DEFAULT_ITEMS[svc] || []).map(i => ({ ...i })),
      routes: IS_MARITIME(svc) ? (p.routes?.length ? p.routes : [{ ...EMPTY_ROUTE }]) : [],
    }));
    setShowRoutes(IS_MARITIME(svc));
  };

  const handleLeadSelect = (leadId) => {
    const lead = leads.find(l => l._id === leadId);
    if (lead) {
      f('lead', leadId);
      f('clientName', lead.company || '');
      f('clientEmail', typeof lead.contact === 'object' ? lead.contact?.email : lead.email || '');
      f('contactName', typeof lead.contact === 'object' ? lead.contact?.name : lead.contact || '');
      f('clientPhone', typeof lead.contact === 'object' ? lead.contact?.whatsapp : lead.whatsapp || '');
    }
  };

  // Items (conceptos)
  const setItem = (i, key, val) => {
    const items = [...form.items];
    items[i] = { ...items[i], [key]: key === 'qty' || key === 'unitPrice' ? Number(val) : val };
    f('items', items);
  };
  const addItem = () => f('items', [...form.items, { concept: '', unit: 'Global', qty: 1, unitPrice: 0, currency: 'USD' }]);
  const removeItem = (i) => f('items', form.items.filter((_, idx) => idx !== i));

  // Routes
  const setRoute = (i, key, val) => {
    const routes = [...form.routes];
    routes[i] = { ...routes[i], [key]: val };
    f('routes', routes);
  };
  const addRoute = () => f('routes', [...(form.routes || []), { ...EMPTY_ROUTE }]);
  const removeRoute = (i) => f('routes', form.routes.filter((_, idx) => idx !== i));

  // Additional charges
  const setAC = (key, val) => setForm(p => ({
    ...p,
    additionalCharges: { ...p.additionalCharges, [key]: val }
  }));

  const totalUSD = form.items.filter(i => i.currency === 'USD').reduce((s, i) => s + (i.qty || 1) * (i.unitPrice || 0), 0);
  const totalMXN = form.items.filter(i => i.currency === 'MXN').reduce((s, i) => s + (i.qty || 1) * (i.unitPrice || 0), 0);

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

  const isMaritime = IS_MARITIME(form.serviceType);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Cotizador ACON</div>
          <div className="page-sub">{quotes.length} cotizaciones · genera documentos con diseño de marca</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Nueva Cotización
        </button>
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
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}><Plus size={13} /> Nueva Cotización</button>
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
                          {q.status === 'draft' && (
                            <button className="btn btn-primary btn-sm" onClick={() => handleStatusChange(q._id, 'sent')} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Send size={12} /> Enviada
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

      {/* ── Modal: Nueva cotización ── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 860, width: '95vw' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calculator size={18} style={{ color: 'var(--orange-500)' }} /> Nueva Cotización ACON
              </div>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>

            <div style={{ maxHeight: '78vh', overflowY: 'auto', paddingRight: 4 }}>

              {/* ── Tipo de servicio ── */}
              <div className="form-group">
                <label className="form-label">Tipo de Servicio *</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SERVICE_TYPES.map(s => (
                    <button key={s.id} type="button"
                      className={`service-chip ${form.serviceType === s.id ? 'selected' : ''}`}
                      onClick={() => handleServiceChange(s.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <s.Icon size={13} strokeWidth={1.75} /> {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Lead / Cliente ── */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Lead relacionado</label>
                  <select className="form-select" value={form.lead} onChange={e => handleLeadSelect(e.target.value)}>
                    <option value="">— Sin lead —</option>
                    {leads.map(l => <option key={l._id} value={l._id}>{l.company}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Empresa / Cliente *</label>
                  <input className="form-input" value={form.clientName} onChange={e => f('clientName', e.target.value)} placeholder="Nombre de la empresa" />
                </div>
              </div>

              <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">Nombre de contacto</label>
                  <input className="form-input" value={form.contactName} onChange={e => f('contactName', e.target.value)} placeholder="Attn:" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.clientEmail} onChange={e => f('clientEmail', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono / WhatsApp</label>
                  <input className="form-input" value={form.clientPhone} onChange={e => f('clientPhone', e.target.value)} placeholder="+521..." />
                </div>
              </div>

              <div className="form-row" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">Dirección del cliente</label>
                  <input className="form-input" value={form.clientAddress} onChange={e => f('clientAddress', e.target.value)} placeholder="Parque Industrial..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Sales Rep</label>
                  <input className="form-input" value={form.salesRep} onChange={e => f('salesRep', e.target.value)} placeholder={user?.name || 'Nombre del vendedor'} />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Terms</label>
                  <input className="form-input" value={form.paymentTerms} onChange={e => f('paymentTerms', e.target.value)} />
                </div>
              </div>

              {/* ── Ruta principal ── */}
              <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">Origen general</label>
                  <input className="form-input" list="ports" value={form.origin} onChange={e => f('origin', e.target.value)} placeholder="País / ciudad" />
                </div>
                <div className="form-group">
                  <label className="form-label">Destino general</label>
                  <input className="form-input" list="ports" value={form.destination} onChange={e => f('destination', e.target.value)} placeholder="País / ciudad" />
                </div>
                <div className="form-group">
                  <label className="form-label">Incoterm</label>
                  <select className="form-select" value={form.incoterm} onChange={e => f('incoterm', e.target.value)}>
                    {INCOTERMS.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Naviera/Carrier</label>
                  <input className="form-input" value={form.carrier} onChange={e => f('carrier', e.target.value)} placeholder="Maersk..." />
                </div>
              </div>
              <datalist id="ports">
                {FREQUENT_PORTS.map(p => <option key={p} value={p} />)}
              </datalist>

              <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">Mercancía</label>
                  <input className="form-input" value={form.commodity} onChange={e => f('commodity', e.target.value)} placeholder="Descripción" />
                </div>
                <div className="form-group">
                  <label className="form-label">Contenedor</label>
                  <input className="form-input" value={form.containerType} onChange={e => f('containerType', e.target.value)} placeholder="20ft, 40ft..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Peso (kg)</label>
                  <input className="form-input" type="number" value={form.weight} onChange={e => f('weight', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Volumen (CBM)</label>
                  <input className="form-input" type="number" value={form.volume} onChange={e => f('volume', e.target.value)} />
                </div>
              </div>

              {/* ═══════════════════════════════════════════════════════
                  ROUTES TABLE — solo para marítimo FCL/LCL
                  ═══════════════════════════════════════════════════ */}
              {isMaritime && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>Tabla de Rutas y Tarifas (FCL)</span>
                      <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 400 }}>· Origen → POL → POD</span>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={addRoute} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <PlusCircle size={13} /> Agregar ruta
                    </button>
                  </div>

                  <div style={{ border: '1px solid var(--gray-200)', borderRadius: 10, overflow: 'hidden' }}>
                    {/* Table header */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1.2fr 0.8fr 0.8fr 0.9fr 0.9fr 0.7fr 28px',
                      gap: 6, padding: '8px 10px',
                      background: 'var(--navy-900)', color: 'white',
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>
                      <span>Origen</span>
                      <span>POL</span>
                      <span>POD</span>
                      <span>Transit</span>
                      <span>20'</span>
                      <span style={{ color: '#F2641E' }}>40'</span>
                      <span>40'HC</span>
                      <span>Moneda</span>
                      <span />
                    </div>

                    {(form.routes || []).map((route, i) => (
                      <div key={i} style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1.2fr 0.8fr 0.8fr 0.9fr 0.9fr 0.7fr 28px',
                        gap: 6, padding: '6px 10px',
                        background: i % 2 === 0 ? 'white' : 'var(--gray-50)',
                        borderTop: '1px solid var(--gray-100)',
                        alignItems: 'center',
                      }}>
                        <input className="form-input" style={{ fontSize: 11 }} value={route.origen} onChange={e => setRoute(i, 'origen', e.target.value)} placeholder="Vitória..." list="ports" />
                        <input className="form-input" style={{ fontSize: 11 }} value={route.pol} onChange={e => setRoute(i, 'pol', e.target.value)} placeholder="Vitória..." list="ports" />
                        <input className="form-input" style={{ fontSize: 11 }} value={route.pod} onChange={e => setRoute(i, 'pod', e.target.value)} placeholder="Manzanillo..." list="ports" />
                        <input className="form-input" style={{ fontSize: 11 }} value={route.transitDays} onChange={e => setRoute(i, 'transitDays', e.target.value)} placeholder="21-24 días" />
                        <input className="form-input" style={{ fontSize: 11 }} type="number" value={route.price20} onChange={e => setRoute(i, 'price20', e.target.value)} placeholder="2190" />
                        <input className="form-input" style={{ fontSize: 11, borderColor: '#F2641E' }} type="number" value={route.price40} onChange={e => setRoute(i, 'price40', e.target.value)} placeholder="3290" />
                        <input className="form-input" style={{ fontSize: 11 }} type="number" value={route.price40HC} onChange={e => setRoute(i, 'price40HC', e.target.value)} placeholder="3950" />
                        <select className="form-select" style={{ fontSize: 11 }} value={route.currency} onChange={e => setRoute(i, 'currency', e.target.value)}>
                          <option value="USD">USD</option>
                          <option value="MXN">MXN</option>
                        </select>
                        <button onClick={() => removeRoute(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 4 }}>
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Additional charges for FCL */}
                  <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy-900)', marginBottom: 10 }}>Cargos Adicionales</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">DOC FEE / BL (USD)</label>
                        <input className="form-input" type="number" value={form.additionalCharges?.docFee || ''} onChange={e => setAC('docFee', Number(e.target.value))} placeholder="120" />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Release FEE / CNTR (USD)</label>
                        <input className="form-input" type="number" value={form.additionalCharges?.releaseFee || ''} onChange={e => setAC('releaseFee', Number(e.target.value))} placeholder="55" />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Carta Garantía</label>
                        <input className="form-input" value={form.additionalCharges?.cartaGarantia || ''} onChange={e => setAC('cartaGarantia', e.target.value)} placeholder="Aplicable" />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Días libres de demoras</label>
                        <input className="form-input" type="number" value={form.additionalCharges?.freeDays || ''} onChange={e => setAC('freeDays', Number(e.target.value))} placeholder="21" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Partidas / Conceptos ── */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div className="section-title" style={{ margin: 0 }}><span>Partidas / Conceptos {isMaritime ? '(opcional, para cargos adicionales detallados)' : ''}</span></div>
                  <button className="btn btn-ghost btn-sm" onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={13} /> Agregar línea
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 0.8fr 0.6fr 1fr 0.7fr 28px', gap: 6, padding: '4px 0', fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px' }}>
                  <span>Concepto</span><span>Unidad</span><span>Cant.</span><span>P. Unitario</span><span>Moneda</span><span></span>
                </div>

                {form.items.map((item, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2.5fr 0.8fr 0.6fr 1fr 0.7fr 28px', gap: 6, marginBottom: 5, alignItems: 'center' }}>
                    <input className="form-input" value={item.concept} onChange={e => setItem(i, 'concept', e.target.value)} placeholder="Concepto..." style={{ fontSize: 12 }} />
                    <input className="form-input" value={item.unit} onChange={e => setItem(i, 'unit', e.target.value)} style={{ fontSize: 12 }} />
                    <input className="form-input" type="number" value={item.qty} onChange={e => setItem(i, 'qty', e.target.value)} style={{ fontSize: 12 }} />
                    <input className="form-input" type="number" value={item.unitPrice} onChange={e => setItem(i, 'unitPrice', e.target.value)} placeholder="0.00" style={{ fontSize: 12 }} />
                    <select className="form-select" value={item.currency} onChange={e => setItem(i, 'currency', e.target.value)} style={{ fontSize: 12 }}>
                      <option value="USD">USD</option>
                      <option value="MXN">MXN</option>
                    </select>
                    <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 4 }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}

                {(totalUSD > 0 || totalMXN > 0) && (
                  <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--navy-900)', borderRadius: 8, display: 'flex', gap: 24, justifyContent: 'flex-end' }}>
                    {totalUSD > 0 && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Total USD</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{totalUSD.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                      </div>
                    )}
                    {totalMXN > 0 && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Total MXN</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--orange-500)' }}>{totalMXN.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Config ── */}
              <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">Vigencia (días)</label>
                  <input className="form-input" type="number" value={form.validity} onChange={e => f('validity', Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo de cambio (USD→MXN)</label>
                  <input className="form-input" type="number" value={form.exchangeRate} onChange={e => f('exchangeRate', Number(e.target.value))} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Comentarios / Notas</label>
                <textarea className="form-input" rows={3} value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="Condiciones especiales, observaciones..." />
              </div>

              <div className="form-group">
                <label className="form-label">Términos y condiciones</label>
                <textarea className="form-input" rows={3} value={form.terms} onChange={e => f('terms', e.target.value)} />
              </div>

            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn btn-ghost" onClick={handleCreateAndPreview} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Eye size={14} /> Guardar y previsualizar
              </button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar cotización'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
