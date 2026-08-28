// Utilidades puras del constructor de flujos (grafo nodes/edges).
// Todo devuelve copias nuevas: nunca muta el flujo recibido.

export const NODE_META = {
  trigger:        { label: 'Disparador',           group: 'control', color: 'navy' },
  wait:           { label: 'Esperar',              group: 'control', color: 'gray' },
  condition:      { label: 'Condición',            group: 'control', color: 'gray' },
  split:          { label: 'Dividir por',          group: 'control', color: 'gray' },
  exit:           { label: 'Salir del flujo',      group: 'control', color: 'gray' },
  note:           { label: 'Nota',                 group: 'control', color: 'gray' },
  send_whatsapp:  { label: 'Enviar WhatsApp',      group: 'action',  color: 'green' },
  send_email:     { label: 'Enviar correo',        group: 'action',  color: 'blue' },
  create_task:    { label: 'Crear tarea',          group: 'action',  color: 'orange' },
  notify:         { label: 'Avisar al equipo',     group: 'action',  color: 'orange' },
  ai_email_draft: { label: 'Borrador IA de correo', group: 'action', color: 'purple' },
  change_stage:   { label: 'Cambiar etapa',        group: 'crm',     color: 'navy' },
  assign:         { label: 'Asignar ejecutivo',    group: 'crm',     color: 'navy' },
  tag:            { label: 'Etiquetar',            group: 'crm',     color: 'navy' },
  update_field:   { label: 'Actualizar campo',     group: 'crm',     color: 'navy' },
  enroll_flow:    { label: 'Meter en otro flujo',  group: 'crm',     color: 'navy' },
};

export const GROUPS = [
  { id: 'action',  label: 'Comunicación y tareas' },
  { id: 'crm',     label: 'CRM' },
  { id: 'control', label: 'Control' },
];

export const CMP_LABELS = {
  eq: 'es', ne: 'no es', gt: 'mayor que', gte: 'mayor o igual', lt: 'menor que', lte: 'menor o igual',
  in: 'está en', nin: 'no está en', contains: 'contiene', exists: 'existe', not_exists: 'no existe',
};

export const CMP_BY_KIND = {
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'],
  enum:   ['eq', 'ne', 'in', 'nin'],
  text:   ['eq', 'ne', 'contains', 'exists', 'not_exists'],
  list:   ['contains', 'exists', 'not_exists'],
  id:     ['eq', 'ne', 'exists', 'not_exists'],
  bool:   ['eq'],
};

export const WAIT_EVENT_LABELS = {
  'message.received':   'el lead responda (WhatsApp o correo)',
  'message.status':     'cambie el estado del mensaje',
  'lead.stage_entered': 'cambie de etapa',
  'lead.assigned':      'se le asigne un ejecutivo',
  'email.opened':       'abra el correo',
  'activity.any':       'haya cualquier actividad',
};

export const UNIT_LABELS = { minutes: 'minutos', hours: 'horas', days: 'días' };

