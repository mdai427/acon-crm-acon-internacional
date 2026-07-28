const express = require('express');
const router = express.Router();
const FollowUpRule = require('../models/FollowUpRule');
const Activity = require('../models/Activity');
const Lead = require('../models/Lead');
const { auth, adminOnly } = require('../middleware/auth');

// GET /api/followups/rules
router.get('/rules', auth, async (req, res) => {
  try {
    const rules = await FollowUpRule.find().populate('createdBy', 'name').sort({ createdAt: -1 });
    res.json({ success: true, data: rules });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/followups/rules
router.post('/rules', auth, adminOnly, async (req, res) => {
  try {
    const rule = await FollowUpRule.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, data: rule });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// PUT /api/followups/rules/:id
router.put('/rules/:id', auth, adminOnly, async (req, res) => {
  try {
    const rule = await FollowUpRule.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: rule });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// DELETE /api/followups/rules/:id
router.delete('/rules/:id', auth, adminOnly, async (req, res) => {
  try {
    await FollowUpRule.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/followups/pending — leads que cumplen alguna regla activa
// Optimizado: agrupa reglas por tipo y lanza 1 query por tipo (max 2) en lugar de N queries
router.get('/pending', auth, async (req, res) => {
  try {
    const rules = await FollowUpRule.find({ isActive: true }).lean();
    if (!rules.length) return res.json({ success: true, data: [] });

    const ACTIVE_STAGES = { $nin: ['closed_won', 'closed_lost'] };
    const SELECT = 'company contact stage score lastContactDate assignedTo';

    // Agrupar reglas por tipo para minimizar queries
    const byType = {};
    for (const rule of rules) {
      const t = rule.trigger.type;
      if (!byType[t]) byType[t] = [];
      byType[t].push(rule);
    }

    // Lanzar queries por tipo en paralelo
    const queryPromises = [];

    if (byType.days_inactive) {
      // Un $or de todos los cutoffs: 1 query para todas las reglas de inactividad
      const orConditions = byType.days_inactive.map(rule => {
        const cutoff = new Date(Date.now() - rule.trigger.value * 24 * 60 * 60 * 1000);
        const stageF = rule.trigger.stages?.length ? { stage: { $in: rule.trigger.stages } } : { stage: ACTIVE_STAGES };
        return {
          isActive: true,
          ...stageF,
          $or: [{ lastContactDate: { $lt: cutoff } }, { lastContactDate: { $exists: false }, createdAt: { $lt: cutoff } }],
        };
      });
      queryPromises.push(
        Lead.find({ $or: orConditions })
          .populate('assignedTo', 'name')
          .select(SELECT)
          .limit(100)
          .lean()
          .then(leads => ({ type: 'days_inactive', leads }))
      );
    }

    if (byType.score_below) {
      const minScore = Math.min(...byType.score_below.map(r => r.trigger.value));
      queryPromises.push(
        Lead.find({ isActive: true, stage: ACTIVE_STAGES, score: { $lt: minScore } })
          .populate('assignedTo', 'name')
          .select(SELECT)
          .limit(100)
          .lean()
          .then(leads => ({ type: 'score_below', leads }))
      );
    }

    const queryResults = await Promise.all(queryPromises);
    const leadsByType = Object.fromEntries(queryResults.map(r => [r.type, r.leads]));

    // Asignar leads a cada regla con filtro en memoria
    const result = [];
    for (const rule of rules) {
      const allLeads = leadsByType[rule.trigger.type] || [];
      let filtered = allLeads;

      if (rule.trigger.type === 'days_inactive') {
        const cutoff = new Date(Date.now() - rule.trigger.value * 24 * 60 * 60 * 1000);
        filtered = allLeads.filter(l => {
          const ref = l.lastContactDate || l.createdAt;
          return ref < cutoff;
        });
      } else if (rule.trigger.type === 'score_below') {
        filtered = allLeads.filter(l => l.score < rule.trigger.value);
      }

      if (rule.trigger.stages?.length) {
        filtered = filtered.filter(l => rule.trigger.stages.includes(l.stage));
      }

      if (filtered.length) {
        result.push({ rule: { _id: rule._id, name: rule.name, action: rule.action }, leads: filtered.slice(0, 50) });
      }
    }

    res.json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/followups/execute/:ruleId — ejecutar manualmente una regla
router.post('/execute/:ruleId', auth, adminOnly, async (req, res) => {
  try {
    const rule = await FollowUpRule.findById(req.params.ruleId);
    if (!rule) return res.status(404).json({ success: false, message: 'Regla no encontrada' });

    // Importar servicios de comunicación
    const { sendEmail } = require('./email');
    const { sendWhatsAppMessage } = require('./whatsapp');

    let leads = [];
    if (rule.trigger.type === 'days_inactive') {
      const cutoff = new Date(Date.now() - rule.trigger.value * 24 * 60 * 60 * 1000);
      const stageFilter = rule.trigger.stages?.length ? { stage: { $in: rule.trigger.stages } } : { stage: { $nin: ['closed_won', 'closed_lost'] } };
      leads = await Lead.find({ isActive: true, ...stageFilter, $or: [{ lastContactDate: { $lt: cutoff } }, { lastContactDate: { $exists: false }, createdAt: { $lt: cutoff } }] }).populate('assignedTo', 'name email phone').limit(100);
    }

    let executed = 0, failed = 0;

    for (const lead of leads) {
      try {
        // Verificar cooldown: ¿hubo actividad auto en los últimos N días?
        const cooloffDate = new Date(Date.now() - rule.cooldownDays * 24 * 60 * 60 * 1000);
        const recent = await Activity.findOne({ lead: lead._id, isAuto: true, createdAt: { $gte: cooloffDate } });
        if (recent) continue;

        const contact = typeof lead.contact === 'object' ? lead.contact?.name : lead.contact;
        const message = (rule.action.message || 'Seguimiento automático de ACON Internacional.')
          .replace('{empresa}', lead.company)
          .replace('{contacto}', contact || '')
          .replace('{etapa}', lead.stage);

        if (['task', 'whatsapp_and_email'].includes(rule.action.type) || rule.action.type === 'task') {
          await Activity.create({
            lead: lead._id, user: req.user._id, type: 'task',
            direction: 'internal', isAuto: true,
            subject: rule.action.taskTitle || `Seguimiento: ${lead.company}`,
            content: message,
            taskData: { dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), completed: false },
          });
        }

        executed++;
        await new Promise(r => setTimeout(r, 100));
      } catch { failed++; }
    }

    await FollowUpRule.findByIdAndUpdate(rule._id, { lastRun: new Date(), $inc: { executionCount: 1 } });
    res.json({ success: true, data: { executed, failed, total: leads.length } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
