import React, { useState, useEffect } from 'react';
import { getOperations, createOperation, updateOperationStatus, updateOperationDocument, deleteOperation } from '../services/api';
import { Package, Anchor, Plane, Truck, Warehouse, BadgeCheck, Plus, Search, RefreshCw, X, ChevronRight, FileText } from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────
const SERVICE_TYPES = [
  { id: 'maritimo_fcl', label: 'Marítimo FCL',   Icon: Anchor,    sub: 'FCL' },
  { id: 'maritimo_lcl', label: 'Marítimo LCL',   Icon: Anchor,    sub: 'LCL' },
  { id: 'aereo',        label: 'Aéreo',           Icon: Plane,     sub: '' },
  { id: 'terrestre_full',     label: 'Terrestre Full', Icon: Truck, sub: 'Full' },
  { id: 'terrestre_sencillo', label: 'Terrestre Sencillo', Icon: Truck, sub: 'Sencillo' },
  { id: 'terrestre_economico',label: 'Terrestre Económico', Icon: Truck, sub: 'Económico' },
  { id: 'almacenaje',          label: 'Almacenaje',       Icon: Warehouse,  sub: '' },
  { id: 'aduanal_importacion', label: 'Aduanal Importación', Icon: BadgeCheck, sub: 'IMP' },
  { id: 'aduanal_exportacion', label: 'Aduanal Exportación', Icon: BadgeCheck, sub: 'EXP' },
];

const STATUS_FLOW = [
  { id: 'booking',    label: 'Booking' },
  { id: 'departed',   label: 'Zarpe/Salida' },
  { id: 'in_transit', label: 'En Tránsito' },
  { id: 'in_customs', label: 'En Aduana' },
  { id: 'released',   label: 'Liberado' },
  { id: 'delivered',  label: 'Entregado' },
];

const DOC_TYPES = [
  { id: 'bl_awb',       label: 'BL / AWB' },
  { id: 'factura',      label: 'Factura Comercial' },
  { id: 'packing_list', label: 'Packing List' },
  { id: 'cove',         label: 'COVE' },
  { id: 'pedimento',    label: 'Pedimento' },
  { id: 'cert_origen',  label: 'Cert. Origen' },
  { id: 'carta_porte',  label: 'Carta Porte' },
];

const CONTAINER_TYPES = ['20ft', '40ft', '40hc', 'LCL/CBM', 'Pallet', 'Caja seca', 'Refrigerado'];

const FREQUENT_PORTS = [
  'Manzanillo, MX', 'Lázaro Cárdenas, MX', 'Veracruz, MX', 'Altamira, MX',
  'Shanghai, CN', 'Ningbo, CN', 'Guangzhou, CN', 'Shenzhen, CN',
  'Long Beach, US', 'Los Ángeles, US', 'Houston, US', 'Miami, US',
  'Ciudad de México, MX', 'Guadalajara, MX', 'Monterrey, MX',
  'Aeropuerto MEX', 'Aeropuerto GDL', 'Aeropuerto LAX',
];

const STATUS_BADGE = {
  booking:    { label: 'Booking',      cls: 'badge-booking' },
  departed:   { label: 'Zarpe/Salida', cls: 'badge-contacted' },
  in_transit: { label: 'En Tránsito',  cls: 'badge-qualified' },
  in_customs: { label: 'En Aduana',    cls: 'badge-negotiation' },
  released:   { label: 'Liberado',     cls: 'badge-released' },
  delivered:  { label: 'Entregado',    cls: 'badge-closed_won' },
};

const DOC_STATUS_COLORS = {
  pending:  { bg: '#FEF9C3', color: '#A16207', label: 'Pendiente' },
  received: { bg: '#DCFCE7', color: '#15803D', label: 'Recibido' },
  expired:  { bg: '#FEE2E2', color: '#B91C1C', label: 'Vencido' },
};

function ServiceIcon({ type, size = 14 }) {
  const def = SERVICE_TYPES.find(s => s.id === type);
  if (!def) return null;
  const { Icon } = def;
  return <Icon size={size} strokeWidth={1.75} />;
}

// ── Empty form ─────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  serviceType: 'maritimo_fcl', clientName: '', blAwbCartaPorte: '',
  origin: '', destination: '', carrier: '', containerType: '',
  weight: '', volume: '', units: '', etd: '', eta: '', notes: '',
};

