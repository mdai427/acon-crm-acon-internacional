const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { auth } = require('../middleware/auth');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');

// PostVenta schema
const postVentaSchema = new mongoose.Schema({
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['active', 'at_risk', 'churned', 'renewed'], default: 'active' },
  npsScore: { type: Number, min: 0, max: 10 },
  npsComment: String,
  shipmentCount: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  lastShipmentDate: Date,
  nextRenewalDate: Date,
  services: [String],
  notes: String,
  tags: [String],
}, { timestamps: true });

const PostVenta = mongoose.models.PostVenta || mongoose.model('PostVenta', postVentaSchema);

router.use(auth);

// GET /api/postventa — list all post-venta records
router.get('/', async (req, res) => {
  try {
    const records = await PostVenta.find()
      .populate('lead', 'company contact email country')
      .populate('assignedTo', 'name')
      .sort({ updatedAt: -1 });
    res.json({ success: true, data: records });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/postventa/summary
router.get('/summary', async (req, res) => {
  try {
    const [total, atRisk, avgNPS, records] = await Promise.all([
      PostVenta.countDocuments(),
      PostVenta.countDocuments({ status: 'at_risk' }),
      PostVenta.aggregate([{ $match: { npsScore: { $exists: true } } }, { $group: { _id: null, avg: { $avg: '$npsScore' } } }]),
      PostVenta.find().select('totalRevenue status'),
    ]);

    const totalRevenue = records.reduce((a, r) => a + (r.totalRevenue || 0), 0);
    const active = records.filter(r => r.status === 'active').length;

    res.json({ success: true, data: { total, atRisk, active, avgNPS: avgNPS[0]?.avg?.toFixed(1) || '—', totalRevenue } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/postventa — create record from closed_won lead
router.post('/', async (req, res) => {
  try {
    const record = await PostVenta.create({ ...req.body, assignedTo: req.body.assignedTo || req.user._id });
    const populated = await PostVenta.findById(record._id).populate('lead', 'company contact email').populate('assignedTo', 'name');
    res.json({ success: true, data: populated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT /api/postventa/:id
router.put('/:id', async (req, res) => {
  try {
    const record = await PostVenta.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('lead', 'company contact email').populate('assignedTo', 'name');
    res.json({ success: true, data: record });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/postventa/:id/nps — submit NPS
router.post('/:id/nps', async (req, res) => {
  try {
    const { score, comment } = req.body;
    const record = await PostVenta.findByIdAndUpdate(req.params.id, { npsScore: score, npsComment: comment }, { new: true })
      .populate('lead', 'company');

    // Log activity
    await Activity.create({ lead: record.lead._id, type: 'note', content: `NPS registrado: ${score}/10 — ${comment || ''}`, direction: 'inbound', user: req.user._id });
    res.json({ success: true, data: record });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/postventa/renewals — upcoming renewals
router.get('/renewals', async (req, res) => {
  try {
    const in30days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const renewals = await PostVenta.find({ nextRenewalDate: { $lte: in30days, $gte: new Date() } })
      .populate('lead', 'company contact').populate('assignedTo', 'name')
      .sort({ nextRenewalDate: 1 });
    res.json({ success: true, data: renewals });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/postventa/auto-sync — auto-create records for closed_won leads without postventa
router.post('/auto-sync', async (req, res) => {
  try {
    const wonLeads = await Lead.find({ stage: 'closed_won', isActive: true });
    const existingLeadIds = (await PostVenta.find().select('lead')).map(r => r.lead.toString());
    const newLeads = wonLeads.filter(l => !existingLeadIds.includes(l._id.toString()));

    const created = await Promise.all(newLeads.map(lead =>
      PostVenta.create({
        lead: lead._id,
        assignedTo: lead.assignedTo,
        services: lead.services || [],
        status: 'active',
        totalRevenue: lead.value || 0,
      })
    ));

    res.json({ success: true, data: { synced: created.length } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
