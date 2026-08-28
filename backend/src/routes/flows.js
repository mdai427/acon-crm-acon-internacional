// ============================================
// Flujos de automatización — API
// GET    /api/flows                 lista con stats
// GET    /api/flows/catalog         disparadores, pasos, campos, variables
// POST   /api/flows                 crear borrador
// GET    /api/flows/:id             flujo completo
// PUT    /api/flows/:id             guardar borrador (valida)
// POST   /api/flows/:id/publish     publicar (valida, sube versión, activa)
// POST   /api/flows/:id/toggle      activar / desactivar
// POST   /api/flows/:id/simulate    recorrer con un lead sin ejecutar
// POST   /api/flows/:id/test        ejecutar de verdad sobre un lead
// POST   /api/flows/:id/enroll      meter un lead manualmente
// GET    /api/flows/:id/runs        ejecuciones
// DELETE /api/flows/:id
// POST   /api/flow-runs/:id/cancel  · /skip-wait
// GET    /api/flows/lead/:leadId    ejecuciones de un lead (ficha)
// ============================================
const express = require('express');
const router = express.Router();
const { auth, checkPerm } = require('../middleware/auth');
const Flow = require('../models/Flow');
const FlowRun = require('../models/FlowRun');
const Lead = require('../models/Lead');
const { validate, WAIT_EVENTS } = require('../services/flows/validate');
const { FIELDS } = require('../services/flows/conditions');
const { VARIABLES } = require('../services/flows/render');
const { DATE_FIELDS } = require('../services/flows/triggers');
const engine = require('../services/flows/engine');
const { simulate } = require('../services/flows/simulate');
const pipelineStages = require('../services/pipelineStages');

router.use(auth);

const fail = (res, err, code = 500) => res.status(code).json({ success: false, message: err.message || err });

const EDITABLE = ['name', 'description', 'trigger', 'settings', 'nodes', 'edges'];
const pick = (body) => Object.fromEntries(EDITABLE.filter(k => k in body).map(k => [k, body[k]]));

async function validationCtx() {
  const stages = await pipelineStages.getStages().catch(() => []);
  let waStatus = {};
  try { waStatus = require('../services/whatsappService').status(); } catch { /* sin WhatsApp configurado */ }
  return { stages: stages.map(s => s.key), waStatus };
}

// ── Catálogo para el constructor ─────────────────────────────────────
router.get('/catalog', checkPerm('flows.view'), async (req, res) => {
  try {
    const stages = await pipelineStages.getStages().catch(() => []);
    let waStatus = {};
    try { waStatus = require('../services/whatsappService').status(); } catch { /* sin WA */ }
    res.json({ success: true, data: {
      triggers: [
        { type: 'lead.created',       label: 'Cuando se crea un lead',          params: ['sources'] },
        { type: 'lead.stage_entered', label: 'Cuando entra a una etapa',        params: ['stages'] },
        { type: 'lead.score_changed', label: 'Cuando el score cruza un valor',  params: ['threshold', 'direction'] },
        { type: 'lead.assigned',      label: 'Cuando se asigna un ejecutivo',   params: [] },
        { type: 'message.received',   label: 'Cuando el lead escribe',          params: ['channel'] },
        { type: 'quote.sent',         label: 'Cuando se envía una cotización',  params: [] },
        { type: 'quote.accepted',     label: 'Cuando aceptan una cotización',   params: [] },
        { type: 'quote.rejected',     label: 'Cuando rechazan una cotización',  params: [] },
        { type: 'call.ended',         label: 'Cuando termina una llamada',      params: ['outcome'] },
        { type: 'lead.inactive',      label: 'Tras N días sin contacto',        params: ['days', 'stages'] },
        { type: 'lead.date_reached',  label: 'N días después de una fecha',     params: ['field', 'offsetDays', 'stages'] },
        { type: 'manual',             label: 'Sólo manual (desde la ficha)',    params: [] },
      ],
      nodeTypes: Flow.NODE_TYPES.filter(t => t !== 'trigger'),
      waitEvents: WAIT_EVENTS,
      fields: Object.entries(FIELDS).map(([key, f]) => ({ key, label: f.label, kind: f.kind })),
      variables: VARIABLES,
      dateFields: DATE_FIELDS,
      stages: stages.map(s => ({ key: s.key, label: s.label, color: s.color })),
      whatsapp: waStatus,
    } });
  } catch (err) { fail(res, err); }
});

