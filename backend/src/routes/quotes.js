const express = require('express');
const router = express.Router();
const Quote = require('../models/Quote');
const Lead  = require('../models/Lead');
const Activity = require('../models/Activity');
const { auth } = require('../middleware/auth');

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

module.exports = router;
