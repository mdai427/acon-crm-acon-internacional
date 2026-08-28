// ============================================
// Variables en los textos de un flujo
// ============================================
//
// {empresa} {contacto} {etapa} {ejecutivo} {valor} {pais} {servicios}
// Las mismas que usaban los playbooks más las que faltaban.

const VARIABLES = [
  { key: 'empresa',   label: 'Empresa' },
  { key: 'contacto',  label: 'Nombre del contacto' },
  { key: 'etapa',     label: 'Etapa actual' },
  { key: 'ejecutivo', label: 'Ejecutivo asignado' },
  { key: 'valor',     label: 'Valor estimado (USD)' },
  { key: 'pais',      label: 'País' },
  { key: 'servicios', label: 'Servicios de interés' },
];

function values({ lead, stageLabel, executive }) {
  const contact = typeof lead?.contact === 'object' ? lead.contact?.name : lead?.contact;
  return {
    empresa:   lead?.company || '',
    contacto:  contact || '',
    etapa:     stageLabel || lead?.stage || '',
    ejecutivo: executive?.name || 'el equipo ACON',
    valor:     lead?.value ? Number(lead.value).toLocaleString('en-US') : '',
    pais:      lead?.country || '',
    servicios: (lead?.services || []).join(', '),
  };
}

function render(text, ctx) {
  const v = values(ctx);
  return String(text || '').replace(/\{(\w+)\}/g, (m, key) => (key in v ? v[key] : m));
}

// Para correo: el texto va a HTML, así que las variables (que vienen de datos
// del lead, escritos por gente) se escapan.
const escapeHtml = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderHtml(text, ctx) {
  const v = values(ctx);
  return String(text || '')
    .replace(/\{(\w+)\}/g, (m, key) => (key in v ? escapeHtml(v[key]) : m))
    .replace(/\n/g, '<br>');
}

module.exports = { VARIABLES, render, renderHtml, values, escapeHtml };
