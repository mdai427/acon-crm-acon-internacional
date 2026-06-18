import React, { useState, useEffect } from 'react';
import { getQuotes, createQuote, updateQuoteStatus, deleteQuote, getLeads } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Calculator, Plus, FileDown, Trash2, Send, Check, X,
  Anchor, Plane, Truck, Warehouse, BadgeCheck, ChevronDown, Search
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────
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

// Conceptos predefinidos por tipo de servicio
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
];

const EMPTY_FORM = {
  serviceType: 'maritimo_fcl', clientName: '', clientEmail: '', clientPhone: '',
  contactName: '', origin: '', destination: '', incoterm: 'EXW', carrier: '',
  containerType: '', weight: '', volume: '', units: '', commodity: '',
  items: DEFAULT_ITEMS['maritimo_fcl'], currency: 'USD', exchangeRate: 17,
  validity: 15, notes: '', terms: 'Precios sujetos a disponibilidad de espacio. Vigencia de la cotización: 15 días naturales. Tarifas no incluyen impuestos de importación (IGI, IVA) a menos que se indique.',
  lead: '',
};

// ── PDF Generator ───────────────────────────────────────────────────────────
async function generatePDF(quote, user) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, margin = 15;
  let y = 0;

  const navy = [11, 37, 69];
  const orange = [242, 100, 30];
  const gray = [90, 100, 114];
  const lightGray = [244, 245, 247];

  // ── Header ──
  doc.setFillColor(...navy);
  doc.rect(0, 0, W, 38, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('ACON', margin, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Internacional · Worldwide Logística', margin + 22, 16);

  doc.setFontSize(9);
  doc.setTextColor(200, 210, 225);
  doc.text('sarahi.noriega@aconinternacional.com', margin, 24);
  doc.text('www.aconinternacional.com', margin, 29);

  // Folio + estado
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(242, 100, 30);
  doc.text(quote.folio || 'COTIZACIÓN', W - margin, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(200, 210, 225);
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-MX')}`, W - margin, 22, { align: 'right' });
  doc.text(`Vigencia: ${quote.validity || 15} días`, W - margin, 27, { align: 'right' });
  doc.text(`Válida hasta: ${quote.validUntil ? new Date(quote.validUntil).toLocaleDateString('es-MX') : '—'}`, W - margin, 32, { align: 'right' });

  y = 48;

  // ── Datos del cliente + servicio ──
  doc.setFillColor(...lightGray);
  doc.rect(margin, y, W - 2 * margin, 28, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...gray);
  doc.text('CLIENTE', margin + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(26, 31, 46);
  doc.text(quote.clientName || '—', margin + 4, y + 12);
  doc.setFontSize(8.5);
  doc.setTextColor(...gray);
  doc.text(quote.contactName ? `Attn: ${quote.contactName}` : '', margin + 4, y + 18);
  doc.text(quote.clientEmail || '', margin + 4, y + 23);

  // Servicio
  const svc = SERVICE_TYPES.find(s => s.id === quote.serviceType);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...gray);
  doc.text('SERVICIO', W / 2, y + 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text(svc?.label || quote.serviceType, W / 2, y + 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...gray);
  if (quote.origin)      doc.text(`Origen: ${quote.origin}`, W / 2, y + 18);
  if (quote.destination) doc.text(`Destino: ${quote.destination}`, W / 2, y + 23);

  // Incoterm + carrier
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...gray);
  doc.text('INCOTERM / NAVIERA', W - margin - 50, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(26, 31, 46);
  doc.text(quote.incoterm || '—', W - margin - 50, y + 12);
  doc.setFontSize(8.5);
  doc.setTextColor(...gray);
  if (quote.carrier) doc.text(quote.carrier, W - margin - 50, y + 18);
  if (quote.containerType) doc.text(quote.containerType, W - margin - 50, y + 23);

  y += 36;

  // ── Detalles de carga ──
  const cargoItems = [
    quote.commodity && `Mercancía: ${quote.commodity}`,
    quote.weight && `Peso: ${quote.weight} kg`,
    quote.volume && `Volumen: ${quote.volume} CBM`,
    quote.units && `Unidades: ${quote.units}`,
  ].filter(Boolean);

  if (cargoItems.length) {
    doc.setFontSize(8.5);
    doc.setTextColor(...gray);
    doc.text(cargoItems.join('   ·   '), margin, y);
    y += 6;
  }

  y += 2;

  // ── Tabla de partidas ──
  // Header
  doc.setFillColor(...navy);
  doc.rect(margin, y, W - 2 * margin, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  const cols = { concept: margin + 2, unit: 118, qty: 138, price: 158, total: 178 };
  doc.text('CONCEPTO', cols.concept, y + 5);
  doc.text('UNIDAD', cols.unit, y + 5);
  doc.text('CANT.', cols.qty, y + 5, { align: 'center' });
  doc.text('P. UNIT.', cols.price, y + 5, { align: 'right' });
  doc.text('TOTAL', cols.total + 10, y + 5, { align: 'right' });
  y += 8;

  // Filas
  const items = quote.items || [];
  let totalUSD = 0, totalMXN = 0;

  items.forEach((item, i) => {
    const rowTotal = item.qty * item.unitPrice;
    if (item.currency === 'USD') totalUSD += rowTotal;
    else totalMXN += rowTotal;

    if (i % 2 === 0) {
      doc.setFillColor(249, 250, 251);
      doc.rect(margin, y - 1, W - 2 * margin, 6.5, 'F');
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(26, 31, 46);
    doc.text(item.concept || '', cols.concept, y + 4);
    doc.setTextColor(...gray);
    doc.text(item.unit || '', cols.unit, y + 4);
    doc.text(String(item.qty || 1), cols.qty, y + 4, { align: 'center' });
    doc.text(
      `${item.currency} ${(item.unitPrice || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
      cols.price, y + 4, { align: 'right' }
    );
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 31, 46);
    doc.text(
      `${item.currency} ${rowTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
      cols.total + 10, y + 4, { align: 'right' }
    );
    y += 7;
  });

  y += 4;

  // ── Totales ──
  doc.setDrawColor(...navy);
  doc.setLineWidth(0.3);
  doc.line(margin, y, W - margin, y);
  y += 5;

  const addTotal = (label, amount, currency, isMain = false) => {
    doc.setFont('helvetica', isMain ? 'bold' : 'normal');
    doc.setFontSize(isMain ? 10 : 8.5);
    doc.setTextColor(isMain ? navy[0] : gray[0], isMain ? navy[1] : gray[1], isMain ? navy[2] : gray[2]);
    doc.text(label, W - margin - 60, y);
    if (isMain) doc.setTextColor(...orange);
    doc.text(`${currency} ${amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, W - margin, y, { align: 'right' });
    y += isMain ? 7 : 5.5;
  };

  if (totalUSD > 0) addTotal('Subtotal USD:', totalUSD, 'USD');
  if (totalMXN > 0) addTotal('Subtotal MXN:', totalMXN, 'MXN');
  if (totalUSD > 0 && totalMXN > 0) {
    const rate = quote.exchangeRate || 17;
    addTotal(`Equivalente MXN (TC ${rate}):`, totalUSD * rate + totalMXN, 'MXN', true);
  } else if (totalUSD > 0) {
    addTotal('TOTAL USD:', totalUSD, 'USD', true);
  } else {
    addTotal('TOTAL MXN:', totalMXN, 'MXN', true);
  }

  y += 6;

  // ── Notas / Términos ──
  if (quote.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...navy);
    doc.text('Notas:', margin, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...gray);
    const noteLines = doc.splitTextToSize(quote.notes, W - 2 * margin);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 4 + 4;
  }

  if (quote.terms) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...gray);
    const termLines = doc.splitTextToSize(quote.terms, W - 2 * margin);
    doc.text(termLines, margin, y);
    y += termLines.length * 3.8 + 4;
  }

  // ── Footer ──
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(...navy);
  doc.rect(0, pageH - 16, W, 16, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...orange);
  doc.text('ACON Internacional', margin, pageH - 8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 190, 210);
  doc.text('sarahi.noriega@aconinternacional.com  ·  www.aconinternacional.com', margin + 38, pageH - 8);
  doc.text(`Elaboró: ${user?.name || 'ACON CRM'}`, W - margin, pageH - 8, { align: 'right' });

  doc.save(`${quote.folio || 'cotizacion'}_ACON.pdf`);
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function QuoterPage({ toast }) {
  const { user } = useAuth();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [leads, setLeads] = useState([]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

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
    setForm(p => ({ ...p, serviceType: svc, items: (DEFAULT_ITEMS[svc] || []).map(i => ({ ...i })) }));
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

  const setItem = (i, key, val) => {
    const items = [...form.items];
    items[i] = { ...items[i], [key]: key === 'qty' || key === 'unitPrice' ? Number(val) : val };
    f('items', items);
  };

  const addItem = () => f('items', [...form.items, { concept: '', unit: 'Global', qty: 1, unitPrice: 0, currency: 'USD' }]);
  const removeItem = (i) => f('items', form.items.filter((_, idx) => idx !== i));

  const totalUSD = form.items.filter(i => i.currency === 'USD').reduce((s, i) => s + (i.qty || 1) * (i.unitPrice || 0), 0);
  const totalMXN = form.items.filter(i => i.currency === 'MXN').reduce((s, i) => s + (i.qty || 1) * (i.unitPrice || 0), 0);

  const handleCreate = async () => {
    if (!form.clientName) return toast('El nombre del cliente es requerido', 'error');
    setSaving(true);
    try {
      const r = await createQuote(form);
      toast(`Cotización ${r.data.data.folio} creada`, 'success');
      setShowForm(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      toast(e.response?.data?.message || 'Error al crear cotización', 'error');
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

  const handlePDF = async (quote) => {
    try {
      await generatePDF(quote, user);
      toast('PDF generado', 'success');
    } catch (e) {
      toast('Error al generar PDF', 'error');
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Cotizador</div>
          <div className="page-sub">{quotes.length} cotizaciones · genera y descarga en PDF</div>
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
                          <button className="btn btn-ghost btn-sm" title="Descargar PDF" onClick={() => handlePDF(q)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <FileDown size={13} /> PDF
                          </button>
                          {q.status === 'draft' && (
                            <button className="btn btn-primary btn-sm" title="Marcar como enviada" onClick={() => handleStatusChange(q._id, 'sent')} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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

      {/* ── Modal nueva cotización ── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 780, width: '95vw' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calculator size={18} style={{ color: 'var(--orange-500)' }} /> Nueva Cotización
              </div>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>

            <div style={{ maxHeight: '75vh', overflowY: 'auto', paddingRight: 4 }}>

              {/* Tipo de servicio */}
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

              {/* Lead / Cliente */}
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
                  <input className="form-input" type="email" value={form.clientEmail} onChange={e => f('clientEmail', e.target.value)} placeholder="correo@empresa.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono / WhatsApp</label>
                  <input className="form-input" value={form.clientPhone} onChange={e => f('clientPhone', e.target.value)} placeholder="+521..." />
                </div>
              </div>

              {/* Ruta */}
              <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">Origen</label>
                  <input className="form-input" list="ports" value={form.origin} onChange={e => f('origin', e.target.value)} placeholder="Puerto/ciudad" />
                </div>
                <div className="form-group">
                  <label className="form-label">Destino</label>
                  <input className="form-input" list="ports" value={form.destination} onChange={e => f('destination', e.target.value)} placeholder="Puerto/ciudad" />
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

              {/* Partidas */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div className="section-title" style={{ margin: 0 }}><span>Partidas / Conceptos</span></div>
                  <button className="btn btn-ghost btn-sm" onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={13} /> Agregar línea
                  </button>
                </div>

                {/* Header tabla */}
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

                {/* Totales en tiempo real */}
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
              </div>

              {/* Config */}
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
                <label className="form-label">Notas adicionales</label>
                <textarea className="form-input" rows={2} value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="Observaciones..." />
              </div>

              <div className="form-group">
                <label className="form-label">Términos y condiciones</label>
                <textarea className="form-input" rows={2} value={form.terms} onChange={e => f('terms', e.target.value)} />
              </div>

            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn btn-ghost" onClick={async () => {
                setSaving(true);
                try {
                  const r = await createQuote(form);
                  await generatePDF(r.data.data, user);
                  toast(`${r.data.data.folio} creada y PDF descargado`, 'success');
                  setShowForm(false); setForm(EMPTY_FORM); load();
                } catch (e) { toast('Error', 'error'); }
                finally { setSaving(false); }
              }} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <FileDown size={14} /> Guardar y descargar PDF
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
