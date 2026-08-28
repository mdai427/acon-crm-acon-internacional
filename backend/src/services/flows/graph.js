// ============================================
// Recorrido del grafo de un flujo (puro, sin base de datos)
// ============================================

const UNIT_MS = { minutes: 60e3, hours: 3600e3, days: 86400e3 };

// Horario laboral fijo v1: L-V 9-18 en la zona horaria del CRM.
const BUSINESS = { tz: 'America/Mexico_City', startHour: 9, endHour: 18 };

function byId(flow) {
  return Object.fromEntries((flow.nodes || []).map(n => [n.id, n]));
}

function startNode(flow) {
  return (flow.nodes || []).find(n => n.type === 'trigger') || null;
}

/** Siguiente paso saliendo de `nodeId` por la salida `handle`. */
function next(flow, nodeId, handle = 'next') {
  const nodes = byId(flow);
  const edge = (flow.edges || []).find(e => e.from === nodeId && (e.fromHandle || 'next') === handle)
    // Dividir por: si no hay arista para ese valor, cae en «otro».
    || (flow.edges || []).find(e => e.from === nodeId && e.fromHandle === 'other' && handle !== 'other' && nodes[nodeId]?.type === 'split');
  return edge ? nodes[edge.to] || null : null;
}

/** Salidas que declara un tipo de paso según su configuración. */
function handlesOf(node) {
  switch (node.type) {
    case 'condition': return ['yes', 'no'];
    case 'wait':      return node.config?.mode === 'until' ? ['happened', 'timeout'] : ['next'];
    case 'split':     return [...(node.config?.values || []).map(String), 'other'];
    case 'exit':      return [];
    case 'note':      return [];
    default:          return ['next'];
  }
}

function durationMs({ amount, unit }) {
  const n = Number(amount);
  if (!n || n < 0) return 0;
  return n * (UNIT_MS[unit] || UNIT_MS.hours);
}

// Hora local en la zona del CRM sin dependencias: se usa Intl.
function localParts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS.tz, hour12: false, weekday: 'short', hour: 'numeric', minute: 'numeric',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map(x => [x.type, x.value]));
  return { weekday: p.weekday, hour: Number(p.hour) % 24, minute: Number(p.minute) };
}

/** Mueve `date` al siguiente instante dentro del horario laboral (si ya está dentro, la devuelve igual). */
function nextBusinessTime(date) {
  let d = new Date(date);
  const { weekday, hour } = localParts(d);
  const inside = w => w !== 'Sat' && w !== 'Sun';
  if (inside(weekday) && hour >= BUSINESS.startHour && hour < BUSINESS.endHour) return d;
  // Avanza hora a hora (como mucho 8 días) hasta la primera hora laboral.
  d.setMinutes(0, 0, 0);
  for (let i = 0; i < 24 * 8; i++) {
    d = new Date(d.getTime() + 3600e3);
    const lp = localParts(d);
    if (inside(lp.weekday) && lp.hour === BUSINESS.startHour) return d;
  }
  return d;
}

/**
 * Calcula cómo espera un paso Esperar.
 * @returns {{kind:'time'|'event', runAt:Date, event?:string, filter?:object, until?:Date}}
 */
function waitPlan(node, now = new Date(), { businessHoursOnly = false } = {}) {
  const c = node.config || {};
  const bh = businessHoursOnly || c.businessHours;
  if (c.mode === 'until') {
    const max = durationMs({ amount: c.maxAmount, unit: c.maxUnit }) || UNIT_MS.days * 7;
    let until = new Date(now.getTime() + max);
    if (bh) until = nextBusinessTime(until);
    return { kind: 'event', event: c.until?.event, filter: c.until?.filter || {}, until, runAt: until };
  }
  let runAt = new Date(now.getTime() + durationMs(c));
  if (bh) runAt = nextBusinessTime(runAt);
  return { kind: 'time', runAt };
}

/** ¿Un evento recibido satisface lo que espera un Esperar «hasta que…»? */
function eventMatches(waitingFor, event) {
  if (!waitingFor || waitingFor.kind !== 'event') return false;
  if (waitingFor.event !== event.name) return false;
  const f = waitingFor.filter || {};
  if (f.channel && f.channel !== 'any' && event.channel !== f.channel) return false;
  if (f.status && event.status !== f.status) return false;
  if (Array.isArray(f.stages) && f.stages.length && !f.stages.includes(event.stage)) return false;
  return true;
}

module.exports = { byId, startNode, next, handlesOf, waitPlan, eventMatches, durationMs, nextBusinessTime, BUSINESS };
