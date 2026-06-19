const express = require('express');
const router = express.Router();
const Operation = require('../models/Operation');
const { auth } = require('../middleware/auth');

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
    );
    if (!op) return res.status(404).json({ success: false, message: 'Operación no encontrada' });
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
