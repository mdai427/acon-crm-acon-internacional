const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { auth, checkPerm } = require('../middleware/auth');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const { cacheMiddleware } = require('../middleware/cacheMiddleware');
const { TTL, invalidateMarketing } = require('../services/cache');
const { enqueue } = require('../services/jobQueue');
const Mailbox = require('../models/Mailbox');
const CampaignRecipient = require('../models/CampaignRecipient');
const campaignSender = require('../services/campaignSender');
const mailer = require('../services/mailerService');
const { pick } = require('../utils/pick');

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
  // Cuerpo del correo. Las campañas de WhatsApp no lo usan: envían plantilla.
  body: { type: String, default: '' },

  // Campaña de WhatsApp: plantilla aprobada de Meta y el valor de cada
  // variable {{n}} (admiten {{contact}}, {{company}}… que se renderizan por lead).
  waTemplate: {
    name:      { type: String, default: '' },
    language:  { type: String, default: 'es_MX' },
    params:    { type: [String], default: [] },
    headerUrl: { type: String, default: '' },
  },

  // Cómo se escribió el cuerpo:
  //   'text' → correo en blanco: se escribe texto plano y el CRM lo envuelve
  //            en una maqueta mínima (así también se ve bien en HTML).
  //   'html' → plantilla HTML completa, pegada o elegida de Plantillas.
  bodyType: { type: String, enum: ['text', 'html'], default: 'text' },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
  // Buzón remitente. Si no se elige, se usa el que esté por defecto.
  mailbox: { type: mongoose.Schema.Types.ObjectId, ref: 'Mailbox' },

  scheduledAt: Date,

  // ── Métricas ──────────────────────────────────────────────────
  // Se llenan con los webhooks del proveedor, no con estimaciones.
  totalRecipients: { type: Number, default: 0 },
  sentCount:      { type: Number, default: 0 },
  deliveredCount: { type: Number, default: 0 },
  openCount:      { type: Number, default: 0 },
  clickCount:     { type: Number, default: 0 },
  bouncedCount:   { type: Number, default: 0 },
  complainedCount:{ type: Number, default: 0 },
  failedCount:    { type: Number, default: 0 },
  // Excluidos antes de enviar por estar en la lista de supresión.
  skippedCount:   { type: Number, default: 0 },
  unsubscribeCount:{ type: Number, default: 0 },
  replyCount: { type: Number, default: 0 },

  lastError: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });


// Campos que el cliente puede escribir. Los contadores (sentCount, openCount…)
// quedan fuera a propósito: los llenan los webhooks del proveedor, y dejarlos
// abiertos permitiría inventar los resultados de una campaña.
const CAMPAIGN_FIELDS = ['name', 'type', 'status', 'segment', 'subject', 'body',
  'bodyType', 'templateId', 'mailbox', 'scheduledAt', 'waTemplate'];

router.use(auth);

