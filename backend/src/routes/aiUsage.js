// ============================================
// Consumo de IA — vista del CRM (el cliente)
// ============================================
// Aquí solo se expone el precio facturado, nunca el costo real ni el margen:
// eso vive en /api/superadmin.
const express = require('express');
const router = express.Router();
const { auth, checkPerm } = require('../middleware/auth');
const AiUsage = require('../models/AiUsage');
const aiBilling = require('../services/aiBilling');

// Etiquetas legibles de cada herramienta que consume IA.
const FEATURE_LABELS = {
  lead_scoring:       'Calificación de leads',
  auto_reply:         'Respuesta automática',
  email_draft:        'Redacción de correos',
  pipeline_analysis:  'Análisis del pipeline',
  copilot:            'Copiloto',
  stage_tasks:        'Tareas por etapa',
  quote_suggest:      'Sugerencia de cotización',
  company_research:   'Investigación de empresa',
  call_transcription: 'Transcripción de llamadas',
  connection_test:    'Prueba de conexión',
};

const labelFor = (feature) => FEATURE_LABELS[feature] || feature;

// Quita el costo real y el margen: el cliente solo ve lo que paga.
const toClientUsage = (u) => ({
  _id: u._id,
  feature: u.feature,
  featureLabel: labelFor(u.feature),
  model: u.model,
  kind: u.kind,
  inputTokens: u.inputTokens,
  outputTokens: u.outputTokens,
  audioSeconds: u.audioSeconds,
  amountUsd: u.priceUsd,
  user: u.user,
  lead: u.lead,
  createdAt: u.createdAt,
  period: u.period,
  status: u.status,
});

// ─────────────────────────────────────────
// GET /api/ai-usage/summary?period=AAAA-MM — totales del periodo
// ─────────────────────────────────────────
router.get('/summary', auth, checkPerm('ai_usage.view'), async (req, res) => {
  try {
    const period = req.query.period || aiBilling.periodOf();
    const data = await aiBilling.getPeriod(period);

    res.json({
      success: true,
      data: {
        period: data.period,
        status: data.status,
        closedAt: data.closedAt || null,
        calls: data.totals.calls,
        inputTokens: data.totals.inputTokens,
        outputTokens: data.totals.outputTokens,
        audioSeconds: data.totals.audioSeconds,
        amountUsd: data.totals.priceUsd,       // lo que se debe por ese periodo
        byFeature: (data.byFeature || []).map(f => ({
          feature: f.feature,
          featureLabel: labelFor(f.feature),
          calls: f.calls,
          amountUsd: f.priceUsd,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────
// GET /api/ai-usage/periods — historial de periodos facturados
// ─────────────────────────────────────────
router.get('/periods', auth, checkPerm('ai_usage.view'), async (req, res) => {
  try {
    const periods = await aiBilling.listPeriods();
    res.json({
      success: true,
      data: periods.map(p => ({
        period: p.period,
        status: p.status,
        closedAt: p.closedAt || null,
        calls: p.totals.calls,
        amountUsd: p.totals.priceUsd,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────
// GET /api/ai-usage — detalle de cada consumo del periodo
// ─────────────────────────────────────────
router.get('/', auth, checkPerm('ai_usage.view'), async (req, res) => {
  try {
    const period = req.query.period || aiBilling.periodOf();
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const filter = { period, status: 'ok' };
    if (req.query.feature) filter.feature = req.query.feature;

    const [items, total] = await Promise.all([
      AiUsage.find(filter)
        .populate('user', 'name email')
        .populate('lead', 'company contact')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AiUsage.countDocuments(filter),
    ]);

    res.json({ success: true, data: items.map(toClientUsage), meta: { total, limit, skip } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
module.exports.FEATURE_LABELS = FEATURE_LABELS;
module.exports.labelFor = labelFor;
