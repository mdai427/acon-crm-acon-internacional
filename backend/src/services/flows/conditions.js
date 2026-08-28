// ============================================
// Condiciones de flujo: ¿el lead cumple esto ahora?
// ============================================
//
// Mismo lenguaje para los filtros de entrada de un flujo y para el paso
// Condición. Puro: recibe el lead (y un poco de contexto) y devuelve true/false.

// Campos que se pueden usar en una regla y cómo se leen del lead.
const FIELDS = {
  stage:      { label: 'Etapa',              kind: 'enum',   read: l => l.stage },
  score:      { label: 'Score IA',           kind: 'number', read: l => l.score || 0 },
  value:      { label: 'Valor estimado (USD)', kind: 'number', read: l => l.value || 0 },
  priority:   { label: 'Prioridad',          kind: 'enum',   read: l => l.priority },
  services:   { label: 'Servicios',          kind: 'list',   read: l => l.services || [] },
  country:    { label: 'País',               kind: 'text',   read: l => l.country },
  source:     { label: 'Fuente',             kind: 'enum',   read: l => l.source },
  assignedTo: { label: 'Ejecutivo',          kind: 'id',     read: l => String(l.assignedTo?._id || l.assignedTo || '') },
  tags:       { label: 'Etiquetas',          kind: 'list',   read: l => l.tags || [] },
  daysSinceLastContact: { label: 'Días sin contacto', kind: 'number', read: l => l.daysSinceLastContact || 0 },
  hasEmail:    { label: 'Tiene correo',      kind: 'bool',   read: l => !!l.email },
  hasWhatsapp: { label: 'Tiene WhatsApp',    kind: 'bool',   read: l => !!(l.whatsapp || l.phone) },
  hasReplied:  { label: 'Ha respondido alguna vez', kind: 'bool', read: (l, ctx) => !!ctx.hasReplied },
  hasQuote:    { label: 'Tiene cotización',  kind: 'bool',   read: (l, ctx) => !!ctx.hasQuote },
  // Resultado del último paso de IA (categoría) — para Dividir/Condición tras clasificar.
  aiResult:    { label: 'Resultado de la IA', kind: 'text',  read: (l, ctx) => ctx.lastAiResult?.category || ctx.lastAiResult?.choice || '' },
};

const norm = v => (typeof v === 'string' ? v.trim().toLowerCase() : v);
const toList = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map(norm);

function compare(actual, cmp, expected) {
  switch (cmp) {
    case 'exists':     return actual != null && actual !== '' && !(Array.isArray(actual) && !actual.length);
    case 'not_exists': return !compare(actual, 'exists');
    case 'gt':  return Number(actual) >  Number(expected);
    case 'gte': return Number(actual) >= Number(expected);
    case 'lt':  return Number(actual) <  Number(expected);
    case 'lte': return Number(actual) <= Number(expected);
    case 'in':  return toList(expected).includes(norm(actual)) || (Array.isArray(actual) && toList(actual).some(a => toList(expected).includes(a)));
    case 'nin': return !compare(actual, 'in', expected);
    case 'contains':
      if (Array.isArray(actual)) return toList(actual).includes(norm(expected));
      return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 'ne':  return !compare(actual, 'eq', expected);
    case 'eq':
    default:
      if (typeof actual === 'boolean') return actual === (expected === true || expected === 'true');
      if (Array.isArray(actual)) return toList(actual).includes(norm(expected));
      return norm(actual) == norm(expected); // eslint-disable-line eqeqeq
  }
}

function evalRule(rule, lead, ctx) {
  const def = FIELDS[rule.field];
  if (!def) return false; // campo desconocido: no se cumple, y validate lo rechaza antes
  return compare(def.read(lead, ctx), rule.cmp || 'eq', rule.value);
}

/**
 * @param {{op:'and'|'or', rules:Array}} condition
 * @param {object} lead
 * @param {object} ctx  { hasReplied, hasQuote, lastAiResult }
 */
function evaluate(condition, lead, ctx = {}) {
  const rules = condition?.rules || [];
  if (!rules.length) return true; // sin reglas = siempre
  const results = rules.map(r => evalRule(r, lead, ctx));
  return (condition.op || 'and') === 'or' ? results.some(Boolean) : results.every(Boolean);
}

/** Texto legible de una condición, para las tarjetas del canvas. */
function describe(condition) {
  const rules = condition?.rules || [];
  if (!rules.length) return 'Siempre';
  const parts = rules.map(r => {
    const label = FIELDS[r.field]?.label || r.field;
    const sym = { eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', in: 'en', nin: 'no en', contains: 'contiene', exists: 'existe', not_exists: 'no existe' }[r.cmp || 'eq'];
    const val = ['exists', 'not_exists'].includes(r.cmp) ? '' : ` ${Array.isArray(r.value) ? r.value.join(', ') : r.value}`;
    return `${label} ${sym}${val}`;
  });
  return parts.join((condition.op || 'and') === 'or' ? ' o ' : ' y ');
}

module.exports = { FIELDS, evaluate, describe, compare };
