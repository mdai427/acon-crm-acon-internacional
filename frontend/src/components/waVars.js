// ============================================
// Variables de las plantillas de WhatsApp
// ============================================
//
// Cada {{n}} del cuerpo es una de dos cosas:
//
//   · Variable del CRM (`field`): un dato que ya tenemos del lead. Al enviar se
//     rellena solo, el ejecutivo no escribe nada.
//   · Variable personalizada (`custom`): algo que depende del momento —una
//     fecha, un folio, un monto—. Quien crea la plantilla le pone etiqueta, y
//     al enviar se pide ese dato con esa etiqueta.
//
// Los `id` de aquí tienen que coincidir con las claves de LEAD_FIELDS en
// backend/src/services/waTemplateStore.js, que es quien valida lo que llega y
// resuelve el valor real al enviar. Si se agrega uno, hay que agregarlo allá.

export const LEAD_VARS = [
  { id: 'contact',   label: 'Nombre del contacto', sample: 'Ana López',
    get: (l) => (typeof l?.contact === 'object' ? l.contact?.name : l?.contact) || '' },
  { id: 'company',   label: 'Empresa',             sample: 'Acme SA',
    get: (l) => l?.company || '' },
  { id: 'executive', label: 'Ejecutivo asignado',  sample: 'Carlos Ruiz',
    get: (l) => (typeof l?.assignedTo === 'object' ? l.assignedTo?.name : '') || '' },
  { id: 'stage',     label: 'Etapa del pipeline',  sample: 'Propuesta',
    get: (l) => l?.stage || '' },
  { id: 'service',   label: 'Servicio de interés', sample: 'Flete marítimo',
    get: (l) => (Array.isArray(l?.services) ? l.services[0] : l?.services) || '' },
  { id: 'country',   label: 'País',                sample: 'México',
    get: (l) => l?.country || '' },
  { id: 'city',      label: 'Ciudad',              sample: 'Monterrey',
    get: (l) => l?.city || '' },
  { id: 'email',     label: 'Correo',              sample: 'ana@acme.com',
    get: (l) => l?.email || '' },
  { id: 'phone',     label: 'Teléfono',            sample: '+52 55 1234 5678',
    get: (l) => l?.whatsapp || l?.phone || '' },
];

const LEAD_VAR_BY_ID = Object.fromEntries(LEAD_VARS.map(v => [v.id, v]));

export const leadVarLabel = (source) => LEAD_VAR_BY_ID[source]?.label || source;

/** Texto de ejemplo de una variable, para la vista previa y para Meta. */
export function sampleOf(variable, index = 0) {
  if (variable?.kind === 'custom') return variable.sample?.trim() || variable.label || `Dato ${index + 1}`;
  return LEAD_VAR_BY_ID[variable?.source]?.sample || `Ejemplo ${index + 1}`;
}

/** Etiqueta con la que se le presenta la variable al ejecutivo. */
export function labelOf(variable, index = 0) {
  if (variable?.kind === 'custom') return variable.label || `Dato ${index + 1}`;
  return leadVarLabel(variable?.source);
}

/**
 * Resuelve las variables de una plantilla contra un lead concreto.
 * Las del CRM quedan rellenas; las personalizadas, vacías para que las escriba
 * el ejecutivo.
 * @returns {string[]} un valor por variable, en orden
 */
export function prefillValues(variables = [], lead) {
  return variables.map(v => (v.kind === 'field' ? (LEAD_VAR_BY_ID[v.source]?.get(lead) || '') : ''));
}

/** Variables por defecto cuando una plantilla vieja no tiene el mapeo guardado. */
export function fallbackVariables(count) {
  return Array.from({ length: count }, (_, i) => ({
    kind: 'custom', label: `Dato ${i + 1}`, sample: `Ejemplo ${i + 1}`,
  }));
}

/** Sustituye {{1}}, {{2}}… por los valores dados (o por el marcador si falta). */
export function fill(text, values = []) {
  return String(text || '').replace(/\{\{(\d+)\}\}/g, (m, n) => values[Number(n) - 1] || m);
}
