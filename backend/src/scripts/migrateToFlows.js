#!/usr/bin/env node
// ============================================
// Migración: Playbooks + Reglas de seguimiento + Secuencias +
// Automatizaciones de Marketing  →  Flujos (models/Flow)
// ============================================
//
//   node src/scripts/migrateToFlows.js            # migra y publica
//   node src/scripts/migrateToFlows.js --dry      # sólo muestra qué haría
//   node src/scripts/migrateToFlows.js --deactivate-legacy
//        # además apaga (isActive=false) los documentos viejos migrados para
//        # que los runners antiguos dejen de dispararlos (evita duplicados).
//
// Idempotente: un Flow con migratedFrom {model,id} no se vuelve a crear.
// Cada flujo migrado se valida; si pasa, se publica con la misma actividad que
// tenía el original. Si no pasa (p. ej. WhatsApp oficial sin plantilla Meta),
// queda como borrador y se listan los errores para corregirlos en el editor.

require('dotenv').config();
const mongoose = require('mongoose');

const Flow = require('../models/Flow');
const Playbook = require('../models/Playbook');
const FollowUpRule = require('../models/FollowUpRule');
const Sequence = require('../models/Sequence');
const { validate } = require('../services/flows/validate');

const DRY = process.argv.includes('--dry');
const DEACTIVATE = process.argv.includes('--deactivate-legacy');

// ── Constructor lineal de grafos ────────────────────────────────────
// Encadena pasos uno tras otro; `condition` abre una rama «sí» y la «no»
// salta al siguiente paso real.
function graphBuilder() {
  const nodes = [];
  const edges = [];
  let seq = 0;
  let cursor = null; // { id, handle }
  const pendingNo = []; // salidas «no» de condiciones que esperan el próximo paso

  const y = () => 80 + nodes.length * 140;
  const nid = (t) => `${t}_${++seq}`;

  function add(type, label, config = {}, handle = 'next') {
    const id = nid(type);
    nodes.push({ id, type, label, position: { x: 120, y: y() }, config });
    if (cursor) edges.push({ id: `e_${cursor.id}_${cursor.handle}_${id}`, from: cursor.id, fromHandle: cursor.handle, to: id });
    for (const p of pendingNo.splice(0)) edges.push({ id: `e_${p.id}_no_${id}`, from: p.id, fromHandle: 'no', to: id });
    cursor = { id, handle };
    return id;
  }
  // Condición: el siguiente `add` cuelga de «sí»; la «no» salta al paso
  // posterior a ese.
  function condition(label, cond) {
    const id = add('condition', label, { condition: cond }, 'yes');
    return { skipNoTo: () => pendingNo.push({ id }) };
  }
  // Nota suelta (sin conexiones): las notas no tienen salidas en el grafo.
  function note(text) {
    nodes.push({ id: nid('note'), type: 'note', label: text, position: { x: 420, y: y() }, config: {} });
  }
  return { nodes, edges, add, condition, note, pendingNo };
}

// Cuando una condición protege UN solo paso, la salida «no» debe saltar ese
// paso: se registra tras añadirlo.
function guarded(g, cond, label, addStep) {
  const c = g.condition(label, cond);
  addStep();
  c.skipNoTo();
}

function waitNode(g, amount, unit) {
  if (!(Number(amount) > 0)) return;
  g.add('wait', `Esperar ${amount} ${unit}`, { mode: 'for', amount: Number(amount), unit });
}

// ── Mapeos de acciones ──────────────────────────────────────────────
function playbookAction(g, a) {
  const cond = onlyIfToCondition(a.onlyIf);
  const step = () => {
    switch (a.kind) {
      case 'whatsapp':
        return g.add('send_whatsapp', a.title, {
          text: a.message || '', aiInstructions: a.aiInstructions || '',
          metaTemplate: a.metaTemplate?.name ? a.metaTemplate : undefined,
        });
      case 'email':
        return g.add('send_email', a.title, {
          subject: a.subject || a.title, body: a.message || '',
          templateId: a.templateId || undefined, aiInstructions: a.aiInstructions || '',
        });
      case 'ai_email_draft':
        return g.add('ai_email_draft', a.title, { purpose: a.aiInstructions || a.message || a.title, dueInDays: a.dueInDays || 1 });
      case 'notify':
        return g.add('notify', a.title, { to: 'assigned', title: a.title, message: a.message || '' });
      default:
        return g.add('create_task', a.title, { title: a.title, message: a.message || '', dueInDays: a.dueInDays ?? 2, priority: 'medium' });
    }
  };
  waitNode(g, a.delayDays, 'days');
  if (cond) guarded(g, cond, `Sólo si ${describeCond(cond)}`, step); else step();
}

