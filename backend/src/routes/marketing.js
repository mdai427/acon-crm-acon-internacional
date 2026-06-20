const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { auth } = require('../middleware/auth');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const { cacheMiddleware } = require('../middleware/cacheMiddleware');
const { TTL, invalidateMarketing } = require('../services/cache');
const { enqueue } = require('../services/jobQueue');

// ── Schemas ──────────────────────────────────────────────────────
const campaignSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['email', 'whatsapp', 'mixed'], default: 'email' },
  status: { type: String, enum: ['draft', 'scheduled', 'running', 'paused', 'completed'], default: 'draft' },
  segment: {
    services: [String],
    stages: [String],
    countries: [String],
    minScore: Number,
    tags: [String],
  },
  subject: String,
  body: { type: String, required: true },
  scheduledAt: Date,
  sentCount: { type: Number, default: 0 },
  openCount: { type: Number, default: 0 },
  replyCount: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const automationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  trigger: {
    type: { type: String, enum: ['stage_entered', 'days_inactive', 'score_above', 'lead_created', 'date_based'], required: true },
    value: mongoose.Schema.Types.Mixed,
    stages: [String],
  },
  actions: [{
    type: { type: String, enum: ['send_email', 'send_whatsapp', 'create_activity', 'assign_to', 'change_stage', 'notify_exec'] },
    delay: { type: Number, default: 0 }, // hours
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
    body: String,
    value: String,
  }],
  executionCount: { type: Number, default: 0 },
  lastRunAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
const Automation = mongoose.models.Automation || mongoose.model('Automation', automationSchema);

router.use(auth);

// ── Campaigns ─────────────────────────────────────────────────────
router.get('/campaigns',
  cacheMiddleware(TTL.LIVE, () => 'marketing:campaigns'),
  async (req, res) => {
  try {
    const campaigns = await Campaign.find().populate('createdBy', 'name').sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: campaigns });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/campaigns', async (req, res) => {
  try {
    const campaign = await Campaign.create({ ...req.body, createdBy: req.user._id });
    invalidateMarketing();
    res.json({ success: true, data: campaign });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/campaigns/:id', async (req, res) => {
  try {
    const campaign = await Campaign.findByIdAndUpdate(req.params.id, req.body, { new: true });
    invalidateMarketing();
    res.json({ success: true, data: campaign });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/campaigns/:id', async (req, res) => {
  try {
    await Campaign.findByIdAndDelete(req.params.id);
    invalidateMarketing();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/marketing/campaigns/:id/launch — enqueue async job
router.post('/campaigns/:id/launch', async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaña no encontrada' });

    const job = await enqueue('campaign_launch', { campaignId: req.params.id, userId: req.user._id }, req.user._id);
    invalidateMarketing();
    res.status(202).json({ success: true, data: { jobId: job._id, message: 'Campaña en cola de procesamiento' } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Automations ───────────────────────────────────────────────────
router.get('/automations',
  cacheMiddleware(TTL.LIVE, () => 'marketing:automations'),
  async (req, res) => {
  try {
    const automations = await Automation.find().populate('createdBy', 'name').sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: automations });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/automations', async (req, res) => {
  try {
    const automation = await Automation.create({ ...req.body, createdBy: req.user._id });
    invalidateMarketing();
    res.json({ success: true, data: automation });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/automations/:id', async (req, res) => {
  try {
    const automation = await Automation.findByIdAndUpdate(req.params.id, req.body, { new: true });
    invalidateMarketing();
    res.json({ success: true, data: automation });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/automations/:id', async (req, res) => {
  try {
    await Automation.findByIdAndDelete(req.params.id);
    invalidateMarketing();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Segments — preview ─────────────────────────────────────────────
router.post('/segments/preview', async (req, res) => {
  try {
    const { services, stages, countries, minScore } = req.body;
    const filter = { isActive: true };
    if (services?.length) filter.services = { $in: services };
    if (stages?.length) filter.stage = { $in: stages };
    if (countries?.length) filter.country = { $in: countries };
    if (minScore) filter.score = { $gte: minScore };

    const count = await Lead.countDocuments(filter);
    const sample = await Lead.find(filter).limit(5).select('company stage country services score');
    res.json({ success: true, data: { count, sample } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Analytics ──────────────────────────────────────────────────────
// Cache 5 min: agrega múltiples collections
router.get('/analytics',
  cacheMiddleware(TTL.COMPUTED, () => 'marketing:analytics'),
  async (req, res) => {
  try {
    const [campaigns, automations] = await Promise.all([
      Campaign.find().select('name status sentCount openCount replyCount createdAt'),
      Automation.find().select('name isActive executionCount lastRunAt'),
    ]);

    const totalSent = campaigns.reduce((a, c) => a + (c.sentCount || 0), 0);
    const totalOpens = campaigns.reduce((a, c) => a + (c.openCount || 0), 0);
    const totalReplies = campaigns.reduce((a, c) => a + (c.replyCount || 0), 0);

    res.json({
      success: true,
      data: {
        campaigns: { total: campaigns.length, active: campaigns.filter(c => c.status === 'running').length, completed: campaigns.filter(c => c.status === 'completed').length },
        automations: { total: automations.length, active: automations.filter(a => a.isActive).length, totalExecutions: automations.reduce((a, x) => a + (x.executionCount || 0), 0) },
        totals: { sent: totalSent, opens: totalOpens, replies: totalReplies, openRate: totalSent ? Math.round((totalOpens / totalSent) * 100) : 0, replyRate: totalSent ? Math.round((totalReplies / totalSent) * 100) : 0 },
        recentCampaigns: campaigns.slice(0, 5),
      }
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
