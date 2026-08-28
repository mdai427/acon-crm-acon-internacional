const test = require('node:test');
const assert = require('node:assert/strict');
const graph = require('../../src/services/flows/graph');
const { validate } = require('../../src/services/flows/validate');
const { simulate } = require('../../src/services/flows/simulate');
const { render, renderHtml } = require('../../src/services/flows/render');
const { triggerMatches } = require('../../src/services/flows/triggers');

// Flujo de referencia: propuesta → esperar respuesta → rama
const flow = {
  trigger: { type: 'lead.stage_entered', params: { stages: ['proposal'] }, entryFilters: { rules: [] } },
  settings: {},
  nodes: [
    { id: 'start', type: 'trigger', label: 'Inicio' },
    { id: 'w1', type: 'wait', label: 'Esperar 48 h o respuesta', config: { mode: 'until', until: { event: 'message.received', filter: { channel: 'any' } }, maxAmount: 48, maxUnit: 'hours' } },
    { id: 'wa', type: 'send_whatsapp', label: 'Seguimiento', config: { metaTemplate: { name: 'seguimiento', params: ['{contacto}'] } } },
    { id: 'c1', type: 'condition', label: '¿Valor alto?', config: { condition: { rules: [{ field: 'value', cmp: 'gt', value: 50000 }] } } },
    { id: 'n1', type: 'notify', label: 'Avisar director', config: { title: 'Cierre grande: {empresa}' } },
    { id: 't1', type: 'create_task', label: 'Llamar', config: { title: 'Llamar a {contacto}' } },
    { id: 'x', type: 'exit', label: 'Respondió', config: { reason: 'El lead respondió' } },
  ],
  edges: [
    { id: 'e1', from: 'start', fromHandle: 'next', to: 'w1' },
    { id: 'e2', from: 'w1', fromHandle: 'happened', to: 'x' },
    { id: 'e3', from: 'w1', fromHandle: 'timeout', to: 'wa' },
    { id: 'e4', from: 'wa', fromHandle: 'next', to: 'c1' },
    { id: 'e5', from: 'c1', fromHandle: 'yes', to: 'n1' },
    { id: 'e6', from: 'c1', fromHandle: 'no', to: 't1' },
  ],
};

test('next sigue la salida correcta y cae en «other» en Dividir', () => {
  assert.equal(graph.next(flow, 'w1', 'timeout').id, 'wa');
  assert.equal(graph.next(flow, 'w1', 'happened').id, 'x');
  assert.equal(graph.next(flow, 't1', 'next'), null);
  const split = { nodes: [{ id: 's', type: 'split', config: { values: ['México'] } }, { id: 'a', type: 'exit' }, { id: 'b', type: 'exit' }],
    edges: [{ id: '1', from: 's', fromHandle: 'México', to: 'a' }, { id: '2', from: 's', fromHandle: 'other', to: 'b' }] };
  assert.equal(graph.next(split, 's', 'Chile').id, 'b');
  assert.equal(graph.next(split, 's', 'México').id, 'a');
});

test('waitPlan: duración fija y «hasta que» con tope', () => {
  const now = new Date('2026-08-27T15:00:00Z');
  const fixed = graph.waitPlan({ config: { amount: 2, unit: 'days' } }, now);
  assert.equal(fixed.kind, 'time');
  assert.equal(fixed.runAt.getTime(), now.getTime() + 2 * 86400e3);
  const until = graph.waitPlan(flow.nodes[1], now);
  assert.equal(until.kind, 'event');
  assert.equal(until.event, 'message.received');
  assert.equal(until.until.getTime(), now.getTime() + 48 * 3600e3);
});

test('nextBusinessTime salta fin de semana', () => {
  // Sábado 29 ago 2026 12:00 CDMX (18:00Z) → lunes 31 ago 09:00 CDMX
  const sat = new Date('2026-08-29T18:00:00Z');
  const d = graph.nextBusinessTime(sat);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(d);
  const get = t => parts.find(p => p.type === t).value;
  assert.equal(get('weekday'), 'Mon');
  assert.equal(Number(get('hour')) % 24, 9);
});

test('eventMatches respeta filtros', () => {
  const w = { kind: 'event', event: 'message.received', filter: { channel: 'whatsapp' } };
  assert.equal(graph.eventMatches(w, { name: 'message.received', channel: 'whatsapp' }), true);
  assert.equal(graph.eventMatches(w, { name: 'message.received', channel: 'email' }), false);
  assert.equal(graph.eventMatches(w, { name: 'lead.assigned' }), false);
  assert.equal(graph.eventMatches({ kind: 'event', event: 'message.status', filter: { status: 'read' } }, { name: 'message.status', status: 'delivered' }), false);
});

