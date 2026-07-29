// ============================================
// Playbooks por etapa — qué se ejecuta al entrar un lead
// GET  /api/playbooks              — uno por cada etapa actual del pipeline
// PUT  /api/playbooks/:stage       — guarda las acciones de una etapa
// POST /api/playbooks/:stage/test  — ejecuta el playbook sobre un lead (prueba)
// ============================================
const express = require('express');
const router = express.Router();
const { auth, checkPerm } = require('../middleware/auth');
const Playbook = require('../models/Playbook');
const pipelineStages = require('../services/pipelineStages');
const { DEFAULT_PLAYBOOKS } = require('../services/aiTasks');

router.use(auth);

// Documento viejo (solo tasks) → acciones equivalentes, para que el editor
// muestre siempre el formato nuevo.
const toActions = (pb) => {
  if (pb.actions?.length) return pb.actions;
  return (pb.tasks || []).map((t, i) => ({
    kind: 'task', title: t.title, dueInDays: t.dueInDays ?? 2, delayDays: 0, order: i,
  }));
};

// GET /api/playbooks — la lista sigue a las etapas del pipeline: si se crea una
// etapa nueva, aparece aquí con su playbook vacío listo para configurar.
router.get('/', checkPerm('playbooks.view'), async (req, res) => {
  try {
    const [stages, playbooks] = await Promise.all([
      pipelineStages.getStages(),
      Playbook.find().lean(),
    ]);
    const byStage = Object.fromEntries(playbooks.map(p => [p.stage, p]));

    const data = stages.map(stage => {
      const pb = byStage[stage.key];
      return {
        stage: stage.key,
        stageLabel: stage.label,
        stageColor: stage.color,
        stageEmoji: stage.emoji || '',
        isActive: pb?.isActive ?? true,
        useAI: pb?.useAI ?? true,
        actions: pb ? toActions(pb) : (DEFAULT_PLAYBOOKS[stage.key] || []).map((title, i) => ({
          kind: 'task', title, dueInDays: (i + 1) * 2, delayDays: 0, order: i,
        })),
        exists: !!pb,
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/playbooks/:stage
router.put('/:stage', checkPerm('playbooks.edit'), async (req, res) => {
  try {
    if (!(await pipelineStages.exists(req.params.stage))) {
      return res.status(400).json({ success: false, message: 'Esa etapa no existe en el pipeline' });
    }
    const { actions, isActive, useAI } = req.body;

    const clean = (Array.isArray(actions) ? actions : [])
      .filter(a => String(a.title || '').trim())
      .map((a, i) => ({
        kind: ['task', 'whatsapp', 'email', 'ai_email_draft', 'notify'].includes(a.kind) ? a.kind : 'task',
        title: String(a.title).trim(),
        message: a.message || '',
        aiInstructions: a.aiInstructions || '',
        templateId: a.templateId || null,
        metaTemplate: {
          name: a.metaTemplate?.name || '',
          language: a.metaTemplate?.language || 'es_MX',
        },
        subject: a.subject || '',
        dueInDays: Math.max(0, Number(a.dueInDays) || 2),
        delayDays: Math.max(0, Number(a.delayDays) || 0),
        onlyIf: {
          minScore: a.onlyIf?.minScore !== undefined && a.onlyIf?.minScore !== '' ? Number(a.onlyIf.minScore) : null,
          maxScore: a.onlyIf?.maxScore !== undefined && a.onlyIf?.maxScore !== '' ? Number(a.onlyIf.maxScore) : null,
          minValue: a.onlyIf?.minValue !== undefined && a.onlyIf?.minValue !== '' ? Number(a.onlyIf.minValue) : null,
        },
        order: i,
      }));

    const sinPlantilla = clean.find(a => a.kind === 'whatsapp' && !a.metaTemplate.name);
    if (sinPlantilla) {
      return res.status(400).json({
        success: false,
        message: `La acción "${sinPlantilla.title}" necesita una plantilla de Meta: WhatsApp automático solo envía plantillas aprobadas`,
      });
    }

    const playbook = await Playbook.findOneAndUpdate(
      { stage: req.params.stage },
      { actions: clean, tasks: [], isActive, useAI, updatedBy: req.user._id },
      { new: true, upsert: true, runValidators: true }
    );
    res.json({ success: true, data: playbook, message: 'Playbook guardado' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/playbooks/:stage/test — ejecuta el playbook sobre un lead concreto
// para verlo funcionar sin esperar a que alguien mueva una tarjeta.
router.post('/:stage/test', checkPerm('playbooks.edit'), async (req, res) => {
  try {
    const { leadId } = req.body;
    if (!leadId) return res.status(400).json({ success: false, message: 'Indica el lead de prueba' });

    const playbookRunner = require('../services/playbookRunner');
    const result = await playbookRunner.runStageEntry({
      leadId,
      stageKey: req.params.stage,
      userId: req.user._id,
      io: req.io,
    });
    res.json({
      success: true,
      data: result,
      message: `${result.executed || 0} acción(es) ejecutadas${result.queued ? `, ${result.queued} programada(s)` : ''}${result.skipped ? `, ${result.skipped} omitida(s) por condición` : ''}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