let seq = 0;
export const newId = (type) => `${type}_${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Salidas (handles) que ofrece un nodo. Debe coincidir con backend/graph.js. */
export function handlesOf(node) {
  switch (node.type) {
    case 'condition': return ['yes', 'no'];
    case 'wait':      return node.config?.mode === 'until' ? ['happened', 'timeout'] : ['next'];
    case 'split':     return [...(node.config?.values || []).map(String), 'other'];
    case 'exit':
    case 'note':      return [];
    default:          return ['next'];
  }
}

export const HANDLE_LABELS = {
  next: '', yes: 'Sí', no: 'No', happened: 'Ocurrió', timeout: 'Se agotó el tiempo', other: 'Otro',
};

export function emptyFlow() {
  return {
    name: 'Nuevo flujo',
    description: '',
    trigger: { type: 'lead.stage_entered', params: {} },
    settings: { allowReentry: false, cooldownDays: 30, businessHoursOnly: true, allowManualEnroll: true },
    nodes: [{ id: 'start', type: 'trigger', label: 'Disparador', config: {} }],
    edges: [],
  };
}

export function defaultConfig(type) {
  switch (type) {
    case 'wait':          return { mode: 'for', amount: 1, unit: 'days' };
    case 'condition':     return { condition: { op: 'and', rules: [{ field: 'stage', cmp: 'eq', value: '' }] } };
    case 'split':         return { field: 'source', values: [] };
    case 'send_whatsapp': return { mode: 'session', text: '' };
    case 'send_email':    return { subject: '', body: '' };
    case 'create_task':   return { title: '', dueInDays: 1, priority: 'medium' };
    case 'notify':        return { to: 'assigned', title: '' };
    case 'ai_email_draft': return { purpose: '', dueInDays: 1 };
    case 'assign':        return { mode: 'round_robin' };
    case 'update_field':  return { field: 'priority', value: 'high' };
    default:              return {};
  }
}

export function nextOf(flow, fromId, handle) {
  return flow.edges.find(e => e.from === fromId && (e.handle || 'next') === handle)?.to || null;
}

export function nodeById(flow, id) { return flow.nodes.find(n => n.id === id); }

/** Inserta un nodo nuevo en la salida (fromId, handle); lo que colgaba ahí pasa a colgar del nuevo (si es lineal). */
export function insertNode(flow, fromId, handle, type) {
  const node = { id: newId(type), type, label: NODE_META[type].label, config: defaultConfig(type) };
  const existing = flow.edges.find(e => e.from === fromId && (e.handle || 'next') === handle);
  const edges = flow.edges.filter(e => e !== existing);
  edges.push({ from: fromId, handle, to: node.id });
  if (existing && handlesOf(node).includes('next')) edges.push({ from: node.id, handle: 'next', to: existing.to });
  return { flow: { ...flow, nodes: [...flow.nodes, node], edges }, node };
}

/** Quita un nodo. Si era lineal, reconecta lo anterior con lo siguiente. Las ramas huérfanas se descartan. */
export function removeNode(flow, id) {
  if (id === 'start') return flow;
  const successor = nextOf(flow, id, 'next');
  const orphans = collectSubtree(flow, id).filter(n => n !== id && n !== successor && !reachableWithout(flow, n, id, successor));
  const drop = new Set([id, ...orphans]);
  const edges = flow.edges
    .filter(e => !drop.has(e.to) && !drop.has(e.from))
    .concat(flow.edges.filter(e => e.to === id && successor).map(e => ({ ...e, to: successor })));
  return { ...flow, nodes: flow.nodes.filter(n => !drop.has(n.id)), edges };
}

function collectSubtree(flow, id) {
  const seen = new Set();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    flow.edges.filter(e => e.from === cur).forEach(e => stack.push(e.to));
  }
  return [...seen];
}

// ¿Se llega a `target` desde start sin pasar por `removed`, contando que las entradas a
// `removed` saltan a `successor`? Sirve para no borrar ramas compartidas.
function reachableWithout(flow, target, removed, successor) {
  const seen = new Set();
  const stack = ['start'];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === target) return true;
    if (seen.has(cur) || cur === removed) continue;
    seen.add(cur);
    flow.edges.filter(e => e.from === cur).forEach(e => stack.push(e.to === removed ? successor : e.to));
  }
  return false;
}

export function updateNode(flow, id, patch) {
  return { ...flow, nodes: flow.nodes.map(n => (n.id === id ? { ...n, ...patch, config: { ...n.config, ...(patch.config || {}) } } : n)) };
}

/** Resumen corto de la config para la tarjeta del canvas. */
export function summarize(node, ctx = {}) {
  const c = node.config || {};
  switch (node.type) {
    case 'wait':
      return c.mode === 'until'
        ? `Hasta que ${WAIT_EVENT_LABELS[c.until?.event] || '…'} (máx. ${c.maxAmount || 7} ${UNIT_LABELS[c.maxUnit || 'days']})`
        : `${c.amount || '?'} ${UNIT_LABELS[c.unit] || c.unit || ''}`;
    case 'condition': {
      const rules = c.condition?.rules || [];
      if (!rules.length) return 'Sin reglas';
      const txt = rules.map(r => `${ctx.fieldLabel?.(r.field) || r.field} ${CMP_LABELS[r.cmp || 'eq']} ${r.value ?? ''}`).join(c.condition?.op === 'or' ? ' o ' : ' y ');
      return txt;
    }
    case 'split':         return `${ctx.fieldLabel?.(c.field) || c.field}: ${(c.values || []).join(', ') || '—'}`;
    case 'send_whatsapp': return c.mode === 'template' ? `Plantilla Meta: ${c.metaTemplate?.name || '—'}` : (c.aiInstructions ? 'Redactado por IA' : (c.text || 'Sin mensaje'));
    case 'send_email':    return c.templateId ? 'Plantilla del CRM' : (c.aiInstructions ? 'Redactado por IA' : (c.subject || 'Sin asunto'));
    case 'create_task':   return `${c.title || 'Sin título'} · vence en ${c.dueInDays ?? 1} d`;
    case 'notify':        return c.title || 'Sin título';
    case 'ai_email_draft': return c.purpose || 'Sin propósito';
    case 'change_stage':  return ctx.stageLabel?.(c.stage) || c.stage || 'Elige etapa';
    case 'assign':        return { user: 'A un usuario fijo', round_robin: 'Round-robin', by_country: 'Por país' }[c.mode] || '—';
    case 'tag':           return `${c.remove ? 'Quitar' : 'Añadir'} «${c.tag || ''}»`;
    case 'update_field':  return `${c.field} → ${c.value}`;
    case 'enroll_flow':   return ctx.flowName?.(c.flowId) || 'Elige flujo';
    case 'note':          return c.text || '';
    default:              return '';
  }
}

export function describeTrigger(trigger, ctx = {}) {
  const p = trigger?.params || {};
  switch (trigger?.type) {
    case 'lead.created':       return `Se crea un lead${p.sources?.length ? ` desde ${p.sources.join(', ')}` : ''}`;
    case 'lead.stage_entered': return `Entra a ${p.stages?.length ? p.stages.map(s => ctx.stageLabel?.(s) || s).join(' / ') : 'cualquier etapa'}`;
    case 'lead.score_changed': return `El score ${p.direction === 'below' ? 'baja de' : 'supera'} ${p.threshold ?? '?'}`;
    case 'lead.assigned':      return 'Se asigna un ejecutivo';
    case 'message.received':   return `El lead escribe${p.channel ? ` por ${p.channel}` : ''}`;
    case 'quote.sent':         return 'Se envía una cotización';
    case 'quote.accepted':     return 'Aceptan una cotización';
    case 'quote.rejected':     return 'Rechazan una cotización';
    case 'call.ended':         return `Termina una llamada${p.outcome ? ` (${p.outcome})` : ''}`;
    case 'lead.inactive':      return `${p.days || '?'} días sin contacto`;
    case 'lead.date_reached':  return `${p.offsetDays ?? 0} días después de ${p.field || '?'}`;
    case 'manual':             return 'Sólo manual';
    default:                   return trigger?.type || '';
  }
}
