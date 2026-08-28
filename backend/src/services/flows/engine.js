// ============================================
// Motor de flujos
// ============================================
//
// startRun   → mete un lead en un flujo (si pasa filtros, cooldown, reentrada)
// advance    → recorre pasos hasta un Esperar, un fin o el tope de pasos
// processDue → reanuda por tiempo (lo llama el cron cada minuto)
// onEvent    → cancela, reanuda y abre flujos según el evento (bus de eventos)
//
// Reglas globales (no configurables por flujo), ver PRD §9:
//  · cambio de etapa cancela las ejecuciones de flujos «entra a etapa» de otra etapa
//  · lead inactivo cancela todo lo suyo
//  · un envío fallido se degrada a tarea manual y el flujo sigue
//  · máx. 1 WhatsApp y 1 correo automáticos por lead cada 24 h (se pospone, no se pierde)
//  · etiqueta no_molestar o correo suprimido → los envíos se omiten

const Flow = require('../../models/Flow');
const FlowRun = require('../../models/FlowRun');
const Lead = require('../../models/Lead');
const Activity = require('../../models/Activity');
const graph = require('./graph');
const { evaluate } = require('./conditions');
const { EXECUTORS, OUTBOUND, createTask } = require('./actions');
const { render } = require('./render');

const MAX_STEPS_PER_RUN = 50;
const MAX_CASCADE_DEPTH = 3;
const FREQ_WINDOW_MS = 24 * 3600e3;
const STEP_LOG_CAP = 200;
const NO_MOLESTAR = 'no_molestar';

// ── Utilidades ───────────────────────────────────────────────────────

/** Versión ejecutable de un flujo: la publicada, o el borrador si se pide. */
function executable(flowDoc, { useDraft = false } = {}) {
  const src = !useDraft && flowDoc.published?.nodes ? flowDoc.published : flowDoc;
  return {
    _id: flowDoc._id, name: flowDoc.name, version: src.version ?? flowDoc.version,
    trigger: src.trigger, settings: src.settings || flowDoc.settings || {},
    nodes: src.nodes || [], edges: src.edges || [],
  };
}

async function loadLead(leadId) {
  return Lead.findById(leadId).populate('assignedTo', 'name email');
}

async function buildCtx({ flow, run, lead, io, userId, depth }) {
  const pipelineStages = require('../pipelineStages');
  const labels = await pipelineStages.labels().catch(() => ({}));
  const [hasReplied, hasQuote] = await Promise.all([
    Activity.exists({ lead: lead._id, type: { $in: ['whatsapp_in', 'email_in'] } }),
    require('mongoose').models.Quote ? require('mongoose').models.Quote.exists({ lead: lead._id }) : false,
  ]);
  return {
    flow, run, lead, io, userId, depth: depth || 0,
    stageLabel: labels[lead.stage] || lead.stage,
    executive: lead.assignedTo,
    hasReplied: !!hasReplied, hasQuote: !!hasQuote,
    get lastAiResult() { return run.context?.lastAiResult; },
  };
}

function log(run, entry) {
  run.stepLog.push(entry);
  if (run.stepLog.length > STEP_LOG_CAP) run.stepLog.splice(0, run.stepLog.length - STEP_LOG_CAP);
}

async function finish(run, status, reason) {
  run.status = status;
  run.exitReason = reason;
  run.finishedAt = new Date();
  run.waitingFor = undefined;
  run.nextRunAt = undefined;
  await run.save();
  await Flow.updateOne({ _id: run.flow }, { $inc: { 'stats.runsActive': -1 } });
}

// ── Frecuencia global ────────────────────────────────────────────────

/** Devuelve la fecha en que vuelve a haber cupo, o null si se puede enviar ya. */
async function nextSlotFor(lead, channel) {
  const type = channel === 'whatsapp' ? 'whatsapp_out' : 'email_out';
  const last = await Activity.findOne({
    lead: lead._id, type, isAuto: true,
    'metadata.source': { $in: ['flow', 'playbook', 'sequence', 'followup'] },
    createdAt: { $gte: new Date(Date.now() - FREQ_WINDOW_MS) },
  }).sort({ createdAt: -1 }).select('createdAt').lean();
  return last ? new Date(last.createdAt.getTime() + FREQ_WINDOW_MS) : null;
}

