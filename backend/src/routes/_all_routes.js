// ============================================
// routes/agents.js
// ============================================
const express = require('express');
const agentsRouter = express.Router();
const { auth } = require('../middleware/auth');
const { generateEmailDraft, scoreLeadWithAI } = require('../services/aiAgent');
const Lead = require('../models/Lead');

agentsRouter.use(auth);

agentsRouter.post('/draft-email', async (req, res) => {
  try {
    const { leadId, purpose, additionalContext } = req.body;
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead no encontrado' });
    const draft = await generateEmailDraft({ lead, purpose, additionalContext });
    res.json({ success: true, data: draft });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

agentsRouter.post('/rescore/:leadId', async (req, res) => {
  try {
    const result = await scoreLeadWithAI(req.params.leadId);
    const lead = await Lead.findById(req.params.leadId);
    res.json({ success: true, data: { score: lead.score, aiNotes: lead.aiNotes, result } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// routes/users.js
// ============================================
const usersRouter = express.Router();
const { adminOnly } = require('../middleware/auth');
const User = require('../models/User');

usersRouter.use(auth);

// GET /api/users — todos (admin ve todos; executive/viewer se ve solo a sí mismo)
usersRouter.get('/', async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { _id: req.user._id };
    const users = await User.find(filter).select('-password').sort({ createdAt: 1 });
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/users — crear usuario (solo admin)
usersRouter.post('/', adminOnly, async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Nombre, email y contraseña son requeridos' });
    }
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(400).json({ success: false, message: 'El email ya está registrado' });
    }
    const user = await User.create({ name, email, password, role: role || 'executive', phone });
    res.status(201).json({ success: true, data: user.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/users/:id — editar (admin edita cualquiera; usuario edita su propio perfil excepto role)
usersRouter.put('/:id', async (req, res) => {
  try {
    const isSelf = req.params.id === String(req.user._id);
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && !isSelf) return res.status(403).json({ success: false, message: 'Sin permiso' });

    const allowed = isAdmin
      ? ['name', 'role', 'phone', 'isActive', 'notifications']
      : ['name', 'phone', 'notifications'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/users/:id/reset-password — admin resetea contraseña
usersRouter.put('/:id/reset-password', adminOnly, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 6 caracteres' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Contraseña actualizada' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/users/:id — desactivar (solo admin, no puede desactivarse a sí mismo)
usersRouter.delete('/:id', adminOnly, async (req, res) => {
  try {
    if (req.params.id === String(req.user._id)) {
      return res.status(400).json({ success: false, message: 'No puedes desactivar tu propia cuenta' });
    }
    await User.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Usuario desactivado' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// routes/activities.js
// ============================================
const activitiesRouter = express.Router();
const Activity = require('../models/Activity');

activitiesRouter.use(auth);

activitiesRouter.get('/lead/:leadId', async (req, res) => {
  try {
    const activities = await Activity.find({ lead: req.params.leadId })
      .populate('user', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ success: true, data: activities });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

activitiesRouter.post('/', async (req, res) => {
  try {
    const activity = await Activity.create({ ...req.body, user: req.user._id });
    if (req.body.type !== 'task') {
      await Lead.findByIdAndUpdate(req.body.lead, { lastContactDate: new Date() });
    }
    req.io?.emit('activity_new', { leadId: req.body.lead, activity });
    res.status(201).json({ success: true, data: activity });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

activitiesRouter.put('/:id/complete', async (req, res) => {
  try {
    const activity = await Activity.findByIdAndUpdate(
      req.params.id,
      { 'taskData.completed': true, 'taskData.completedAt': new Date() },
      { new: true }
    );
    res.json({ success: true, data: activity });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// routes/pipeline.js
// ============================================
const pipelineRouter = express.Router();

pipelineRouter.use(auth);

pipelineRouter.get('/kanban', async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.user.role === 'executive') filter.assignedTo = req.user._id;

    const stages = ['new','contacted','qualified','proposal','negotiation','closed_won','closed_lost'];
    const result = {};

    await Promise.all(stages.map(async (stage) => {
      result[stage] = await Lead.find({ ...filter, stage })
        .populate('assignedTo', 'name avatar')
        .sort({ score: -1, updatedAt: -1 })
        .limit(20)
        .select('company contact stage score priority value source services createdAt lastContactDate daysSinceLastContact assignedTo');
    }));

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

pipelineRouter.put('/move', async (req, res) => {
  try {
    const { leadId, newStage } = req.body;
    const lead = await Lead.findById(leadId);
    const prevStage = lead.stage;

    await Lead.findByIdAndUpdate(leadId, { stage: newStage });
    await Activity.create({
      lead: leadId, user: req.user._id, type: 'stage_change',
      direction: 'internal', stageChange: { from: prevStage, to: newStage },
      content: `Etapa: ${prevStage} → ${newStage}`
    });

    req.io?.emit('pipeline_updated', { leadId, stage: newStage });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// routes/integrations.js
// ============================================
const integrationsRouter = express.Router();

integrationsRouter.use(auth, adminOnly);

integrationsRouter.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      whatsapp: {
        connected: !!(process.env.META_WA_TOKEN && process.env.META_WA_PHONE_ID),
        provider: 'Meta WhatsApp Cloud API',
        phoneId: process.env.META_WA_PHONE_ID ? '✅ Configurado' : '❌ No configurado'
      },
      email: {
        connected: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
        provider: process.env.SMTP_HOST || 'No configurado',
        user: process.env.SMTP_USER || 'No configurado'
      },
      openai: {
        connected: !!process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
      },
      facebook: {
        connected: !!(process.env.META_ACCESS_TOKEN && process.env.META_PAGE_ID),
        pageId: process.env.META_PAGE_ID ? '✅ Configurado' : '❌ No configurado'
      },
      linkedin: {
        connected: !!process.env.LINKEDIN_ACCESS_TOKEN,
        note: 'Requiere configuracion via Zapier/Make para webhooks'
      },
      webhooks: {
        meta: `${process.env.FRONTEND_URL?.replace('3000','5000') || 'http://localhost:5000'}/api/webhooks/meta`,
        whatsapp: `${process.env.FRONTEND_URL?.replace('3000','5000') || 'http://localhost:5000'}/api/whatsapp/webhook`,
        generic: `${process.env.FRONTEND_URL?.replace('3000','5000') || 'http://localhost:5000'}/api/webhooks/generic`,
        linkedin: `${process.env.FRONTEND_URL?.replace('3000','5000') || 'http://localhost:5000'}/api/webhooks/linkedin`
      }
    }
  });
});

// routes/contacts.js (alias de leads para simplificar)
const contactsRouter = express.Router();
contactsRouter.use(auth);
contactsRouter.get('/', async (req, res) => {
  const leads = await Lead.find({ isActive: true, stage: 'closed_won' })
    .populate('assignedTo', 'name')
    .sort({ updatedAt: -1 });
  res.json({ success: true, data: leads });
});

// Exportar todos
module.exports = {
  agentsRoutes: agentsRouter,
  usersRoutes: usersRouter,
  activitiesRoutes: activitiesRouter,
  pipelineRoutes: pipelineRouter,
  integrationsRoutes: integrationsRouter,
  contactsRoutes: contactsRouter
};