test('validate acepta el flujo de referencia', () => {
  const r = validate(flow, { stages: ['proposal'] });
  assert.deepEqual(r.errors, []);
});

test('validate detecta errores de estructura', () => {
  const bad = {
    trigger: { type: 'lead.stage_entered', params: { stages: [] } },
    nodes: [
      { id: 'start', type: 'trigger' },
      { id: 'a', type: 'create_task', config: { title: 'x' } },
      { id: 'b', type: 'create_task', config: { title: '' } },
      { id: 'wa', type: 'send_whatsapp', config: {} },
    ],
    edges: [
      { id: '1', from: 'start', to: 'a' },
      { id: '2', from: 'a', to: 'a' },          // bucle sin Esperar
      { id: '3', from: 'a', fromHandle: 'yes', to: 'b' }, // salida inexistente
    ],
  };
  const r = validate(bad, { stages: ['proposal'], waStatus: { unofficial: false } });
  const msgs = r.errors.map(e => e.message);
  assert.ok(msgs.some(m => m.includes('al menos una etapa')));
  assert.ok(msgs.some(m => m.includes('bucle')));
  assert.ok(msgs.some(m => m.includes('salida «yes»')));
  assert.ok(msgs.some(m => m.includes('no está conectado')));
  assert.ok(msgs.some(m => m.includes('plantilla aprobada')));
  assert.ok(msgs.some(m => m.includes('título')));
});

test('validate: sesión QR de Labia admite texto libre en WhatsApp', () => {
  const f = { ...flow, nodes: flow.nodes.map(n => n.id === 'wa' ? { ...n, config: { text: 'Hola {contacto}' } } : n) };
  assert.equal(validate(f, { stages: ['proposal'], waStatus: { unofficial: true } }).ok, true);
  assert.equal(validate(f, { stages: ['proposal'], waStatus: { unofficial: false } }).ok, false);
});

test('simulate recorre y respeta respuestas', () => {
  const lead = { company: 'ACME', contact: 'Ana', value: 80000, stage: 'proposal' };
  const ctx = { stageLabel: 'Propuesta', executive: { name: 'Luis' } };
  const noReply = simulate(flow, lead, ctx, {});
  assert.deepEqual(noReply.path.map(p => p.nodeId || p.type), ['start', 'w1', 'wa', 'c1', 'n1', 'end']);
  assert.equal(noReply.path[1].assumed, true);
  assert.equal(noReply.path[2].preview, 'Plantilla «seguimiento» con: Ana');
  assert.equal(noReply.path[4].preview, 'Aviso: Cierre grande: ACME');
  const replied = simulate(flow, lead, ctx, { w1: 'happened' });
  assert.deepEqual(replied.path.map(p => p.nodeId || p.type), ['start', 'w1', 'x']);
  const small = simulate(flow, { ...lead, value: 100 }, ctx, {});
  assert.ok(small.path.some(p => p.nodeId === 't1'));
});

test('render sustituye variables y escapa HTML', () => {
  const ctx = { lead: { company: 'A<b>', contact: 'Ana', value: 12000 }, stageLabel: 'Nuevo', executive: null };
  assert.equal(render('Hola {contacto} de {empresa}, {valor} USD, {ejecutivo}', ctx), 'Hola Ana de A<b>, 12,000 USD, el equipo ACON');
  assert.equal(renderHtml('{empresa}\nx', ctx), 'A&lt;b&gt;<br>x');
  assert.equal(render('{desconocida}', ctx), '{desconocida}');
});

test('triggerMatches por tipo', () => {
  assert.equal(triggerMatches({ type: 'lead.stage_entered', params: { stages: ['proposal'] } }, { name: 'lead.stage_entered', stage: 'proposal' }), true);
  assert.equal(triggerMatches({ type: 'lead.stage_entered', params: { stages: ['new'] } }, { name: 'lead.stage_entered', stage: 'proposal' }), false);
  assert.equal(triggerMatches({ type: 'lead.score_changed', params: { threshold: 80 } }, { name: 'lead.score_changed', previous: 70, score: 85 }), true);
  assert.equal(triggerMatches({ type: 'lead.score_changed', params: { threshold: 80 } }, { name: 'lead.score_changed', previous: 85, score: 90 }), false);
  assert.equal(triggerMatches({ type: 'lead.score_changed', params: { threshold: 40, direction: 'below' } }, { name: 'lead.score_changed', previous: 50, score: 30 }), true);
  assert.equal(triggerMatches({ type: 'message.received', params: { channel: 'whatsapp' } }, { name: 'message.received', channel: 'email' }), false);
  assert.equal(triggerMatches({ type: 'lead.assigned' }, { name: 'lead.created' }), false);
});
