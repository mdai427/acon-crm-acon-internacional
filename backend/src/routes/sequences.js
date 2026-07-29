const express = require('express');
const router = express.Router();
const Sequence = require('../models/Sequence');
const SequenceEnrollment = require('../models/SequenceEnrollment');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const { auth, managerOnly } = require('../middleware/auth');
const { pick } = require('../utils/pick');
const SEQUENCE_FIELDS = ['name', 'description', 'isActive', 'steps', 'autoEnrollTrigger', 'cooldownDays'];

// ── CRUD Sequences ──────────────────────────────────────────────

// GET /api/sequences
router.get('/', auth, async (req, res) => {
  try {
    const seqs = await Sequence.find().populate('createdBy', 'name').sort({ createdAt: -1 });
    res.json({ success: true, data: seqs });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/sequences
router.post('/', auth, managerOnly, async (req, res) => {
  try {
    const seq = await Sequence.create({ ...pick(req.body, SEQUENCE_FIELDS), createdBy: req.user._id });
    res.status(201).json({ success: true, data: seq });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// PUT /api/sequences/:id
router.put('/:id', auth, managerOnly, async (req, res) => {
  try {
    const seq = await Sequence.findByIdAndUpdate(req.params.id, pick(req.body, SEQUENCE_FIELDS), { new: true });
    if (!seq) return res.status(404).json({ success: false, message: 'No encontrado' });
    res.json({ success: true, data: seq });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// DELETE /api/sequences/:id
router.delete('/:id', auth, managerOnly, async (req, res) => {
  try {
    await Sequence.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Enrollments ─────────────────────────────────────────────────

// POST /api/sequences/:id/enroll — enrolar lead(s) manualmente
router.post('/:id/enroll', auth, async (req, res) => {
  try {
    const seq = await Sequence.findById(req.params.id);
    if (!seq) return res.status(404).json({ success: false, message: 'Secuencia no encontrada' });

    const leadIds = Array.isArray(req.body.leads) ? req.body.leads : [req.body.leadId];
    const enrolled = [];
    const skipped  = [];

    for (const leadId of leadIds) {
      // No enrolar si ya está activo en esta secuencia
      const existing = await SequenceEnrollment.findOne({ sequence: seq._id, lead: leadId, status: 'active' });
      if (existing) { skipped.push(leadId); continue; }

      const firstStep = seq.steps.sort((a, b) => a.order - b.order)[0];
      const nextRunAt = firstStep
        ? new Date(Date.now() + (firstStep.delayHours || 0) * 3600000)
        : null;

      const enroll = await SequenceEnrollment.create({
        sequence: seq._id, lead: leadId, enrolledBy: req.user._id,
        status: 'active', currentStep: 0, nextRunAt,
      });
      enrolled.push(enroll._id);
    }

    res.json({ success: true, data: { enrolled: enrolled.length, skipped: skipped.length } });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// GET /api/sequences/:id/enrollments
router.get('/:id/enrollments', auth, async (req, res) => {
  try {
    const enrollments = await SequenceEnrollment.find({ sequence: req.params.id })
      .populate('lead', 'company contact stage')
      .populate('enrolledBy', 'name')
      .sort({ enrolledAt: -1 })
      .limit(100);
    res.json({ success: true, data: enrollments });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/sequences/enrollments/:enrollId/exit — salir de secuencia
router.post('/enrollments/:enrollId/exit', auth, async (req, res) => {
  try {
    const enroll = await SequenceEnrollment.findByIdAndUpdate(
      req.params.enrollId,
      { status: 'exited', exitReason: req.body.reason || 'Manual' },
      { new: true }
    );
    if (!enroll) return res.status(404).json({ success: false });
    res.json({ success: true, data: enroll });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/sequences/process — cron job ejecuta pasos pendientes
router.post('/process', auth, async (req, res) => {
  try {
    const now = new Date();
    const due = await SequenceEnrollment.find({ status: 'active', nextRunAt: { $lte: now } })
      .populate({ path: 'sequence', select: 'steps cooldownDays' })
      .populate({ path: 'lead', select: 'company contact whatsapp email stage' })
      .limit(200);

    let processed = 0, skipped = 0;

    for (const enroll of due) {
      try {
        const seq = enroll.sequence;
        if (!seq) { await SequenceEnrollment.findByIdAndUpdate(enroll._id, { status: 'exited', exitReason: 'Sequence deleted' }); continue; }

        const steps = seq.steps.sort((a, b) => a.order - b.order);
        const step = steps[enroll.currentStep];

        if (!step) {
          await SequenceEnrollment.findByIdAndUpdate(enroll._id, { status: 'completed' });
          continue;
        }

        // Check skip condition
        let shouldSkip = false;
        if (step.skipIf?.type === 'stage_is' && step.skipIf.stages?.length) {
          shouldSkip = step.skipIf.stages.includes(enroll.lead?.stage);
        } else if (step.skipIf?.type === 'stage_not' && step.skipIf.stages?.length) {
          shouldSkip = !step.skipIf.stages.includes(enroll.lead?.stage);
        }

        const contact = typeof enroll.lead.contact === 'object' ? enroll.lead.contact?.name : enroll.lead.contact;
        const message = (step.message || '')
          .replace('{empresa}', enroll.lead.company || '')
          .replace('{contacto}', contact || '')
          .replace('{etapa}', enroll.lead.stage || '');

        let result = 'sent';
        let note = '';

        if (shouldSkip) {
          result = 'skipped';
          note = `Condición ${step.skipIf.type}: ${step.skipIf.stages?.join(',')}`;
        } else {
          // Log activity
          const actType = step.channel === 'task' ? 'task' : step.channel === 'email' ? 'email_out' : 'whatsapp_out';
          const act = {
            lead: enroll.lead._id, type: actType, direction: 'outbound',
            isAuto: true, content: message,
          };
          if (step.channel === 'task') {
            act.type = 'task';
            act.direction = 'internal';
            act.taskData = { completed: false, dueDate: new Date(Date.now() + 24 * 3600000) };
          }
          await Activity.create(act);
        }

        // Advance to next step
        const nextStepIdx = enroll.currentStep + 1;
        const nextStep = steps[nextStepIdx];
        const update = {
          currentStep: nextStepIdx,
          nextRunAt: nextStep ? new Date(Date.now() + (nextStep.delayHours || 24) * 3600000) : null,
          status: nextStep ? 'active' : 'completed',
          $push: { log: { step: enroll.currentStep, executedAt: now, channel: step.channel, result, note } },
        };
        await SequenceEnrollment.findByIdAndUpdate(enroll._id, update);
        processed++;
      } catch (err) {
        skipped++;
      }
    }

    res.json({ success: true, data: { processed, skipped, total: due.length } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
