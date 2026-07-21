const express = require('express');
const router = express.Router();
const Quote = require('../models/Quote');
const Lead  = require('../models/Lead');
const Activity = require('../models/Activity');
const { auth, adminOnly } = require('../middleware/auth');
const { audit } = require('../services/auditService');

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
    const quote = await Quote.findByIdAndUpdate(req.params.id, { ...body, totalUSD, totalMXN }, { new: true });
    res.json({ success: true, data: quote });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
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
    res.json({ success: true, data: quote, message: `Cotización ${decision === 'approved' ? 'aprobada' : 'rechazada'}` });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
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
