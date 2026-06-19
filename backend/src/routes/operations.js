const express = require('express');
const router = express.Router();
const axios = require('axios');
const Operation = require('../models/Operation');
const Activity = require('../models/Activity');
const Lead = require('../models/Lead');
const { auth } = require('../middleware/auth');

const WA_API_URL = 'https://graph.facebook.com/v18.0';

const STATUS_LABELS = {
  booking:    'Reserva confirmada',
  departed:   'Mercancía despachada',
  in_transit: 'En tránsito',
  in_customs: 'En aduana',
  released:   'Liberado de aduana',
  delivered:  'Entregado'
};

async function notifyStatusChange(op, newStatus) {
  try {
    const lead = op.lead || (op.lead?._id ? op.lead : await Lead.findById(op.lead).select('whatsapp email contact company'));
    if (!lead) return;

    const phone = lead.whatsapp || lead.phone;
    const statusLabel = STATUS_LABELS[newStatus] || newStatus;
    const message = `📦 *ACON Internacional* — Actualización de tu embarque\n\n` +
      `Folio: *${op.bookingNumber}*\n` +
      `Ruta: ${op.origin} → ${op.destination}\n` +
      `Estado: *${statusLabel}*\n\n` +
      `Para más información contacta a tu ejecutivo ACON.`;

    const phoneId = process.env.META_WA_PHONE_ID;
    const token = process.env.META_WA_TOKEN;
    if (phone && phoneId && token) {
      await axios.post(
        `${WA_API_URL}/${phoneId}/messages`,
        { messaging_product: 'whatsapp', to: phone.replace(/\D/g, ''), type: 'text', text: { body: message, preview_url: false } },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
    }
  } catch (e) {
    console.error('WA notify error:', e.message);
  }
}

// GET /api/operations
router.get('/', auth, async (req, res) => {
  try {
    const { status, serviceType, search, limit = 100 } = req.query;
    const filter = { isActive: true };
    if (status) filter.status = status;
    if (serviceType) filter.serviceType = serviceType;
    if (search) filter.$or = [
      { bookingNumber: { $regex: search, $options: 'i' } },
      { clientName: { $regex: search, $options: 'i' } },
      { blAwbCartaPorte: { $regex: search, $options: 'i' } },
      { origin: { $regex: search, $options: 'i' } },
      { destination: { $regex: search, $options: 'i' } },
    ];
    const ops = await Operation.find(filter)
      .populate('lead', 'company contact')
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 })
      .limit(Number(limit));
    res.json({ success: true, data: ops });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/operations
router.post('/', auth, async (req, res) => {
  try {
    const op = await Operation.create({ ...req.body, assignedTo: req.user._id });
    res.status(201).json({ success: true, data: op });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/operations/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const op = await Operation.findById(req.params.id)
      .populate('lead', 'company contact email phone')
      .populate('assignedTo', 'name');
    if (!op) return res.status(404).json({ success: false, message: 'Operación no encontrada' });
    res.json({ success: true, data: op });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/operations/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const op = await Operation.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate('lead', 'company')
      .populate('assignedTo', 'name');
    if (!op) return res.status(404).json({ success: false, message: 'Operación no encontrada' });
    res.json({ success: true, data: op });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/operations/:id/status — cambio rápido de estado
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const op = await Operation.findByIdAndUpdate(
      req.params.id,
      { status, ...(status === 'delivered' ? { actualDelivery: new Date() } : {}) },
      { new: true }
    ).populate('lead', 'whatsapp phone email company contact');
    if (!op) return res.status(404).json({ success: false, message: 'Operación no encontrada' });

    // Registrar actividad y notificar cliente (fire-and-forget)
    setImmediate(async () => {
      try {
        if (op.lead?._id) {
          await Activity.create({
            lead: op.lead._id,
            user: req.user._id,
            type: 'system',
            direction: 'internal',
            content: `Operación ${op.bookingNumber} → ${STATUS_LABELS[status] || status}`
          });
        }
        await notifyStatusChange(op, status);
      } catch (e) { console.error('status notify:', e.message); }
    });

    req.io?.emit('operation_updated', op);
    res.json({ success: true, data: op });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/operations/:id/document — actualizar estado de documento
router.put('/:id/document', auth, async (req, res) => {
  try {
    const { type, status, deadline, notes } = req.body;
    const op = await Operation.findById(req.params.id);
    if (!op) return res.status(404).json({ success: false, message: 'Operación no encontrada' });

    const existing = op.documents.find(d => d.type === type);
    if (existing) {
      existing.status = status || existing.status;
      if (deadline) existing.deadline = deadline;
      if (notes !== undefined) existing.notes = notes;
    } else {
      op.documents.push({ type, status: status || 'pending', deadline, notes });
    }
    await op.save();
    res.json({ success: true, data: op });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/operations/summary — KPIs para Dashboard
router.get('/summary', auth, async (req, res) => {
  try {
    const [total, byStatus, inTransit, delivered] = await Promise.all([
      Operation.countDocuments({ isActive: true }),
      Operation.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Operation.countDocuments({ isActive: true, status: { $in: ['departed','in_transit','in_customs'] } }),
      Operation.countDocuments({ isActive: true, status: 'delivered' }),
    ]);
    res.json({ success: true, data: { total, byStatus, inTransit, delivered } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/operations/:id (soft)
router.delete('/:id', auth, async (req, res) => {
  try {
    await Operation.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Operación eliminada' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