// ── Ejecución de un paso de acción ──────────────────────────────────

async function runAction(node, ctx) {
  const { lead, run } = ctx;
  const channel = OUTBOUND[node.type];

  if (channel) {
    if ((lead.tags || []).includes(NO_MOLESTAR)) {
      log(run, { nodeId: node.id, type: node.type, result: 'skipped', detail: 'El lead pidió no ser molestado' });
      return 'next';
    }
    const slot = await nextSlotFor(lead, channel);
    if (slot) {
      // Cupo del día usado: el paso se pospone, no se pierde.
      run.status = 'waiting';
      run.currentNodeId = node.id;
      run.nextRunAt = slot;
      run.waitingFor = { kind: 'time', retryNode: true };
      log(run, { nodeId: node.id, type: node.type, result: 'postponed', detail: `Ya salió un ${channel === 'whatsapp' ? 'WhatsApp' : 'correo'} automático hoy; se reintenta ${slot.toLocaleString('es-MX')}` });
      await run.save();
      return null;
    }
  }

  try {
    const r = await EXECUTORS[node.type](lead, node, ctx);
    log(run, { nodeId: node.id, type: node.type, result: 'ok', detail: r?.detail, activityId: r?.activityId });
  } catch (err) {
    // Plan B: tarea manual con el motivo; la cadena continúa.
    const c = node.config || {};
    const id = await createTask(lead, ctx, node, {
      title: `[Manual] ${render(node.label || c.title || node.type, ctx)}`,
      message: `La automatización no pudo ejecutarse (${err.message}). Hazlo manualmente:\n\n${render(c.message || c.text || c.body || c.title || '', ctx)}`,
      dueInDays: 1,
    }, { failedKind: node.type, failedReason: err.message });
    log(run, { nodeId: node.id, type: node.type, result: 'degraded', detail: err.message, activityId: id });
  }
  return 'next';
}

// ── Avance ──────────────────────────────────────────────────────────

/**
 * Recorre el grafo desde run.currentNodeId tomando la salida `handle`.
 * Si `executeCurrent` es true, primero ejecuta el paso actual (reanudación de
 * un paso pospuesto). Guarda el run al terminar.
 */
async function advance(run, flow, ctx, { handle = 'next', executeCurrent = false } = {}) {
  const nodes = graph.byId(flow);
  let node = nodes[run.currentNodeId];
  if (!node) return finish(run, 'failed', 'El paso actual ya no existe en el flujo');

  if (executeCurrent) {
    const h = await runAction(node, ctx);
    if (h === null) return; // se volvió a posponer
    handle = h;
  }

  let steps = 0;
  while (steps++ < MAX_STEPS_PER_RUN) {
    node = graph.next(flow, node.id, handle);
    run.context.steps = (run.context.steps || 0) + 1;
    if (!node) return finish(run, 'completed', 'Fin del flujo');
    run.currentNodeId = node.id;
    const { lead } = ctx;

    switch (node.type) {
      case 'exit':
        return finish(run, 'exited', render(node.config?.reason || 'Salida del flujo', ctx));

      case 'note':
      case 'trigger':
        handle = 'next';
        break;

      case 'condition': {
        const ok = evaluate(node.config?.condition, lead, ctx);
        handle = ok ? 'yes' : 'no';
        log(run, { nodeId: node.id, type: node.type, result: 'ok', handle, detail: ok ? 'Sí' : 'No' });
        break;
      }

      case 'split': {
        const { FIELDS } = require('./conditions');
        const raw = FIELDS[node.config?.field]?.read(lead, ctx);
        const val = String(Array.isArray(raw) ? raw[0] ?? '' : raw ?? '').toLowerCase();
        const match = (node.config?.values || []).map(String).find(v => v.toLowerCase() === val);
        handle = match ?? 'other';
        log(run, { nodeId: node.id, type: node.type, result: 'ok', handle });
        break;
      }

      case 'wait': {
        const plan = graph.waitPlan(node, new Date(), { businessHoursOnly: flow.settings?.businessHoursOnly });
        run.status = 'waiting';
        run.nextRunAt = plan.runAt;
        run.waitingFor = plan.kind === 'event'
          ? { kind: 'event', event: plan.event, filter: plan.filter, until: plan.until, retryNode: false }
          : { kind: 'time', retryNode: false };
        log(run, { nodeId: node.id, type: node.type, result: 'waiting', detail: plan.kind === 'event' ? `Hasta ${plan.event} o ${plan.until.toLocaleString('es-MX')}` : `Hasta ${plan.runAt.toLocaleString('es-MX')}` });
        await run.save();
        return;
      }

      default: {
        if (!EXECUTORS[node.type]) {
          log(run, { nodeId: node.id, type: node.type, result: 'skipped', detail: 'Tipo de paso desconocido' });
          handle = 'next';
          break;
        }
        const h = await runAction(node, ctx);
        if (h === null) return; // pospuesto
        handle = h;
      }
    }
    await run.save();
  }
  return finish(run, 'failed', `Se superó el tope de ${MAX_STEPS_PER_RUN} pasos: revisa si hay un bucle`);
}