function onlyIfToCondition(o) {
  if (!o) return null;
  const rules = [];
  if (o.minScore != null) rules.push({ field: 'score', cmp: 'gte', value: o.minScore });
  if (o.maxScore != null) rules.push({ field: 'score', cmp: 'lte', value: o.maxScore });
  if (o.minValue != null) rules.push({ field: 'value', cmp: 'gte', value: o.minValue });
  return rules.length ? { op: 'and', rules } : null;
}
const describeCond = (c) => c.rules.map(r => `${r.field} ${r.cmp} ${Array.isArray(r.value) ? r.value.join('/') : r.value}`).join(' y ');

function channelStep(g, ch, { message, subject, taskTitle, templateId, title }) {
  switch (ch) {
    case 'whatsapp': return g.add('send_whatsapp', title || 'WhatsApp', { text: message || '' });
    case 'email':    return g.add('send_email', title || 'Correo', { subject: subject || title || 'Seguimiento', body: message || '', templateId: templateId || undefined });
    default:         return g.add('create_task', taskTitle || title || 'Tarea', { title: taskTitle || title || message || 'Seguimiento', message: message || '', dueInDays: 2, priority: 'medium' });
  }
}

// ── Conversores por sistema ─────────────────────────────────────────
function fromPlaybook(pb) {
  const g = graphBuilder();
  g.add('trigger', `Entra a ${pb.stage}`);
  const actions = (pb.actions?.length ? pb.actions : (pb.tasks || []).map(t => ({ kind: 'task', title: t.title, dueInDays: t.dueInDays, order: t.order })))
    .slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  for (const a of actions) playbookAction(g, a);
  return {
    name: `Playbook · ${pb.stage}`,
    description: pb.useAI && !actions.length ? 'Migrado de Playbooks. El original dejaba a la IA sugerir tareas; añade aquí los pasos.' : 'Migrado de Playbooks.',
    isActive: pb.isActive,
    trigger: { type: 'lead.stage_entered', params: { stages: [pb.stage] }, entryFilters: { op: 'and', rules: [] } },
    settings: { allowReentry: true, cooldownDays: 0, onDeactivate: 'pause', businessHoursOnly: false, allowManualEnroll: true },
    origin: 'migrated_playbook', migratedFrom: { model: 'Playbook', id: pb._id },
    nodes: g.nodes, edges: g.edges,
  };
}

function fromRule(r) {
  const g = graphBuilder();
  g.add('trigger', r.name);
  waitNode(g, r.action?.delayHours, 'hours');
  const a = r.action || {};
  const opts = { message: a.message, subject: a.subject, taskTitle: a.taskTitle, templateId: a.template && mongoose.isValidObjectId(a.template) ? a.template : undefined, title: r.name };
  if (a.type === 'whatsapp_and_email') { channelStep(g, 'whatsapp', opts); channelStep(g, 'email', opts); }
  else channelStep(g, a.type, opts);

  const t = r.trigger || {};
  let trigger;
  if (t.type === 'days_inactive')      trigger = { type: 'lead.inactive', params: { days: t.value || 7, stages: t.stages || [] } };
  else if (t.type === 'score_below')   trigger = { type: 'lead.score_changed', params: { threshold: t.value || 0, direction: 'below' } };
  else                                 trigger = { type: 'lead.stage_entered', params: { stages: t.stages || [] } };
  trigger.entryFilters = { op: 'and', rules: [] };
  if (t.type !== 'stage_entered' && t.stages?.length) trigger.entryFilters.rules.push({ field: 'stage', cmp: 'in', value: t.stages });

  return {
    name: `Regla · ${r.name}`, description: r.description || 'Migrado de Reglas de seguimiento.', isActive: r.isActive,
    trigger,
    settings: { allowReentry: r.maxExecutions !== 1, cooldownDays: r.cooldownDays ?? 3, onDeactivate: 'pause', businessHoursOnly: false, allowManualEnroll: true },
    origin: 'migrated_rule', migratedFrom: { model: 'FollowUpRule', id: r._id },
    nodes: g.nodes, edges: g.edges,
  };
}