// ── Main Component ─────────────────────────────────────────────────────────
export default function OperationsPage({ toast }) {
  const [ops, setOps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedOp, setSelectedOp] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    getOperations({ search, status: statusFilter, serviceType: serviceFilter })
      .then(r => setOps(r.data.data || []))
      .catch(() => toast('Error al cargar operaciones', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, statusFilter, serviceFilter]);

  const handleCreate = async () => {
    if (!form.clientName || !form.serviceType) return toast('Cliente y tipo de servicio requeridos', 'error');
    setSaving(true);
    try {
      await createOperation(form);
      toast('Operación creada', 'success');
      setShowModal(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      toast(e.response?.data?.message || 'Error al crear operación', 'error');
    } finally { setSaving(false); }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await updateOperationStatus(id, newStatus);
      toast('Estado actualizado', 'success');
      load();
      if (selectedOp?._id === id) {
        setSelectedOp(prev => ({ ...prev, status: newStatus }));
      }
    } catch { toast('Error al actualizar estado', 'error'); }
  };

  const handleDocStatus = async (opId, docType, docStatus) => {
    try {
      await updateOperationDocument(opId, { type: docType, status: docStatus });
      toast('Documento actualizado', 'success');
      const r = await getOperations({ search: '', status: '', serviceType: '' });
      const updated = (r.data.data || []).find(o => o._id === opId);
      if (updated) setSelectedOp(updated);
      load();
    } catch { toast('Error al actualizar documento', 'error'); }
  };

  const f = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Operaciones / Embarques</div>
          <div className="page-sub">{ops.length} operaciones activas</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Nueva Operación
        </button>
      </div>

      {/* Filtros */}
      <div className="card card-sm" style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
          <input className="form-input" style={{ paddingLeft: 30 }} placeholder="Buscar booking, cliente, BL..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos los estados</option>
          {STATUS_FLOW.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select className="form-select" style={{ width: 180 }} value={serviceFilter} onChange={e => setServiceFilter(e.target.value)}>
          <option value="">Todos los servicios</option>
          {SERVICE_TYPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedOp ? '1fr 380px' : '1fr', gap: 16 }}>
        {/* Tabla */}
        <div className="card" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading"><div className="spinner" />Cargando operaciones...</div>
          ) : ops.length === 0 ? (
            <div className="empty-state">
              <Package size={44} />
              <p>No hay operaciones. ¡Registra la primera!</p>
              <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
                <Plus size={13} /> Nueva Operación
              </button>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Cliente</th>
                    <th>Servicio</th>
                    <th>Ruta</th>
                    <th>ETD</th>
                    <th>ETA</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {ops.map(op => (
                    <tr key={op._id} style={{ cursor: 'pointer' }} onClick={() => setSelectedOp(op)}>
                      <td>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: 'var(--navy-900)' }}>{op.bookingNumber}</div>
                        {op.blAwbCartaPorte && <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>{op.blAwbCartaPorte}</div>}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{op.clientName || op.lead?.company || '—'}</div>
                        {op.carrier && <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{op.carrier}</div>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--gray-500)', fontSize: 12 }}>
                          <ServiceIcon type={op.serviceType} />
                          {SERVICE_TYPES.find(s => s.id === op.serviceType)?.label || op.serviceType}
                        </div>
                        {op.containerType && <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>{op.containerType}</div>}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {op.origin && op.destination ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--gray-500)' }}>
                            <span>{op.origin}</span>
                            <ChevronRight size={10} />
                            <span>{op.destination}</span>
                          </div>
                        ) : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                        {op.etd ? new Date(op.etd).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                        {op.eta ? new Date(op.eta).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—'}
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[op.status]?.cls || ''}`}>
                          {STATUS_BADGE[op.status]?.label || op.status}
                        </span>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setSelectedOp(op)}>Ver</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Panel lateral de detalle */}
        {selectedOp && (
          <OperationDetail
            op={selectedOp}
            onClose={() => setSelectedOp(null)}
            onStatusChange={handleStatusChange}
            onDocStatus={handleDocStatus}
          />
        )}
      </div>

      {/* Modal nueva operación */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Package size={18} style={{ color: 'var(--orange-500)' }} /> Nueva Operación
              </div>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>

            {/* Tipo de servicio */}
            <div className="form-group">
              <label className="form-label">Tipo de Servicio *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SERVICE_TYPES.map(s => (
                  <button key={s.id} type="button"
                    className={`service-chip ${form.serviceType === s.id ? 'selected' : ''}`}
                    onClick={() => f('serviceType', s.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <s.Icon size={13} strokeWidth={1.75} /> {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Cliente / Empresa *</label>
                <input className="form-input" value={form.clientName} onChange={e => f('clientName', e.target.value)} placeholder="Nombre del cliente" />
              </div>
              <div className="form-group">
                <label className="form-label">BL / AWB / Carta Porte</label>
                <input className="form-input" value={form.blAwbCartaPorte} onChange={e => f('blAwbCartaPorte', e.target.value)} placeholder="Número de documento" style={{ fontFamily: 'monospace' }} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Origen</label>
                <input className="form-input" list="ports-list" value={form.origin} onChange={e => f('origin', e.target.value)} placeholder="Puerto / ciudad origen" />
              </div>
              <div className="form-group">
                <label className="form-label">Destino</label>
                <input className="form-input" list="ports-list" value={form.destination} onChange={e => f('destination', e.target.value)} placeholder="Puerto / ciudad destino" />
              </div>
            </div>
            <datalist id="ports-list">
              {FREQUENT_PORTS.map(p => <option key={p} value={p} />)}
            </datalist>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Naviera / Aerolínea / Transportista</label>
                <input className="form-input" value={form.carrier} onChange={e => f('carrier', e.target.value)} placeholder="Maersk, CMA CGM, FedEx..." />
              </div>
              <div className="form-group">
                <label className="form-label">Contenedor / Unidad</label>
                <select className="form-select" value={form.containerType} onChange={e => f('containerType', e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {CONTAINER_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div className="form-group">
                <label className="form-label">Peso (kg)</label>
                <input className="form-input" type="number" value={form.weight} onChange={e => f('weight', e.target.value)} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Volumen (CBM)</label>
                <input className="form-input" type="number" value={form.volume} onChange={e => f('volume', e.target.value)} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Unidades</label>
                <input className="form-input" type="number" value={form.units} onChange={e => f('units', e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">ETD (Salida estimada)</label>
                <input className="form-input" type="date" value={form.etd} onChange={e => f('etd', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">ETA (Llegada estimada)</label>
                <input className="form-input" type="date" value={form.eta} onChange={e => f('eta', e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Notas internas</label>
              <textarea className="form-input" rows={2} value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="Instrucciones especiales, observaciones..." />
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
                {saving ? 'Guardando...' : 'Crear Operación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Operation Detail Panel ─────────────────────────────────────────────────
function OperationDetail({ op, onClose, onStatusChange, onDocStatus }) {
  const statusIdx = STATUS_FLOW.findIndex(s => s.id === op.status);
  const serviceDef = SERVICE_TYPES.find(s => s.id === op.serviceType);
  const Icon = serviceDef?.Icon || Package;

  const docs = DOC_TYPES.map(dt => {
    const existing = (op.documents || []).find(d => d.type === dt.id);
    return { ...dt, status: existing?.status || 'pending' };
  });

  return (
    <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 160px)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--gray-200)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <Icon size={15} style={{ color: 'var(--orange-500)' }} strokeWidth={1.75} />
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: 'var(--navy-900)' }}>{op.bookingNumber}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-900)' }}>{op.clientName || op.lead?.company || '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{serviceDef?.label}</div>
        </div>
        <button className="modal-close" onClick={onClose}><X size={16} /></button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        {/* Estado pipeline */}
        <div style={{ marginBottom: 16 }}>
          <div className="section-title"><span>Estado del embarque</span></div>
          <div className="status-steps">
            {STATUS_FLOW.map((s, i) => (
              <button
                key={s.id}
                className={`status-step ${i < statusIdx ? 'done' : i === statusIdx ? 'current' : ''}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', flex: 1 }}
                onClick={() => onStatusChange(op._id, s.id)}
                title={`Cambiar a: ${s.label}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Datos */}
        <div className="section-title"><span>Información</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[
            ['BL / AWB',  op.blAwbCartaPorte || '—'],
            ['Carrier',   op.carrier || '—'],
            ['Origen',    op.origin || '—'],
            ['Destino',   op.destination || '—'],
            ['Contenedor',op.containerType || '—'],
            ['Peso',      op.weight ? `${op.weight} kg` : '—'],
            ['Volumen',   op.volume ? `${op.volume} CBM` : '—'],
            ['ETD',       op.etd ? new Date(op.etd).toLocaleDateString('es-MX') : '—'],
            ['ETA',       op.eta ? new Date(op.eta).toLocaleDateString('es-MX') : '—'],
          ].map(([label, val]) => (
            <div key={label}>
              <div className="detail-label">{label}</div>
              <div className="detail-val" style={{ fontFamily: label === 'BL / AWB' ? 'monospace' : 'inherit' }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Documentos */}
        <div className="section-title"><span>Documentos</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {docs.map(doc => {
            const style = DOC_STATUS_COLORS[doc.status];
            return (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--gray-50)', borderRadius: 6, border: '1px solid var(--gray-200)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={13} style={{ color: 'var(--gray-400)' }} strokeWidth={1.75} />
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{doc.label}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['pending', 'received', 'expired'].map(st => (
                    <button
                      key={st}
                      onClick={() => onDocStatus(op._id, doc.id, st)}
                      style={{
                        padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer',
                        background: doc.status === st ? DOC_STATUS_COLORS[st].bg : 'transparent',
                        color: doc.status === st ? DOC_STATUS_COLORS[st].color : 'var(--gray-400)',
                        outline: doc.status === st ? `1px solid ${DOC_STATUS_COLORS[st].color}40` : 'none',
                      }}
                    >
                      {DOC_STATUS_COLORS[st].label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {op.notes && (
          <div style={{ marginTop: 14, padding: 10, background: 'var(--orange-light)', borderRadius: 6, border: '1px solid rgba(242,100,30,.2)', fontSize: 12, color: 'var(--gray-700)' }}>
            <strong style={{ color: 'var(--orange-500)' }}>Notas:</strong> {op.notes}
          </div>
        )}
      </div>
    </div>
  );
}
