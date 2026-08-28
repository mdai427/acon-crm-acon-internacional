const { test } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { fromPlaybook, fromRule, fromSequence, fromAutomation } = require('../../src/scripts/migrateToFlows');
const { validate } = require('../../src/services/flows/validate');

const ctx = { stages: ['nuevo', 'contacto', 'propuesta', 'negociacion'], waStatus: { unofficial: true } };
const oid = () => new mongoose.Types.ObjectId();
const ok = (spec) => { const { isActive, ...rest } = spec; const v = validate(rest, ctx); assert.ok(v.ok, JSON.stringify(v.errors)); return spec; };
const types = (spec) => spec.nodes.map(n => n.type);

test('playbook → flujo lineal con espera y condición onlyIf', () => {
  const spec = ok(fromPlaybook({
    _id: oid(), stage: 'propuesta', isActive: true, actions: [
      { kind: 'task', title: 'Revisar propuesta', dueInDays: 1, order: 0 },
      { kind: 'whatsapp', title: 'Seguimiento', message: 'Hola {contacto}', delayDays: 3, order: 1, onlyIf: { minScore: 50 } },
      { kind: 'ai_email_draft', title: 'Borrador', aiInstructions: 'Redacta cierre', order: 2 },
    ],
  }));
  assert.deepEqual(types(spec), ['trigger', 'create_task', 'wait', 'condition', 'send_whatsapp', 'ai_email_draft']);
  assert.equal(spec.trigger.type, 'lead.stage_entered');
  assert.deepEqual(spec.trigger.params.stages, ['propuesta']);
  const cond = spec.nodes[3];
  assert.deepEqual(cond.config.condition.rules, [{ field: 'score', cmp: 'gte', value: 50 }]);
  const noEdge = spec.edges.find(e => e.from === cond.id && e.fromHandle === 'no');
  assert.equal(noEdge.to, spec.nodes[5].id, 'la salida «no» salta el WhatsApp');
  assert.equal(spec.nodes[2].config.amount, 3);
  assert.equal(spec.origin, 'migrated_playbook');
});

test('playbook viejo con sólo tasks[] de texto', () => {
  const spec = ok(fromPlaybook({ _id: oid(), stage: 'nuevo', isActive: false, tasks: [{ title: 'Llamar', dueInDays: 1, order: 0 }] }));
  assert.deepEqual(types(spec), ['trigger', 'create_task']);
  assert.equal(spec.isActive, false);
});

test('regla days_inactive → lead.inactive con doble canal y cooldown', () => {
  const spec = ok(fromRule({
    _id: oid(), name: 'Inactivos 7d', isActive: true, cooldownDays: 5, maxExecutions: 0,
    trigger: { type: 'days_inactive', value: 7, stages: ['contacto'] },
    action: { type: 'whatsapp_and_email', message: 'Seguimos?', subject: 'Seguimiento', delayHours: 2 },
  }));
  assert.deepEqual(types(spec), ['trigger', 'wait', 'send_whatsapp', 'send_email']);
  assert.equal(spec.trigger.type, 'lead.inactive');
  assert.equal(spec.trigger.params.days, 7);
  assert.equal(spec.settings.cooldownDays, 5);
  assert.equal(spec.settings.allowReentry, true);
});

test('regla score_below → lead.score_changed hacia abajo', () => {
  const spec = ok(fromRule({ _id: oid(), name: 'Score bajo', trigger: { type: 'score_below', value: 30 }, action: { type: 'task', taskTitle: 'Revisar' }, maxExecutions: 1 }));
  assert.equal(spec.trigger.type, 'lead.score_changed');
  assert.deepEqual(spec.trigger.params, { threshold: 30, direction: 'below' });
  assert.equal(spec.settings.allowReentry, false);
});

test('secuencia → esperas por paso, skipIf invertido, manual si no hay auto-enroll', () => {
  const spec = ok(fromSequence({
    _id: oid(), name: 'Nurturing', isActive: true, cooldownDays: 10, autoEnrollTrigger: { type: 'none' },
    steps: [
      { order: 0, delayHours: 0, channel: 'whatsapp', message: 'Hola', skipIf: { type: 'none' } },
      { order: 1, delayHours: 48, channel: 'email', subject: 'Info', message: 'Adjunto', skipIf: { type: 'stage_is', stages: ['negociacion'] } },
      { order: 2, delayHours: 72, channel: 'task', taskTitle: 'Llamar', skipIf: { type: 'has_reply' } },
    ],
  }));
  assert.equal(spec.trigger.type, 'manual');
  assert.deepEqual(types(spec), ['trigger', 'send_whatsapp', 'wait', 'condition', 'send_email', 'wait', 'note', 'create_task']);
  assert.deepEqual(spec.nodes[3].config.condition.rules, [{ field: 'stage', cmp: 'nin', value: ['negociacion'] }]);
  assert.equal(spec.nodes[2].config.unit, 'hours');
});

test('automatización marketing → mapeo de disparadores y acciones', () => {
  const userId = oid();
  const spec = ok(fromAutomation({
    _id: oid(), name: 'Bienvenida', isActive: true,
    trigger: { type: 'lead_created' },
    actions: [
      { type: 'send_email', body: 'Bienvenido', delay: 0 },
      { type: 'assign_to', value: String(userId) },
      { type: 'change_stage', value: 'contacto', delay: 24 },
      { type: 'notify_exec', body: 'Nuevo lead' },
    ],
  }));
  assert.equal(spec.trigger.type, 'lead.created');
  assert.deepEqual(types(spec), ['trigger', 'send_email', 'assign', 'wait', 'change_stage', 'notify']);
  assert.deepEqual(spec.nodes[2].config, { mode: 'user', userId: String(userId) });
  const dated = fromAutomation({ _id: oid(), name: 'X', trigger: { type: 'date_based', value: 3 }, actions: [] });
  assert.equal(dated.trigger.type, 'lead.date_reached');
  assert.equal(dated.trigger.params.offsetDays, 3);
});

test('flujo migrado con WhatsApp oficial sin plantilla Meta no valida (queda borrador)', () => {
  const spec = fromRule({ _id: oid(), name: 'R', trigger: { type: 'stage_entered', stages: ['nuevo'] }, action: { type: 'whatsapp', message: 'hola' } });
  const { isActive, ...rest } = spec;
  const v = validate(rest, { ...ctx, waStatus: { unofficial: false } });
  assert.equal(v.ok, false);
});
