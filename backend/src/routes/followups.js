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
router.get('/pending', auth, async (req, res) => {
  try {
    const rules = await FollowUpRule.find({ isActive: true });
    const result = [];

    for (const rule of rules) {
      let leads = [];

      if (rule.trigger.type === 'days_inactive') {
        const cutoff = new Date(Date.now() - rule.trigger.value * 24 * 60 * 60 * 1000);
        const stageFilter = rule.trigger.stages?.length
          ? { stage: { $in: rule.trigger.stages } }
          : { stage: { $nin: ['closed_won', 'closed_lost'] } };

        leads = await Lead.find({
          isActive: true,
          ...stageFilter,
          $or: [
            { lastContactDate: { $lt: cutoff } },
            { lastContactDate: { $exists: false }, createdAt: { $lt: cutoff } },
          ],
        }).populate('assignedTo', 'name').select('company contact stage score lastContactDate assignedTo').limit(50);
      }

      if (rule.trigger.type === 'score_below') {
        const stageFilter = rule.trigger.stages?.length
          ? { stage: { $in: rule.trigger.stages } }
          : { stage: { $nin: ['closed_won', 'closed_lost'] } };

        leads = await Lead.find({
          isActive: true,
          ...stageFilter,
          score: { $lt: rule.trigger.value },
        }).populate('assignedTo', 'name').select('company contact stage score lastContactDate assignedTo').limit(50);
      }

      if (leads.length) {
        result.push({ rule: { _id: rule._id, name: rule.name, action: rule.action }, leads });
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
