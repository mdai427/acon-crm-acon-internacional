// ============================================
// Simulación: recorre el flujo con un lead sin ejecutar nada
// ============================================
//
// Para cada Esperar «hasta que…» y cada Dividir por, el usuario puede indicar
// qué habría pasado (`answers[nodeId] = handle`). Sin respuesta se asume que
// el tiempo se agotó / la rama «otro». Devuelve el camino y lo que se habría
// enviado, con las variables ya resueltas.

const graph = require('./graph');
const { evaluate, FIELDS, describe } = require('./conditions');
const { render } = require('./render');

const MAX_STEPS = 50;

function preview(node, ctx) {
  const c = node.config || {};
  switch (node.type) {
    case 'send_whatsapp':
      return c.metaTemplate?.name
        ? `Plantilla «${c.metaTemplate.name}» con: ${(c.metaTemplate.params || []).map(p => render(p, ctx)).join(' | ') || '—'}`
        : (c.aiInstructions ? `[IA redacta] ${c.aiInstructions}` : render(c.text, ctx));
    case 'send_email':
      return c.templateId ? `Plantilla de correo ${c.templateId}` : c.aiInstructions ? `[IA redacta] ${c.aiInstructions}` : `${render(c.subject, ctx)} — ${render(c.body, ctx).slice(0, 160)}`;
    case 'create_task': return `Tarea: ${render(c.title, ctx)} (vence en ${c.dueInDays || 2} d)`;
    case 'notify':      return `Aviso: ${render(c.title, ctx)}`;
    case 'ai_email_draft': return `Borrador IA: ${render(c.purpose, ctx)}`;
    case 'change_stage': return `Etapa → ${c.stage}`;
    case 'assign':      return c.mode === 'user' ? `Asignar a ${c.userId}` : `Asignar (${c.mode})`;
    case 'tag':         return `${c.remove ? 'Quitar' : 'Añadir'} etiqueta «${c.tag}»`;
    case 'update_field': return `${c.field} = ${render(String(c.value ?? ''), ctx)}`;
    case 'enroll_flow': return `Meter en flujo ${c.flowId}`;
    case 'condition':   return describe(c.condition);
    case 'wait': {
      const plan = graph.waitPlan(node);
      return plan.kind === 'event' ? `Esperar hasta ${plan.event} (máx. ${c.maxAmount || 7} ${c.maxUnit || 'days'})` : `Esperar ${c.amount} ${c.unit || 'hours'}`;
    }
    case 'exit': return render(c.reason || 'Salida', ctx);
    default: return '';
  }
}

/**
 * @param {object} flow   flujo ejecutable (nodos/aristas)
 * @param {object} lead   lead cargado
 * @param {object} ctx    { stageLabel, executive, hasReplied, hasQuote }
 * @param {object} answers  { [nodeId]: handle }
 */
function simulate(flow, lead, extra = {}, answers = {}) {
  const ctx = { ...extra, lead };
  const path = [];
  const start = graph.startNode(flow);
  if (!start) return { ok: false, message: 'El flujo no tiene inicio', path };
  const entry = evaluate(flow.trigger?.entryFilters, lead, ctx);
  if (!entry) return { ok: true, entered: false, message: 'El lead no pasa los filtros de entrada', path };

  let node = start, handle = 'next', steps = 0;
  path.push({ nodeId: start.id, type: 'trigger', label: start.label || 'Inicio', handle });
  while (steps++ < MAX_STEPS) {
    node = graph.next(flow, node.id, handle);
    if (!node) { path.push({ type: 'end', label: 'Fin del flujo' }); break; }
    const entry = { nodeId: node.id, type: node.type, label: node.label || node.type, preview: preview(node, ctx) };
    if (node.type === 'exit') { path.push(entry); break; }
    if (node.type === 'condition') handle = evaluate(node.config?.condition, lead, ctx) ? 'yes' : 'no';
    else if (node.type === 'split') {
      const raw = FIELDS[node.config?.field]?.read(lead, ctx);
      const val = String(Array.isArray(raw) ? raw[0] ?? '' : raw ?? '').toLowerCase();
      handle = (node.config?.values || []).map(String).find(v => v.toLowerCase() === val) ?? 'other';
    } else if (node.type === 'wait') {
      handle = node.config?.mode === 'until' ? (answers[node.id] || 'timeout') : 'next';
      entry.assumed = node.config?.mode === 'until' && !answers[node.id];
    } else handle = 'next';
    entry.handle = handle;
    path.push(entry);
  }
  return { ok: true, entered: true, path, truncated: steps >= MAX_STEPS };
}

module.exports = { simulate, preview };