// ── Entrada a un flujo ──────────────────────────────────────────────

/**
 * Mete un lead en un flujo. Devuelve el FlowRun o null si no entra
 * (inactivo, filtros, reentrada, cooldown, profundidad).
 */
async function startRun({ flowId, flowDoc, leadId, triggeredBy = {}, io, depth = 0, useDraft = false, force = false }) {
  if (depth > MAX_CASCADE_DEPTH) return null;
  const doc = flowDoc || await Flow.findById(flowId);
  if (!doc) return null;
  if (!force && (!doc.isActive || doc.status !== 'published')) return null;
  const flow = executable(doc, { useDraft });
  const start = graph.startNode(flow);
  if (!start) return null;

  const lead = await loadLead(leadId);
  if (!lead || !lead.isActive) return null;

  const ctx0 = await buildCtx({ flow, run: { context: {} }, lead, io, userId: triggeredBy.userId, depth });
  if (!force && !evaluate(flow.trigger?.entryFilters, lead, ctx0)) return null;

  if (!force) {
    const active = await FlowRun.exists({ lead: lead._id, flow: doc._id, status: { $in: ['running', 'waiting', 'paused'] } });
    if (active) return null;
    if (!flow.settings?.allowReentry) {
      const before = await FlowRun.exists({ lead: lead._id, flow: doc._id });
      if (before) return null;
    } else {
      const cooldown = (flow.settings.cooldownDays ?? 7) * 86400e3;
      const recent = await FlowRun.exists({ lead: lead._id, flow: doc._id, createdAt: { $gte: new Date(Date.now() - cooldown) } });
      if (recent) return null;
    }
  }

  const run = await FlowRun.create({
    flow: doc._id, flowVersion: flow.version || 0, lead: lead._id,
    triggeredBy, status: 'running', currentNodeId: start.id, lockedAt: new Date(),
    context: { vars: {}, lastEvent: triggeredBy.event || null },
  });
  await Flow.updateOne({ _id: doc._id }, { $inc: { 'stats.runsTotal': 1, 'stats.runsActive': 1 }, $set: { 'stats.lastRunAt': new Date() } });

  const ctx = await buildCtx({ flow, run, lead, io, userId: triggeredBy.userId, depth });
  await advance(run, flow, ctx, { handle: 'next' });
  return run;
}

// ── Reanudación ─────────────────────────────────────────────────────

/** Toma el lock de un run en espera. null si otro worker ya lo tomó. */
async function lock(runId) {
  return FlowRun.findOneAndUpdate(
    { _id: runId, status: 'waiting' },
    { status: 'running', lockedAt: new Date() },
    { new: true },
  );
}

async function resume(run, { handle, executeCurrent, io, event }) {
  const doc = await Flow.findById(run.flow);
  const lead = await loadLead(run.lead);
  if (!doc || !lead || !lead.isActive) return finish(run, 'exited', !lead?.isActive ? 'El lead está inactivo' : 'El flujo ya no existe');
  if (!doc.isActive) {
    if ((doc.settings?.onDeactivate || 'pause') === 'pause') { run.status = 'paused'; return run.save(); }
    return finish(run, 'exited', 'El flujo fue desactivado');
  }
  // Se sigue con la versión con la que arrancó, si sigue disponible.
  const flow = executable(doc);
  if (event) {
    run.context.lastEvent = { name: event.name, eventId: event.eventId, at: event.at, channel: event.channel, status: event.status };
    run.context.consumedEvents = [...(run.context.consumedEvents || []).slice(-50), event.eventId];
  }
  log(run, { nodeId: run.currentNodeId, type: 'resume', result: 'resumed', handle, detail: event ? `Por ${event.name}` : 'Por tiempo' });
  const ctx = await buildCtx({ flow, run, lead, io, userId: run.triggeredBy?.userId });
  await advance(run, flow, ctx, { handle, executeCurrent });
}

