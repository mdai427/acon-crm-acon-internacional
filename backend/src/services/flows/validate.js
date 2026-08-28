// ============================================
// Validación de un flujo antes de guardar/publicar
// ============================================
//
// Devuelve { ok, errors: [{ nodeId?, message }] }. Los mensajes van dirigidos
// al usuario del constructor, no al programador.

const { FIELDS } = require('./conditions');
const { handlesOf, byId } = require('./graph');

const WAIT_EVENTS = ['message.received', 'message.status', 'lead.stage_entered', 'lead.assigned', 'email.opened', 'activity.any'];

function validateCondition(cond, where, errors, nodeId) {
  for (const r of cond?.rules || []) {
    if (!FIELDS[r.field]) errors.push({ nodeId, message: `${where}: el campo «${r.field}» no existe` });
  }
}

const VALIDATORS = {
  wait(n, c, errors) {
    if (c.mode === 'until') {
      if (!WAIT_EVENTS.includes(c.until?.event)) errors.push({ nodeId: n.id, message: 'Esperar «hasta que…» necesita elegir qué esperar' });
    } else if (!(Number(c.amount) > 0)) {
      errors.push({ nodeId: n.id, message: 'Esperar necesita una duración mayor que cero' });
    }
  },
  condition(n, c, errors) {
    if (!c.condition?.rules?.length) errors.push({ nodeId: n.id, message: 'La Condición no tiene ninguna regla' });
    validateCondition(c.condition, 'Condición', errors, n.id);
  },
  split(n, c, errors) {
    if (!c.field || !FIELDS[c.field]) errors.push({ nodeId: n.id, message: 'Dividir por necesita un campo válido' });
    if (!c.values?.length) errors.push({ nodeId: n.id, message: 'Dividir por necesita al menos un valor' });
  },
  send_whatsapp(n, c, errors, ctx) {
    const unofficial = ctx.waStatus?.unofficial;
    if (unofficial) {
      if (!c.text?.trim() && !c.aiInstructions?.trim()) errors.push({ nodeId: n.id, message: 'Escribe el mensaje de WhatsApp' });
    } else if (!c.metaTemplate?.name) {
      errors.push({ nodeId: n.id, message: 'WhatsApp automático necesita una plantilla aprobada de Meta' });
    }
  },
  send_email(n, c, errors) {
    if (!c.templateId && !c.body?.trim() && !c.aiInstructions?.trim()) {
      errors.push({ nodeId: n.id, message: 'El correo necesita una plantilla, un cuerpo o instrucciones para la IA' });
    }
  },
  create_task(n, c, errors) { if (!c.title?.trim()) errors.push({ nodeId: n.id, message: 'La tarea necesita un título' }); },
  notify(n, c, errors)      { if (!c.title?.trim()) errors.push({ nodeId: n.id, message: 'El aviso necesita un título' }); },
  ai_email_draft(n, c, errors) { if (!c.purpose?.trim()) errors.push({ nodeId: n.id, message: 'Indica qué debe redactar la IA' }); },
  change_stage(n, c, errors, ctx) {
    if (!c.stage) errors.push({ nodeId: n.id, message: 'Elige la etapa destino' });
    else if (ctx.stages && !ctx.stages.includes(c.stage)) errors.push({ nodeId: n.id, message: `La etapa «${c.stage}» ya no existe` });
  },
  assign(n, c, errors) { if (!['user', 'round_robin', 'by_country'].includes(c.mode)) errors.push({ nodeId: n.id, message: 'Elige cómo asignar' }); else if (c.mode === 'user' && !c.userId) errors.push({ nodeId: n.id, message: 'Elige el ejecutivo' }); },
  tag(n, c, errors)    { if (!c.tag?.trim()) errors.push({ nodeId: n.id, message: 'Escribe la etiqueta' }); },
  update_field(n, c, errors) {
    if (!['priority', 'value', 'notes'].includes(c.field)) errors.push({ nodeId: n.id, message: 'Ese campo no se puede modificar desde un flujo' });
  },
  enroll_flow(n, c, errors) { if (!c.flowId) errors.push({ nodeId: n.id, message: 'Elige el flujo destino' }); },
};