function fromSequence(s) {
  const g = graphBuilder();
  g.add('trigger', s.name);
  const steps = (s.steps || []).slice().sort((a, b) => a.order - b.order);
  for (const st of steps) {
    waitNode(g, st.delayHours, 'hours');
    const step = () => channelStep(g, st.channel, { message: st.message, subject: st.subject, taskTitle: st.taskTitle, title: `Paso ${st.order + 1}` });
    const k = st.skipIf?.type;
    if ((k === 'stage_is' || k === 'stage_not') && st.skipIf.stages?.length) {
      // skipIf = "no enviar si…": la condición del flujo es la inversa.
      const cond = { op: 'and', rules: [{ field: 'stage', cmp: k === 'stage_is' ? 'nin' : 'in', value: st.skipIf.stages }] };
      guarded(g, cond, `Sólo si ${describeCond(cond)}`, step);
    } else {
      if (k === 'has_reply') g.note('Revisar: el original saltaba este paso si el lead ya había respondido. Usa Esperar «hasta que… mensaje recibido» si lo necesitas.');
      step();
    }
  }
  const at = s.autoEnrollTrigger || {};
  let trigger;
  if (at.type === 'stage_entered')    trigger = { type: 'lead.stage_entered', params: { stages: at.stages || [] } };
  else if (at.type === 'score_below') trigger = { type: 'lead.score_changed', params: { threshold: at.minScore || 0, direction: 'below' } };
  else                                trigger = { type: 'manual', params: {} };
  trigger.entryFilters = { op: 'and', rules: [] };
  return {
    name: `Secuencia · ${s.name}`, description: s.description || 'Migrado de Secuencias.', isActive: s.isActive,
    trigger,
    settings: { allowReentry: true, cooldownDays: s.cooldownDays ?? 7, onDeactivate: 'pause', businessHoursOnly: false, allowManualEnroll: true },
    origin: 'migrated_sequence', migratedFrom: { model: 'Sequence', id: s._id },
    nodes: g.nodes, edges: g.edges,
  };
}

function fromAutomation(a) {
  const g = graphBuilder();
  g.add('trigger', a.name);
  for (const act of a.actions || []) {
    waitNode(g, act.delay, 'hours');
    switch (act.type) {
      case 'send_email':      g.add('send_email', 'Correo', { subject: a.name, body: act.body || '', templateId: act.templateId || undefined }); break;
      case 'send_whatsapp':   g.add('send_whatsapp', 'WhatsApp', { text: act.body || '' }); break;
      case 'create_activity': g.add('create_task', 'Tarea', { title: act.body || a.name, message: '', dueInDays: 2, priority: 'medium' }); break;
      case 'assign_to':       g.add('assign', 'Asignar', mongoose.isValidObjectId(act.value) ? { mode: 'user', userId: act.value } : { mode: 'round_robin' }); break;
      case 'change_stage':    g.add('change_stage', 'Cambiar etapa', { stage: act.value }); break;
      case 'notify_exec':     g.add('notify', 'Avisar', { to: 'assigned', title: a.name, message: act.body || '' }); break;
      default: break;
    }
  }
  const t = a.trigger || {};
  let trigger;
  switch (t.type) {
    case 'days_inactive': trigger = { type: 'lead.inactive', params: { days: Number(t.value) || 7, stages: t.stages || [] } }; break;
    case 'score_above':   trigger = { type: 'lead.score_changed', params: { threshold: Number(t.value) || 0, direction: 'above' } }; break;
    case 'lead_created':  trigger = { type: 'lead.created', params: {} }; break;
    case 'date_based':    trigger = { type: 'lead.date_reached', params: { field: 'createdAt', offsetDays: Number(t.value) || 0, stages: t.stages || [] } }; break;
    default:              trigger = { type: 'lead.stage_entered', params: { stages: t.stages || [] } };
  }
  trigger.entryFilters = { op: 'and', rules: [] };
  return {
    name: `Automatización · ${a.name}`, description: 'Migrado de Automatizaciones de Marketing.', isActive: a.isActive,
    trigger,
    settings: { allowReentry: t.type === 'days_inactive', cooldownDays: 7, onDeactivate: 'pause', businessHoursOnly: false, allowManualEnroll: true },
    origin: 'migrated_automation', migratedFrom: { model: 'Automation', id: a._id },
    nodes: g.nodes, edges: g.edges,
  };
}

