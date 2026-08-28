// Integración del motor contra un Mongo real. Se salta si no hay
// MONGODB_TEST_URI (p. ej. mongodb://127.0.0.1:27019/acon_flows_test).
const test = require('node:test');
const assert = require('node:assert/strict');

const URI = process.env.MONGODB_TEST_URI;

if (!URI) {
  test('motor de flujos (integración)', { skip: 'define MONGODB_TEST_URI para correrlo' }, () => {});
} else {
  const mongoose = require('mongoose');
  const Lead = require('../../src/models/Lead');
  const User = require('../../src/models/User');
  const Activity = require('../../src/models/Activity');
  const Flow = require('../../src/models/Flow');
  const FlowRun = require('../../src/models/FlowRun');
  const engine = require('../../src/services/flows/engine');
  const { onEvent } = engine;

  const ev = (name, payload) => onEvent({ name, eventId: `${name}-${Math.random()}`, at: new Date(), ...payload }, {});

  const flowDef = (over = {}) => ({
    name: 'Seguimiento de propuesta', status: 'published', isActive: true, version: 1,
    trigger: { type: 'lead.stage_entered', params: { stages: ['proposal'] }, entryFilters: { op: 'and', rules: [] } },
    settings: { allowReentry: false, cooldownDays: 7, onDeactivate: 'pause' },
    nodes: [
      { id: 'start', type: 'trigger', label: 'Inicio' },
      { id: 't0', type: 'create_task', label: 'Revisar propuesta', config: { title: 'Revisar propuesta de {empresa}', dueInDays: 1 } },
      { id: 'w1', type: 'wait', label: 'Esperar respuesta', config: { mode: 'until', until: { event: 'message.received', filter: { channel: 'any' } }, maxAmount: 2, maxUnit: 'days' } },
      { id: 'tag', type: 'tag', label: 'Etiquetar', config: { tag: 'respondio' } },
      { id: 'c1', type: 'condition', label: '¿Valor alto?', config: { condition: { rules: [{ field: 'value', cmp: 'gt', value: 50000 }] } } },
      { id: 'big', type: 'create_task', label: 'Escalar', config: { title: 'Escalar {empresa} a dirección' } },
      { id: 'small', type: 'create_task', label: 'Llamar', config: { title: 'Llamar a {contacto}' } },
    ],
    edges: [
      { id: 'e1', from: 'start', fromHandle: 'next', to: 't0' },
      { id: 'e2', from: 't0', fromHandle: 'next', to: 'w1' },
      { id: 'e3', from: 'w1', fromHandle: 'happened', to: 'tag' },
      { id: 'e4', from: 'w1', fromHandle: 'timeout', to: 'c1' },
      { id: 'e5', from: 'c1', fromHandle: 'yes', to: 'big' },
      { id: 'e6', from: 'c1', fromHandle: 'no', to: 'small' },
    ],
    ...over,
  });

  async function publish(def) {
    const f = await Flow.create(def);
    f.published = { version: 1, trigger: def.trigger, settings: def.settings, nodes: def.nodes, edges: def.edges, at: new Date() };
    await f.save();
    return f;
  }

  test.before(async () => { await mongoose.connect(URI); await mongoose.connection.db.dropDatabase(); });
  test.after(async () => { await mongoose.connection.db.dropDatabase(); await mongoose.disconnect(); });
  test.beforeEach(async () => { await Promise.all([Lead.deleteMany({}), Activity.deleteMany({}), Flow.deleteMany({}), FlowRun.deleteMany({})]); });

  let user;
  test.before(async () => {
    user = await User.create({ name: 'Luis', email: 'luis@acon.test', password: 'Secreta#12345', role: 'executive' });
  });

  const mkLead = (over = {}) => Lead.create({ company: 'ACME', contact: 'Ana', email: 'ana@acme.test', stage: 'proposal', value: 80000, assignedTo: user._id, ...over });

  test('entra por etapa, ejecuta, espera y termina al responder', async () => {
    const flow = await publish(flowDef());
    const lead = await mkLead();

    await ev('lead.stage_entered', { leadId: lead._id, stage: 'proposal', from: 'qualified' });
    let run = await FlowRun.findOne({ lead: lead._id, flow: flow._id });
    assert.ok(run, 'se creó la ejecución');
    assert.equal(run.status, 'waiting');
    assert.equal(run.currentNodeId, 'w1');
    assert.equal(run.waitingFor.kind, 'event');
    const task = await Activity.findOne({ lead: lead._id, type: 'task' });
    assert.equal(task.subject, 'Revisar propuesta de ACME');
    assert.equal(task.metadata.source, 'flow');

    // No entra dos veces
    await ev('lead.stage_entered', { leadId: lead._id, stage: 'proposal', from: 'qualified' });
    assert.equal(await FlowRun.countDocuments({ lead: lead._id }), 1);

    await ev('message.received', { leadId: lead._id, channel: 'whatsapp', text: 'Sí, me interesa' });
    run = await FlowRun.findById(run._id);
    assert.equal(run.status, 'completed');
    const l = await Lead.findById(lead._id);
    assert.deepEqual(l.tags, ['respondio']);
    assert.ok(run.stepLog.some(s => s.result === 'resumed' && s.handle === 'happened'));

    const f = await Flow.findById(flow._id);
    assert.equal(f.stats.runsTotal, 1);
    assert.equal(f.stats.runsActive, 0);
  });

  test('se agota la espera por cron y toma la rama de condición', async () => {
    await publish(flowDef());
    const lead = await mkLead({ value: 100 });
    await ev('lead.stage_entered', { leadId: lead._id, stage: 'proposal' });
    await FlowRun.updateMany({ lead: lead._id }, { nextRunAt: new Date(Date.now() - 1000) });

    const n = await engine.processDue(null);
    assert.equal(n, 1);
    const run = await FlowRun.findOne({ lead: lead._id });
    assert.equal(run.status, 'completed');
    const tasks = await Activity.find({ lead: lead._id, type: 'task' }).sort({ createdAt: 1 });
    assert.deepEqual(tasks.map(t => t.subject), ['Revisar propuesta de ACME', 'Llamar a Ana']);
  });

  test('cambiar a otra etapa cancela la ejecución', async () => {
    await publish(flowDef());
    const lead = await mkLead();
    await ev('lead.stage_entered', { leadId: lead._id, stage: 'proposal' });
    await ev('lead.stage_entered', { leadId: lead._id, stage: 'negotiation', from: 'proposal' });
    const run = await FlowRun.findOne({ lead: lead._id });
    assert.equal(run.status, 'exited');
    assert.match(run.exitReason, /negotiation/);
  });

  test('filtros de entrada, inactivos y flujos no publicados no entran', async () => {
    await publish(flowDef({ trigger: { type: 'lead.stage_entered', params: { stages: ['proposal'] }, entryFilters: { op: 'and', rules: [{ field: 'score', cmp: 'gte', value: 50 }] } } }));
    const low = await mkLead({ score: 10 });
    await ev('lead.stage_entered', { leadId: low._id, stage: 'proposal' });
    assert.equal(await FlowRun.countDocuments({ lead: low._id }), 0);

    const off = await mkLead({ score: 90, isActive: false });
    await ev('lead.stage_entered', { leadId: off._id, stage: 'proposal' });
    assert.equal(await FlowRun.countDocuments({ lead: off._id }), 0);

    await Flow.updateMany({}, { isActive: false });
    const ok = await mkLead({ score: 90 });
    await ev('lead.stage_entered', { leadId: ok._id, stage: 'proposal' });
    assert.equal(await FlowRun.countDocuments({ lead: ok._id }), 0);
  });

  test('un envío que falla se degrada a tarea manual y el flujo sigue', async () => {
    await publish(flowDef({
      nodes: [
        { id: 'start', type: 'trigger' },
        { id: 'wa', type: 'send_whatsapp', label: 'WhatsApp de bienvenida', config: { metaTemplate: { name: 'bienvenida' } } },
        { id: 'done', type: 'create_task', config: { title: 'Después del WhatsApp' } },
      ],
      edges: [{ id: '1', from: 'start', to: 'wa' }, { id: '2', from: 'wa', to: 'done' }],
    }));
    const lead = await mkLead({ phone: '', whatsapp: '' }); // sin número → falla
    await ev('lead.stage_entered', { leadId: lead._id, stage: 'proposal' });
    const run = await FlowRun.findOne({ lead: lead._id });
    assert.equal(run.status, 'completed');
    const tasks = await Activity.find({ lead: lead._id, type: 'task' }).sort({ createdAt: 1 });
    assert.equal(tasks.length, 2);
    assert.match(tasks[0].subject, /^\[Manual\] WhatsApp de bienvenida/);
    assert.equal(tasks[0].metadata.failedKind, 'send_whatsapp');
    assert.equal(tasks[1].subject, 'Después del WhatsApp');
  });

  test('frecuencia global: el segundo envío del día se pospone', async () => {
    await publish(flowDef({
      nodes: [
        { id: 'start', type: 'trigger' },
        { id: 'm1', type: 'send_email', config: { subject: 'Uno', body: 'x' } },
        { id: 'm2', type: 'send_email', config: { subject: 'Dos', body: 'y' } },
      ],
      edges: [{ id: '1', from: 'start', to: 'm1' }, { id: '2', from: 'm1', to: 'm2' }],
    }));
    const lead = await mkLead();
    // Simula que ya salió un correo automático hoy.
    await Activity.create({ lead: lead._id, type: 'email_out', direction: 'outbound', isAuto: true, content: 'previo', metadata: { source: 'playbook' } });
    await ev('lead.stage_entered', { leadId: lead._id, stage: 'proposal' });
    const run = await FlowRun.findOne({ lead: lead._id });
    assert.equal(run.status, 'waiting');
    assert.equal(run.currentNodeId, 'm1');
    assert.equal(run.waitingFor.retryNode, true);
    assert.ok(run.nextRunAt > new Date(Date.now() + 23 * 3600e3));
    assert.equal(run.stepLog.at(-1).result, 'postponed');
  });

  test('no_molestar omite envíos sin romper la cadena', async () => {
    await publish(flowDef({
      nodes: [
        { id: 'start', type: 'trigger' },
        { id: 'm1', type: 'send_email', config: { subject: 'Uno', body: 'x' } },
        { id: 'done', type: 'create_task', config: { title: 'Fin' } },
      ],
      edges: [{ id: '1', from: 'start', to: 'm1' }, { id: '2', from: 'm1', to: 'done' }],
    }));
    const lead = await mkLead({ tags: ['no_molestar'] });
    await ev('lead.stage_entered', { leadId: lead._id, stage: 'proposal' });
    const run = await FlowRun.findOne({ lead: lead._id });
    assert.equal(run.status, 'completed');
    assert.equal(run.stepLog.find(s => s.nodeId === 'm1').result, 'skipped');
    assert.equal(await Activity.countDocuments({ lead: lead._id, type: 'email_out' }), 0);
  });

  test('inscripción manual, reentrada y cooldown', async () => {
    const flow = await publish(flowDef({ settings: { allowReentry: true, cooldownDays: 7 }, nodes: [{ id: 'start', type: 'trigger' }, { id: 'x', type: 'exit', config: { reason: 'ok' } }], edges: [{ id: '1', from: 'start', to: 'x' }] }));
    const lead = await mkLead();
    const r1 = await engine.startRun({ flowDoc: flow, leadId: lead._id, triggeredBy: { type: 'manual' } });
    assert.equal(r1.status, 'exited');
    const r2 = await engine.startRun({ flowDoc: flow, leadId: lead._id, triggeredBy: { type: 'manual' } });
    assert.equal(r2, null, 'dentro del cooldown no reentra');
    await FlowRun.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 8 * 86400e3) } }); // createdAt es inmutable en Mongoose
    const r3 = await engine.startRun({ flowDoc: flow, leadId: lead._id, triggeredBy: { type: 'manual' } });
    assert.ok(r3, 'pasado el cooldown vuelve a entrar');
  });
}