/**
 * @param {object} flow  { trigger, nodes, edges }
 * @param {object} ctx   { stages: [keys], waStatus }
 */
function validate(flow, ctx = {}) {
  const errors = [];
  const nodes = flow.nodes || [];
  const edges = flow.edges || [];
  const map = byId(flow);

  // Disparador
  if (!flow.trigger?.type) errors.push({ message: 'El flujo necesita un inicio' });
  if (flow.trigger?.type === 'lead.stage_entered' && !flow.trigger.params?.stages?.length) {
    errors.push({ message: 'Elige al menos una etapa para el inicio' });
  }
  if (flow.trigger?.type === 'lead.inactive' && !(Number(flow.trigger.params?.days) > 0)) {
    errors.push({ message: 'Indica los días sin contacto del inicio' });
  }
  if (flow.trigger?.type === 'lead.score_changed' && !(Number(flow.trigger.params?.threshold) >= 0)) {
    errors.push({ message: 'Indica el score que dispara el inicio' });
  }
  validateCondition(flow.trigger?.entryFilters, 'Filtros de entrada', errors);

  // Un único paso de inicio
  const starts = nodes.filter(n => n.type === 'trigger');
  if (starts.length !== 1) errors.push({ message: starts.length ? 'Sólo puede haber un paso de inicio' : 'Falta el paso de inicio en el canvas' });

  // Aristas válidas
  const ids = new Set(nodes.map(n => n.id));
  if (ids.size !== nodes.length) errors.push({ message: 'Hay pasos con el mismo identificador' });
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) { errors.push({ message: 'Hay una conexión que apunta a un paso inexistente' }); continue; }
    const from = map[e.from];
    if (!handlesOf(from).includes(e.fromHandle || 'next')) {
      errors.push({ nodeId: e.from, message: `El paso «${from.label || from.type}» no tiene la salida «${e.fromHandle}»` });
    }
  }
  const dupOut = new Set();
  for (const e of edges) {
    const k = `${e.from}:${e.fromHandle || 'next'}`;
    if (dupOut.has(k)) errors.push({ nodeId: e.from, message: 'Una salida sólo puede conectarse a un paso' });
    dupOut.add(k);
  }

  // Alcanzables desde el inicio
  if (starts.length === 1) {
    const seen = new Set([starts[0].id]);
    const stack = [starts[0].id];
    while (stack.length) {
      const id = stack.pop();
      for (const e of edges.filter(x => x.from === id)) if (!seen.has(e.to)) { seen.add(e.to); stack.push(e.to); }
    }
    for (const n of nodes) {
      if (n.type !== 'note' && !seen.has(n.id)) errors.push({ nodeId: n.id, message: `El paso «${n.label || n.type}» no está conectado al inicio` });
    }
    if (!edges.some(e => e.from === starts[0].id)) errors.push({ message: 'El inicio no está conectado a ningún paso' });
  }

  // Ciclos sin un Esperar en medio = bucle infinito
  const adj = {};
  for (const e of edges) (adj[e.from] ||= []).push(e.to);
  const color = {};
  const dfs = (id, waitsOnPath) => {
    color[id] = 1;
    const isWait = map[id]?.type === 'wait';
    for (const to of adj[id] || []) {
      const w = waitsOnPath || isWait;
      if (color[to] === 1 && !w) { errors.push({ nodeId: to, message: 'Hay un bucle sin ningún Esperar en medio' }); return; }
      if (!color[to]) dfs(to, w);
    }
    color[id] = 2;
  };
  for (const n of nodes) if (!color[n.id]) dfs(n.id, false);

  // Configuración por tipo
  for (const n of nodes) {
    const v = VALIDATORS[n.type];
    if (v) v(n, n.config || {}, errors, ctx);
  }

  return { ok: errors.length === 0, errors };
}

module.exports = { validate, WAIT_EVENTS };