// ── Campaigns ─────────────────────────────────────────────────────
router.get('/campaigns',
  checkPerm('marketing.view'),
  cacheMiddleware(TTL.LIVE, () => 'marketing:campaigns'),
  async (req, res) => {
  try {
    const campaigns = await Campaign.find().populate('createdBy', 'name').sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: campaigns });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/campaigns', checkPerm('marketing.create'), async (req, res) => {
  try {
    const campaign = await Campaign.create({ ...pick(req.body, CAMPAIGN_FIELDS), createdBy: req.user._id });
    invalidateMarketing();
    res.json({ success: true, data: campaign });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/campaigns/:id', checkPerm('marketing.create'), async (req, res) => {
  try {
    const campaign = await Campaign.findByIdAndUpdate(req.params.id, pick(req.body, CAMPAIGN_FIELDS), { new: true });
    invalidateMarketing();
    res.json({ success: true, data: campaign });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/campaigns/:id', checkPerm('marketing.delete'), async (req, res) => {
  try {
    await Campaign.findByIdAndDelete(req.params.id);
    invalidateMarketing();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/marketing/campaigns/:id/launch — enqueue async job
router.post('/campaigns/:id/launch', checkPerm('marketing.launch'), async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaña no encontrada' });

    const job = await enqueue('campaign_launch', { campaignId: req.params.id, userId: req.user._id }, req.user._id);
    invalidateMarketing();
    res.status(202).json({ success: true, data: { jobId: job._id, message: 'Campaña en cola de procesamiento' } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/marketing/campaigns/:id/test — prueba antes de disparar a todos.
// Se envía a la dirección que pida el usuario, sin tocar contadores ni
// registrar destinatarios.
router.post('/campaigns/:id/test', checkPerm('marketing.launch'), async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaña no encontrada' });

    const to = req.body.to || req.user.email;
    const mailbox = campaign.mailbox
      ? await Mailbox.findById(campaign.mailbox)
      : await Mailbox.findOne({ isActive: true, isDefault: true });

    // Datos ficticios para ver cómo quedan las variables {{contact}}, {{company}}…
    const sample = {
      contact: req.user.name, company: 'Empresa de prueba',
      country: 'México', city: 'CDMX', email: to,
    };
    const content = campaignSender.composeFor(campaign, sample, mailbox);

    await mailer.sendMail({
      from: mailbox ? mailbox.fromHeader() : mailer.defaultFrom(),
      to,
      subject: `[PRUEBA] ${content.subject}`,
      html: content.html,
    });

    res.json({ success: true, message: `Prueba enviada a ${to}` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/marketing/campaigns/:id/metrics — resultado real del envío.
// Los porcentajes se calculan sobre los entregados, no sobre los enviados:
// medir aperturas contra correos que rebotaron infla la tasa.
router.get('/campaigns/:id/metrics', checkPerm('marketing.view'), async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id).lean();
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaña no encontrada' });

    const byStatus = await CampaignRecipient.aggregate([
      { $match: { campaign: new mongoose.Types.ObjectId(req.params.id) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const counts = Object.fromEntries(byStatus.map(row => [row._id, row.count]));

    const delivered = campaign.deliveredCount || 0;
    const base = delivered || campaign.sentCount || 0;
    const rate = (value) => (base ? Math.round((value / base) * 1000) / 10 : 0);

    // Quiénes fallaron, para poder corregir direcciones a mano.
    const problems = await CampaignRecipient.find({
      campaign: req.params.id,
      status: { $in: ['failed', 'bounced', 'complained', 'skipped'] },
    }).populate('lead', 'company contact').select('email status reason').limit(200).lean();

    res.json({
      success: true,
      data: {
        campaign: {
          name: campaign.name, status: campaign.status,
          totalRecipients: campaign.totalRecipients, lastError: campaign.lastError,
        },
        counts,
        totals: {
          sent: campaign.sentCount || 0,
          delivered,
          opened: campaign.openCount || 0,
          clicked: campaign.clickCount || 0,
          bounced: campaign.bouncedCount || 0,
          complained: campaign.complainedCount || 0,
          failed: campaign.failedCount || 0,
          skipped: campaign.skippedCount || 0,
          replies: campaign.replyCount || 0,
        },
        rates: {
          // La apertura es una métrica sucia (Apple Mail la infla al precargar
          // el píxel); el clic es la señal confiable de interés.
          openRate:   rate(campaign.openCount || 0),
          clickRate:  rate(campaign.clickCount || 0),
          bounceRate: campaign.sentCount ? Math.round(((campaign.bouncedCount || 0) / campaign.sentCount) * 1000) / 10 : 0,
        },
        problems,
      },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Segments — preview ─────────────────────────────
router.post('/segments/preview', checkPerm('marketing.view'), async (req, res) => {
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
  checkPerm('marketing.view'),
  cacheMiddleware(TTL.COMPUTED, () => 'marketing:analytics'),
  async (req, res) => {
  try {
    const Flow = require('../models/Flow');
    const FlowRun = require('../models/FlowRun');
    const [campaigns, flows, flowRuns] = await Promise.all([
      Campaign.find().select('name status sentCount openCount replyCount createdAt'),
      Flow.find({ status: { $ne: 'archived' } }).select('name isActive'),
      FlowRun.countDocuments(),
    ]);

    const totalSent = campaigns.reduce((a, c) => a + (c.sentCount || 0), 0);
    const totalOpens = campaigns.reduce((a, c) => a + (c.openCount || 0), 0);
    const totalReplies = campaigns.reduce((a, c) => a + (c.replyCount || 0), 0);

    res.json({
      success: true,
      data: {
        campaigns: { total: campaigns.length, active: campaigns.filter(c => c.status === 'running').length, completed: campaigns.filter(c => c.status === 'completed').length },
        automations: { total: flows.length, active: flows.filter(f => f.isActive).length, totalExecutions: flowRuns },
        totals: { sent: totalSent, opens: totalOpens, replies: totalReplies, openRate: totalSent ? Math.round((totalOpens / totalSent) * 100) : 0, replyRate: totalSent ? Math.round((totalReplies / totalSent) * 100) : 0 },
        recentCampaigns: campaigns.slice(0, 5),
      }
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