/** Cron: reanuda las esperas vencidas. */
async function processDue(io, { limit = 100 } = {}) {
  const due = await FlowRun.find({ status: 'waiting', nextRunAt: { $lte: new Date() } })
    .sort({ nextRunAt: 1 }).limit(limit).select('_id').lean();
  let n = 0;
  for (const { _id } of due) {
    const run = await lock(_id);
    if (!run) continue;
    try {
      const w = run.waitingFor || {};
      const handle = w.kind === 'event' ? 'timeout' : 'next';
      await resume(run, { handle, executeCurrent: !!w.retryNode, io });
      n++;
    } catch (err) {
      console.error('[flows] reanudación falló:', err.message);
      await FlowRun.updateOne({ _id }, { status: 'failed', exitReason: err.message, finishedAt: new Date() });
    }
  }
  if (n) console.log(`⚙️  Flujos: ${n} ejecución(es) reanudadas`);
  return n;
}

// ── Eventos ─────────────────────────────────────────────────────────

async function cancelStageRuns(leadId, newStage) {
  const runs = await FlowRun.find({ lead: leadId, status: { $in: ['waiting', 'running', 'paused'] } }).populate('flow', 'trigger published');
  for (const run of runs) {
    const trig = run.flow?.published?.trigger || run.flow?.trigger;
    if (trig?.type !== 'lead.stage_entered') continue;
    if ((trig.params?.stages || []).includes(newStage)) continue;
    await finish(run, 'exited', `El lead cambió a la etapa ${newStage}`);
  }
}

async function cancelLeadRuns(leadId, reason) {
  const runs = await FlowRun.find({ lead: leadId, status: { $in: ['waiting', 'running', 'paused'] } });
  for (const run of runs) await finish(run, 'exited', reason);
}

async function onEvent(event, { io } = {}) {
  if (!event.leadId) return;
  const { matchingFlows } = require('./triggers');

  if (event.name === 'lead.stage_entered') await cancelStageRuns(event.leadId, event.stage);
  if (event.name === 'lead.deactivated') return cancelLeadRuns(event.leadId, 'El lead fue desactivado');

  // 1) Reanudar esperas «hasta que…» que coincidan.
  const waiting = await FlowRun.find({ lead: event.leadId, status: 'waiting', 'waitingFor.kind': 'event', 'waitingFor.event': event.name });
  for (const w of waiting) {
    if (!graph.eventMatches(w.waitingFor, event)) continue;
    if ((w.context?.consumedEvents || []).includes(event.eventId)) continue;
    const run = await lock(w._id);
    if (!run) continue;
    try { await resume(run, { handle: 'happened', io, event }); }
    catch (err) { console.error('[flows] reanudación por evento falló:', err.message); }
  }

  // 2) Abrir flujos cuyo inicio coincide.
  if (event.fromFlow && !event.fromFlow.allowCascade) return; // cambio de etapa hecho por un flujo sin cascada
  const depth = event.fromFlow?.depth || 0;
  const flows = await matchingFlows(event);
  for (const flowDoc of flows) {
    try {
      await startRun({ flowDoc, leadId: event.leadId, io, depth, triggeredBy: { type: event.name, eventId: event.eventId, userId: event.userId, event: { name: event.name, channel: event.channel, text: event.text } } });
    } catch (err) {
      console.error(`[flows] no se pudo abrir «${flowDoc.name}»:`, err.message);
    }
  }
}

let subscribed = false;
function subscribe() {
  if (subscribed) return;
  subscribed = true;
  require('../events').on('*', onEvent);
}

module.exports = { startRun, processDue, onEvent, subscribe, executable, cancelLeadRuns, finish, lock, resume };