// ── Ejecuciones de un lead (ficha) ───────────────────────────────────
router.get('/lead/:leadId', checkPerm('leads.view'), async (req, res) => {
  try {
    const runs = await FlowRun.find({ lead: req.params.leadId }).sort({ createdAt: -1 }).limit(50)
      .populate('flow', 'name trigger').lean();
    res.json({ success: true, data: runs });
  } catch (err) { fail(res, err); }
});

// ── CRUD ─────────────────────────────────────────────────────────────
router.get('/', checkPerm('flows.view'), async (req, res) => {
  try {
    const flows = await Flow.find().select('-nodes -edges -published').populate('createdBy updatedBy', 'name').sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data: flows });
  } catch (err) { fail(res, err); }
});

router.post('/', checkPerm('flows.edit'), async (req, res) => {
  try {
    const data = pick(req.body);
    if (!data.name?.trim()) return fail(res, 'El flujo necesita un nombre', 400);
    if (!data.trigger?.type) return fail(res, 'Elige el inicio del flujo', 400);
    if (!data.nodes?.length) {
      data.nodes = [{ id: 'start', type: 'trigger', label: 'Inicio', position: { x: 80, y: 80 }, config: {} }];
      data.edges = [];
    }
    const flow = await Flow.create({ ...data, status: 'draft', isActive: false, createdBy: req.user._id, updatedBy: req.user._id });
    res.json({ success: true, data: flow, message: 'Flujo creado como borrador' });
  } catch (err) { fail(res, err); }
});

router.get('/:id', checkPerm('flows.view'), async (req, res) => {
  try {
    const flow = await Flow.findById(req.params.id).populate('createdBy updatedBy published.by', 'name').lean();
    if (!flow) return fail(res, 'Flujo no encontrado', 404);
    const validation = validate(flow, await validationCtx());
    res.json({ success: true, data: { ...flow, validation } });
  } catch (err) { fail(res, err); }
});

router.put('/:id', checkPerm('flows.edit'), async (req, res) => {
  try {
    const flow = await Flow.findById(req.params.id);
    if (!flow) return fail(res, 'Flujo no encontrado', 404);
    Object.assign(flow, pick(req.body), { updatedBy: req.user._id });
    await flow.save();
    const validation = validate(flow.toObject(), await validationCtx());
    res.json({ success: true, data: flow, validation, message: validation.ok ? 'Borrador guardado' : `Guardado con ${validation.errors.length} pendiente(s) antes de publicar` });
  } catch (err) { fail(res, err); }
});

router.post('/:id/publish', checkPerm('flows.publish'), async (req, res) => {
  try {
    const flow = await Flow.findById(req.params.id);
    if (!flow) return fail(res, 'Flujo no encontrado', 404);
    const validation = validate(flow.toObject(), await validationCtx());
    if (!validation.ok) return res.status(400).json({ success: false, validation, message: 'Corrige los pendientes antes de publicar' });
    flow.version += 1;
    flow.status = 'published';
    flow.isActive = req.body.activate !== false;
    const snap = flow.toObject();
    flow.published = {
      version: flow.version, trigger: snap.trigger, settings: snap.settings,
      nodes: snap.nodes, edges: snap.edges,
      at: new Date(), by: req.user._id,
    };
    await flow.save();
    require('../services/auditService').audit?.({ req, action: 'publish', entity: 'Flow', entityId: flow._id, entityLabel: flow.name, after: { version: flow.version } })?.catch?.(() => {});
    res.json({ success: true, data: flow, message: `Publicado v${flow.version}${flow.isActive ? ' y activo' : ''}` });
  } catch (err) { fail(res, err); }
});

router.post('/:id/toggle', checkPerm('flows.publish'), async (req, res) => {
  try {
    const flow = await Flow.findById(req.params.id);
    if (!flow) return fail(res, 'Flujo no encontrado', 404);
    if (flow.status !== 'published') return fail(res, 'Publica el flujo antes de activarlo', 400);
    flow.isActive = !flow.isActive;
    await flow.save();
    if (!flow.isActive && flow.settings.onDeactivate === 'exit') {
      const runs = await FlowRun.find({ flow: flow._id, status: { $in: ['running', 'waiting', 'paused'] } });
      for (const r of runs) await engine.finish(r, 'exited', 'El flujo fue desactivado');
    }
    res.json({ success: true, data: flow, message: flow.isActive ? 'Flujo activado' : 'Flujo desactivado' });
  } catch (err) { fail(res, err); }
});

