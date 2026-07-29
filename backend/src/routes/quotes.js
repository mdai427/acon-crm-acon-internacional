const express = require('express');
const router = express.Router();
const Quote = require('../models/Quote');
const Lead  = require('../models/Lead');
const Activity = require('../models/Activity');
const { auth, adminOnly } = require('../middleware/auth');
const { audit } = require('../services/auditService');
const { notifyQuoteReviewed } = require('../services/notificationService');
const { generateQuotePDF } = require('../services/pdfService');
// Las llamadas a la IA pasan por aiClient para quedar contabilizadas.
const aiClient = require('../services/aiClient');
const User = require('../models/User');

// GET /api/quotes
router.get('/', auth, async (req, res) => {
  try {
    const { status, leadId, search } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (leadId) filter.lead = leadId;
    if (search) filter.$or = [
      { folio: { $regex: search, $options: 'i' } },
      { clientName: { $regex: search, $options: 'i' } },
    ];
    const page  = Math.max(1, Number(req.query.page) || 1);
    const lim   = Math.min(Number(req.query.limit) || 50, 100);
    const quotes = await Quote.find(filter)
      .populate('lead', 'company contact')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * lim)
      .limit(lim)
      .lean();
    const total = await Quote.countDocuments(filter);
    res.json({ success: true, data: quotes, pagination: { total, page, pages: Math.ceil(total / lim), limit: lim } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/quotes
router.post('/', auth, async (req, res) => {
  try {
    // Calcular totales
    const body = req.body;
    const totalUSD = (body.items || []).filter(i => i.currency === 'USD').reduce((s, i) => s + (i.qty * i.unitPrice), 0);
    const totalMXN = (body.items || []).filter(i => i.currency === 'MXN').reduce((s, i) => s + (i.qty * i.unitPrice), 0);

    const quote = await Quote.create({ ...body, totalUSD, totalMXN, createdBy: req.user._id });

    // Si viene con lead, registrar actividad
    if (body.lead) {
      await Activity.create({
        lead: body.lead, user: req.user._id, type: 'note',
        direction: 'internal', subject: `Cotización creada: ${quote.folio}`,
        content: `Nueva cotización ${quote.folio} — ${quote.serviceType} — $${totalUSD.toFixed(0)} USD`,
      });
    }

    res.status(201).json({ success: true, data: quote });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// GET /api/quotes/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
      .populate('lead', 'company contact email phone')
      .populate('createdBy', 'name phone');
    if (!quote) return res.status(404).json({ success: false, message: 'Cotización no encontrada' });
    res.json({ success: true, data: quote });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PUT /api/quotes/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const body = req.body;
    const totalUSD = (body.items || []).filter(i => i.currency === 'USD').reduce((s, i) => s + (i.qty * i.unitPrice), 0);
    const totalMXN = (body.items || []).filter(i => i.currency === 'MXN').reduce((s, i) => s + (i.qty * i.unitPrice), 0);

    // Snapshot current version before overwriting
    const existing = await Quote.findById(req.params.id).lean();
    const versionPush = existing ? {
      versionNumber: (existing.versions?.length || 0) + 1,
      savedAt: new Date(),
      savedBy: req.user._id,
      snapshot: { ...existing, versions: undefined },
    } : null;

    const update = { ...body, totalUSD, totalMXN };
    if (versionPush) update.$push = { versions: versionPush };
    const quote = await Quote.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json({ success: true, data: quote });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// GET /api/quotes/:id/versions — list version history
router.get('/:id/versions', auth, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
      .populate('versions.savedBy', 'name')
      .select('folio versions')
      .lean();
    if (!quote) return res.status(404).json({ success: false, message: 'No encontrada' });
    res.json({ success: true, data: (quote.versions || []).reverse() });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PUT /api/quotes/:id/status
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const update = { status };
    if (status === 'sent')     update.sentAt = new Date();
    if (status === 'accepted') update.acceptedAt = new Date();
    const quote = await Quote.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json({ success: true, data: quote });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// DELETE /api/quotes/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await Quote.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── FLUJO DE APROBACIÓN INTERNA ──────────────────────────────────────────────

// POST /api/quotes/:id/request-approval — ejecutivo solicita aprobación a gerencia
router.post('/:id/request-approval', auth, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) return res.status(404).json({ success: false, message: 'Cotización no encontrada' });
    if (quote.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Solo cotizaciones en borrador pueden enviarse a aprobación' });
    }

    quote.status = 'pending_approval';
    quote.approval = {
      requestedAt: new Date(),
      requestedBy: req.user._id,
    };
    await quote.save();

    // Registrar actividad en el lead
    if (quote.lead) {
      await Activity.create({
        lead: quote.lead, user: req.user._id, type: 'note',
        direction: 'internal', isAuto: false,
        subject: `Aprobación solicitada: ${quote.folio}`,
        content: `${req.user.name} solicitó aprobación para la cotización ${quote.folio}`,
      });
    }

    // Notificar a admins via socket
    req.io?.emit('quote_approval_requested', {
      quoteId: quote._id, folio: quote.folio,
      requestedBy: req.user.name, clientName: quote.clientName,
    });

    res.json({ success: true, data: quote, message: 'Cotización enviada a aprobación' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/quotes/:id/review — gerencia/admin aprueba o rechaza
router.post('/:id/review', auth, async (req, res) => {
  try {
    if (!['admin', 'executive'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Solo gerencia puede aprobar cotizaciones' });
    }

    const { decision, comments } = req.body;
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'Decisión inválida (approved | rejected)' });
    }

    const quote = await Quote.findById(req.params.id).populate('approval.requestedBy', 'name _id');
    if (!quote) return res.status(404).json({ success: false, message: 'Cotización no encontrada' });
    if (quote.status !== 'pending_approval') {
      return res.status(400).json({ success: false, message: 'La cotización no está pendiente de aprobación' });
    }

    quote.status = decision === 'approved' ? 'approved' : 'rejected_approval';
    quote.approval = {
      ...quote.approval.toObject(),
      reviewedAt: new Date(),
      reviewedBy: req.user._id,
      decision,
      comments: comments || '',
    };
    await quote.save();

    // Registrar actividad
    if (quote.lead) {
      await Activity.create({
        lead: quote.lead, user: req.user._id, type: 'note',
        direction: 'internal', isAuto: false,
        subject: `Cotización ${decision === 'approved' ? 'aprobada' : 'rechazada'}: ${quote.folio}`,
        content: `${req.user.name} ${decision === 'approved' ? 'aprobó' : 'rechazó'} la cotización ${quote.folio}. ${comments || ''}`,
      });
    }

    // Notificar al ejecutivo que creó la cotización
    const targetUserId = quote.approval?.requestedBy?._id || quote.createdBy;
    if (targetUserId) {
      req.io?.to(`user_${targetUserId}`).emit('quote_reviewed', {
        quoteId: quote._id, folio: quote.folio, decision, comments,
        reviewedBy: req.user.name,
      });
    }

    audit({ req, action: 'approve', entity: 'Quote', entityId: quote._id, entityLabel: quote.folio, meta: { decision, comments } }).catch(() => {});

    // Notify the quote creator
    const creatorId = quote.approval?.requestedBy?._id || quote.createdBy;
    if (creatorId && String(creatorId) !== String(req.user._id)) {
      const assignee = await User.findById(creatorId).select('name email phone').lean();
      if (assignee) {
        notifyQuoteReviewed({ quote, decision, comments, reviewerName: req.user.name, assignee, io: req.io }).catch(() => {});
      }
    }

    res.json({ success: true, data: quote, message: `Cotización ${decision === 'approved' ? 'aprobada' : 'rechazada'}` });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/quotes/:id/pdf — generate branded PDF
router.get('/:id/pdf', auth, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
      .populate('lead', 'company contact email phone')
      .populate('createdBy', 'name phone email')
      .lean();
    if (!quote) return res.status(404).json({ success: false, message: 'Cotización no encontrada' });

    const exchangeRate = parseFloat(process.env.DEFAULT_EXCHANGE_RATE) || 17;
    const pdf = await generateQuotePDF(quote, { exchangeRate });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${quote.folio || 'cotizacion'}.pdf"`);
    res.send(pdf);
  } catch (e) {
    console.error('[quotes/pdf]', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/quotes/import — bulk import from Excel/CSV (array of quote objects)
router.post('/import', auth, async (req, res) => {
  try {
    const { quotes: rows } = req.body;
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ success: false, message: 'No hay cotizaciones para importar' });

    const created = [], errors = [];
    for (const row of rows) {
      try {
        const totalUSD = (row.items || []).filter(i => i.currency === 'USD').reduce((s, i) => s + (i.qty * i.unitPrice), 0);
        const totalMXN = (row.items || []).filter(i => i.currency === 'MXN').reduce((s, i) => s + (i.qty * i.unitPrice), 0);
        const q = await Quote.create({ ...row, totalUSD, totalMXN, createdBy: req.user._id });
        created.push(q._id);
      } catch (e) {
        errors.push(`${row.folio || row.clientName || '?'}: ${e.message}`);
      }
    }
    res.json({ success: true, data: { created: created.length, errors } });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// POST /api/quotes/suggest — IA generativa: suggest prices, routes, carriers
router.post('/suggest', auth, async (req, res) => {
  try {
    const { serviceType, origin, destination, containerType, weight, commodity } = req.body;
    if (!serviceType) return res.status(400).json({ success: false, message: 'serviceType requerido' });

    // Fetch last 20 accepted/sent quotes for this service type as context
    const history = await Quote.find({ serviceType, status: { $in: ['accepted', 'sent', 'approved'] } })
      .sort({ createdAt: -1 }).limit(20)
      .select('origin destination totalUSD totalMXN items routes carrier clientName createdAt')
      .lean();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.includes('placeholder')) {
      // Heuristic fallback: median from history
      const amounts = history.map(q => q.totalUSD).filter(Boolean);
      const median = amounts.length ? amounts.sort((a, b) => a - b)[Math.floor(amounts.length / 2)] : null;
      return res.json({
        success: true,
        data: {
          suggestion: median
            ? `Basado en ${amounts.length} cotizaciones similares, el precio estimado es $${median.toLocaleString()} USD.`
            : 'Sin historial suficiente para estimar precios.',
          suggestedPriceUSD: median,
          carriers: [...new Set(history.map(q => q.carrier).filter(Boolean))].slice(0, 5),
          similarQuotes: history.slice(0, 5),
          source: 'heuristic',
        },
      });
    }

    const historyText = history.slice(0, 10).map(q =>
      `- ${q.origin || '?'} → ${q.destination || '?'}: $${q.totalUSD || 0} USD (${q.carrier || 'sin carrier'}, ${new Date(q.createdAt).toLocaleDateString('es-MX')})`
    ).join('\n');

    const prompt = `Eres un experto en logística internacional de carga para ACON Internacional México.

Analiza el historial de cotizaciones y sugiere un precio competitivo para la siguiente solicitud:

Servicio: ${serviceType}
Origen: ${origin || 'No especificado'}
Destino: ${destination || 'No especificado'}
Tipo de contenedor: ${containerType || 'N/A'}
Peso: ${weight ? `${weight} kg` : 'N/A'}
Mercancía: ${commodity || 'No especificada'}

Historial de cotizaciones similares aceptadas:
${historyText || 'Sin historial disponible'}

Responde en JSON con este formato:
{
  "suggestedPriceUSD": <número>,
  "priceRangeMin": <número>,
  "priceRangeMax": <número>,
  "recommendedCarrier": "<nombre del carrier>",
  "transitDays": "<días de tránsito estimados>",
  "reasoning": "<explicación de 2-3 oraciones>",
  "tips": ["<tip 1>", "<tip 2>"],
  "riskFactors": ["<riesgo 1>"]
}`;

    const completion = await aiClient.chat({
      feature: 'quote_suggest',
      user: req.user?._id,
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 600,
    });

    const suggestion = JSON.parse(completion.content);
    res.json({
      success: true,
      data: {
        ...suggestion,
        carriers: [...new Set(history.map(q => q.carrier).filter(Boolean))].slice(0, 5),
        similarQuotes: history.slice(0, 5),
        source: 'ai',
      },
    });
  } catch (e) {
    console.error('[quotes/suggest]', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/quotes/pending-approval — listar cotizaciones pendientes de revisión (admin)
router.get('/pending-approval/list', auth, async (req, res) => {
  try {
    const quotes = await Quote.find({ status: 'pending_approval' })
      .populate('createdBy', 'name')
      .populate('lead', 'company contact')
      .populate('approval.requestedBy', 'name')
      .sort({ 'approval.requestedAt': 1 })
      .lean();
    res.json({ success: true, data: quotes });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
