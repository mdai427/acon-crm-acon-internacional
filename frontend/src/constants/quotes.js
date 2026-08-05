import { Anchor, Plane, Truck, Warehouse, BadgeCheck } from 'lucide-react';

// Constantes compartidas entre la lista de cotizaciones (QuoterPage) y el
// asistente paso a paso (QuoteWizard).

export const SERVICE_TYPES = [
  { id: 'maritimo_fcl',        label: 'Marítimo FCL',          Icon: Anchor,     color: '#2563EB', hint: 'Contenedor completo' },
  { id: 'maritimo_lcl',        label: 'Marítimo LCL',          Icon: Anchor,     color: '#2563EB', hint: 'Carga consolidada' },
  { id: 'aereo',               label: 'Aéreo',                 Icon: Plane,      color: '#7C3AED', hint: 'Urgente, por kg' },
  { id: 'terrestre_full',      label: 'Terrestre Full',        Icon: Truck,      color: '#F2641E', hint: 'Caja completa' },
  { id: 'terrestre_sencillo',  label: 'Terrestre Sencillo',    Icon: Truck,      color: '#F2641E', hint: 'Rabón / torton' },
  { id: 'terrestre_economico', label: 'Terrestre Económico',   Icon: Truck,      color: '#F2641E', hint: 'Consolidado LTL' },
  { id: 'almacenaje',          label: 'Almacenaje',            Icon: Warehouse,  color: '#CA8A04', hint: 'Bodega y maniobras' },
  { id: 'aduanal_importacion', label: 'Aduanal Importación',   Icon: BadgeCheck, color: '#16A34A', hint: 'Pedimento de entrada' },
  { id: 'aduanal_exportacion', label: 'Aduanal Exportación',   Icon: BadgeCheck, color: '#16A34A', hint: 'Pedimento de salida' },
];

export const IS_MARITIME = (svc) => svc === 'maritimo_fcl' || svc === 'maritimo_lcl';

export const DEFAULT_ITEMS = {
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

export const INCOTERMS = ['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'];

export const STATUS_MAP = {
  draft:              { label: 'Borrador',          bg: '#F4F5F7', color: '#5A6472' },
  pending_approval:   { label: 'En revisión',       bg: '#FEF9C3', color: '#CA8A04' },
  approved:           { label: 'Aprobada',          bg: '#DCFCE7', color: '#16A34A' },
  rejected_approval:  { label: 'Rechazada por ger.',bg: '#FEE2E2', color: '#DC2626' },
  sent:               { label: 'Enviada',           bg: '#DBEAFE', color: '#2563EB' },
  accepted:           { label: 'Aceptada',          bg: '#DCFCE7', color: '#16A34A' },
  rejected:           { label: 'Rechazada',         bg: '#FEE2E2', color: '#DC2626' },
  expired:            { label: 'Vencida',           bg: '#F4F5F7', color: '#9AA3AE' },
};

export const FREQUENT_PORTS = [
  'Manzanillo, MX','Lázaro Cárdenas, MX','Veracruz, MX','Altamira, MX',
  'Shanghai, CN','Ningbo, CN','Guangzhou, CN','Long Beach, US','Los Ángeles, US',
  'Ciudad de México, MX','Guadalajara, MX','Monterrey, MX',
  'Aeropuerto MEX','Aeropuerto GDL','Aeropuerto LAX',
  'Vitória, BR','Santos, BR','Rio de Janeiro, BR','Navegantes, BR',
];

export const EMPTY_ROUTE = { origen: '', pol: '', pod: '', transitDays: '', price20: '', price40: '', price40HC: '', currency: 'USD' };

export const DEFAULT_TERMS = 'Asegure su carga (COBERTURA TOTAL – TODO RIESGO). NO nos haremos responsables de ningún daño, retraso o pérdida monetaria de ningún tipo si decide no contratar el seguro. El equipo y el espacio están sujetos a disponibilidad. Pueden aplicarse costos de reposición. Las tarifas están sujetas a cambios sin previo aviso. No seremos responsables por caso fortuito o fuerza mayor: demoras climáticas, tormentas, inundaciones, guerra, incendios, entre otros.';

export const EMPTY_FORM = {
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
  terms: DEFAULT_TERMS,
  lead: '',
};