router.delete('/:id', checkPerm('flows.delete'), async (req, res) => {
  try {
    const active = await FlowRun.countDocuments({ flow: req.params.id, status: { $in: ['running', 'waiting', 'paused'] } });
    if (active) return fail(res, `Hay ${active} lead(s) dentro de este flujo. Desactívalo y espera a que terminen, o cancélalos primero`, 400);
    await Flow.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Flujo eliminado' });
  } catch (err) { fail(res, err); }
});

// ── Simulación, prueba, inscripción ─────────────────────────────────
router.post('/:id/simulate', checkPerm('flows.view'), async (req, res) => {
  try {
    const { leadId, answers = {}, useDraft = true } = req.body;
    const doc = await Flow.findById(req.params.id);
    if (!doc) return fail(res, 'Flujo no encontrado', 404);
    const lead = await Lead.findById(leadId).populate('assignedTo', 'name email');
    if (!lead) return fail(res, 'Indica un lead de prueba válido', 400);
    const flow = engine.executable(doc, { useDraft });
    const labels = await pipelineStages.labels().catch(() => ({}));
    const Activity = require('../models/Activity');
    const hasReplied = !!(await Activity.exists({ lead: lead._id, type: { $in: ['whatsapp_in', 'email_in'] } }));
    const result = simulate(flow, lead, { stageLabel: labels[lead.stage] || lead.stage, executive: lead.assignedTo, hasReplied }, answers);
    res.json({ success: true, data: result });
  } catch (err) { fail(res, err); }
});

router.post('/:id/test', checkPerm('flows.edit'), async (req, res) => {
  try {
    const { leadId } = req.body;
    if (!leadId) return fail(res, 'Indica el lead de prueba', 400);
    const run = await engine.startRun({ flowId: req.params.id, leadId, io: req.io, useDraft: true, force: true, triggeredBy: { type: 'test', userId: req.user._id } });
    if (!run) return fail(res, 'No se pudo iniciar: revisa que el lead exista y esté activo', 400);
    res.json({ success: true, data: run, message: `Ejecución iniciada (${run.status})` });
  } catch (err) { fail(res, err); }
});

router.post('/:id/enroll', checkPerm('leads.edit'), async (req, res) => {
  try {
    const { leadId } = req.body;
    const doc = await Flow.findById(req.params.id);
    if (!doc) return fail(res, 'Flujo no encontrado', 404);
    if (!doc.settings.allowManualEnroll && doc.trigger.type !== 'manual') return fail(res, 'Este flujo no admite inscripción manual', 400);
    const run = await engine.startRun({ flowDoc: doc, leadId, io: req.io, triggeredBy: { type: 'manual', userId: req.user._id } });
    if (!run) return fail(res, 'El lead no entró: puede que ya esté dentro, esté en cooldown o no cumpla los filtros', 400);
    res.json({ success: true, data: run, message: 'Lead metido en el flujo' });
  } catch (err) { fail(res, err); }
});

router.get('/:id/runs', checkPerm('flows.view'), async (req, res) => {
  try {
    const q = { flow: req.params.id };
    if (req.query.status) q.status = req.query.status;
    if (req.query.leadId) q.lead = req.query.leadId;
    const runs = await FlowRun.find(q).sort({ createdAt: -1 }).limit(Number(req.query.limit) || 100)
      .populate('lead', 'company contact stage').lean();
    res.json({ success: true, data: runs });
  } catch (err) { fail(res, err); }
});

// ── Ejecuciones ──────────────────────────────────────────────────────
const runs = express.Router();
runs.use(auth);

runs.post('/:id/cancel', checkPerm('flows.edit'), async (req, res) => {
  try {
    const run = await FlowRun.findById(req.params.id);
    if (!run) return fail(res, 'Ejecución no encontrada', 404);
    if (!['running', 'waiting', 'paused'].includes(run.status)) return fail(res, 'Esa ejecución ya terminó', 400);
    await engine.finish(run, 'exited', `Cancelada por ${req.user.name || 'un usuario'}`);
    res.json({ success: true, data: run, message: 'Ejecución cancelada' });
  } catch (err) { fail(res, err); }
});

runs.post('/:id/skip-wait', checkPerm('flows.edit'), async (req, res) => {
  try {
    const run = await engine.lock(req.params.id);
    if (!run) return fail(res, 'La ejecución no está en espera', 400);
    const w = run.waitingFor || {};
    await engine.resume(run, { handle: w.kind === 'event' ? 'timeout' : 'next', executeCurrent: !!w.retryNode, io: req.io });
    res.json({ success: true, data: run, message: 'Espera saltada' });
  } catch (err) { fail(res, err); }
});

module.exports = router;
module.exports.runs = runs;