// ── Guardado + publicación ──────────────────────────────────────────
async function validationCtx() {
  let stages = [];
  try { stages = (await require('../services/pipelineStages').getStages()).map(s => s.key); } catch { /* sin etapas */ }
  let waStatus = {};
  try { waStatus = require('../services/whatsappService').status(); } catch { /* sin WhatsApp */ }
  return { stages, waStatus };
}

async function upsertFlow(spec, ctx, report) {
  const exists = await Flow.findOne({ 'migratedFrom.model': spec.migratedFrom.model, 'migratedFrom.id': spec.migratedFrom.id }).select('_id name').lean();
  if (exists) { report.skipped.push(`${spec.name} (ya existe: ${exists._id})`); return; }

  const { isActive, ...rest } = spec;
  const validation = validate(rest, ctx);
  const flow = new Flow({ ...rest, isActive: false, status: 'draft', version: 0 });
  if (validation.ok) {
    flow.version = 1;
    flow.status = 'published';
    flow.isActive = !!isActive;
    const snap = flow.toObject();
    flow.published = { version: 1, trigger: snap.trigger, settings: snap.settings, nodes: snap.nodes, edges: snap.edges, at: new Date(), by: null };
    report.published.push(`${spec.name}${isActive ? ' [activo]' : ' [inactivo]'}`);
  } else {
    report.drafts.push(`${spec.name}\n      - ${validation.errors.map(e => e.message).join('\n      - ')}`);
  }
  if (!ctx.dry) await flow.save();
}

// Corre la migración sobre la conexión ya abierta. Idempotente: se puede
// llamar en cada arranque del servidor sin duplicar flujos.
async function runMigration({ deactivate = false, dry = DRY } = {}) {
  const Automation = mongoose.models.Automation || (require('../routes/marketing'), mongoose.models.Automation);
  const ctx = { ...(await validationCtx()), dry };
  const report = { published: [], drafts: [], skipped: [] };

  const [playbooks, rules, sequences, automations] = await Promise.all([
    Playbook.find().lean(), FollowUpRule.find().lean(), Sequence.find().lean(), Automation ? Automation.find().lean() : [],
  ]);

  for (const pb of playbooks) await upsertFlow(fromPlaybook(pb), ctx, report);
  for (const r of rules)      await upsertFlow(fromRule(r), ctx, report);
  for (const s of sequences)  await upsertFlow(fromSequence(s), ctx, report);
  for (const a of automations) await upsertFlow(fromAutomation(a), ctx, report);

  if (deactivate && !dry) {
    await Promise.all([
      Playbook.updateMany({}, { isActive: false }),
      FollowUpRule.updateMany({}, { isActive: false }),
      Sequence.updateMany({}, { isActive: false }),
      Automation ? Automation.updateMany({}, { isActive: false }) : null,
    ]);
  }

  const out = [];
  out.push(`${dry ? '[DRY] ' : ''}Migración a flujos — ${playbooks.length} playbooks, ${rules.length} reglas, ${sequences.length} secuencias, ${automations.length} automatizaciones`);
  out.push(`\nPublicados (${report.published.length}):`); report.published.forEach(x => out.push(`  ✓ ${x}`));
  out.push(`\nBorradores con pendientes (${report.drafts.length}):`); report.drafts.forEach(x => out.push(`  ✎ ${x}`));
  out.push(`\nOmitidos por ya migrados (${report.skipped.length}):`); report.skipped.forEach(x => out.push(`  · ${x}`));
  if (deactivate) out.push(dry ? '\n(--deactivate-legacy no aplica en --dry)' : '\nSistemas viejos desactivados (isActive=false).');
  return { text: out.join('\n'), report, counts: { playbooks: playbooks.length, rules: rules.length, sequences: sequences.length, automations: automations.length } };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/acon_crm');
  const { text } = await runMigration({ deactivate: DEACTIVATE, dry: DRY });
  process.stdout.write(text + '\n');
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(err => { process.stderr.write(`Migración fallida: ${err.message}\n`); process.exit(1); });
}

module.exports = { fromPlaybook, fromRule, fromSequence, fromAutomation, runMigration };
