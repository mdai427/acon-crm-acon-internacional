// ============================================
// routes/agents.js
// ============================================
const { PUBLIC_BASE_URL } = require('../config/urls');
const express = require('express');
const agentsRouter = express.Router();
const { auth, checkPerm } = require('../middleware/auth');
const { generateEmailDraft, scoreLeadWithAI } = require('../services/aiAgent');
const Lead = require('../models/Lead');
const { validatePassword } = require('../utils/passwordPolicy');

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

agentsRouter.post('/campaign', async (req, res) => {
  try {
    const { leadIds, templateId, channel, customBody } = req.body;
    if (!leadIds || !leadIds.length) {
      return res.status(400).json({ success: false, message: 'Se requiere al menos un lead' });
    }

    // Respond immediately — process in background
    res.json({ success: true, message: `Campaña iniciada para ${leadIds.length} lead(s)`, data: { sent: leadIds.length } });

    setImmediate(async () => {
      try {
        const Activity = require('../models/Activity');
        const axios = require('axios');
        const Template = templateId ? require('../models/Template') : null;
        let templateDoc = null;
        if (Template && templateId) {
          templateDoc = await Template.findById(templateId).catch(() => null);
        }

        for (const leadId of leadIds) {
          try {
            const lead = await Lead.findById(leadId);
            if (!lead) continue;

            const body = customBody || (templateDoc ? templateDoc.body : '');
            const resolvedBody = body
              .replace(/\{\{nombre\}\}/gi, lead.contact || '')
              .replace(/\{\{empresa\}\}/gi, lead.company || '')
              .replace(/\{\{servicio\}\}/gi, (lead.services || []).join(', ') || '');

            const waToken = process.env.WHATSAPP_TOKEN || process.env.META_WA_TOKEN;
            const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.META_WA_PHONE_ID;
            if (channel === 'whatsapp' && waToken && waPhoneId) {
              const phone = (lead.whatsapp || lead.phone || '').replace(/\D/g, '');
              if (phone) {
                await axios.post(
                  `https://graph.facebook.com/v19.0/${waPhoneId}/messages`,
                  { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: resolvedBody } },
                  { headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' } }
                ).catch(() => {});
              }
            }

            await Activity.create({
              lead: leadId,
              type: 'whatsapp_out',
              direction: 'outbound',
              content: resolvedBody,
            });
          } catch (err) {
            console.error('Campaign lead error:', leadId, err.message);
          }
        }
      } catch (err) {
        console.error('Campaign error:', err.message);
      }
    });
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
usersRouter.get('/', checkPerm('users.view'), async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { _id: req.user._id };
    const users = await User.find(filter).select('-password').sort({ createdAt: 1 });
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Roles que el administrador del CRM NO puede asignar. 'superadmin' es el dueño
// de la plataforma: ve el costo real de la IA y define el margen de reventa, y
// su cuenta se crea solo desde el entorno (ver services/superAdmin). Sin este
// filtro, cualquier admin se promovía a sí mismo con un PUT.
const UNASSIGNABLE_ROLES = new Set(['superadmin']);

function rejectPrivilegedRole(role) {
  return role && UNASSIGNABLE_ROLES.has(String(role));
}

// POST /api/users — crear usuario (solo admin)
usersRouter.post('/', checkPerm('users.create'), async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;
    if (rejectPrivilegedRole(role)) {
      return res.status(403).json({ success: false, message: 'El rol superadmin solo se configura desde el entorno del servidor' });
    }
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Nombre, email y contraseña son requeridos' });
    }
    const check = validatePassword(password, { email, name });
    if (!check.ok) return res.status(400).json({ success: false, message: check.message });
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

    if (rejectPrivilegedRole(req.body.role)) {
      return res.status(403).json({ success: false, message: 'El rol superadmin solo se configura desde el entorno del servidor' });
    }
    // Tampoco se edita al superadmin desde el CRM, ni siquiera para desactivarlo.
    const target = await User.findById(req.params.id).select('role');
    if (target?.role === 'superadmin' && !isSelf) {
      return res.status(403).json({ success: false, message: 'La cuenta de superadmin no se administra desde el CRM' });
    }

    const allowed = isAdmin
      ? ['name', 'role', 'phone', 'isActive', 'notifications']
      : ['name', 'phone', 'notifications'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    // Degradar un rol debe cerrar las sesiones: si no, el usuario sigue
    // operando con su rol anterior hasta que expire el token.
    if (updates.role || updates.isActive === false) {
      updates.sessionsValidFrom = new Date();
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/users/:id/reset-password — admin resetea contraseña
usersRouter.put('/:id/reset-password', checkPerm('users.edit'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

    const { newPassword } = req.body;
    const check = validatePassword(newPassword, { email: user.email, name: user.name });
    if (!check.ok) return res.status(400).json({ success: false, message: check.message });
    user.password = newPassword;
    // Un reset hecho por el administrador implica que el usuario perdió el
    // control de la cuenta: las sesiones abiertas se cierran.
    user.sessionsValidFrom = new Date();
    await user.save();
    res.json({ success: true, message: 'Contraseña actualizada' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/users/:id — desactivar (solo admin, no puede desactivarse a sí mismo)
usersRouter.delete('/:id', checkPerm('users.delete'), async (req, res) => {
  try {
    const target = await User.findById(req.params.id).select('role');
    if (target?.role === 'superadmin') {
      return res.status(403).json({ success: false, message: 'La cuenta de superadmin no se administra desde el CRM' });
    }
    if (req.params.id === String(req.user._id)) {
      return res.status(400).json({ success: false, message: 'No puedes desactivar tu propia cuenta' });
    }
    // El middleware de auth ya rechaza a los usuarios inactivos, pero se
    // revocan las sesiones igual para cortar también las de socket abiertas.
    await User.findByIdAndUpdate(req.params.id, { isActive: false, sessionsValidFrom: new Date() });
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
    if (req.body.lead && req.body.type !== 'task') {
      await Lead.findByIdAndUpdate(req.body.lead, { lastContactDate: new Date() });
    }
    req.io?.emit('activity_new', { leadId: req.body.lead, activity });
    res.status(201).json({ success: true, data: activity });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/activities/mine?from=&to=&type= — all activities for calendar view
activitiesRouter.get('/mine', async (req, res) => {
  try {
    const { from, to, type } = req.query;
    const q = { user: req.user._id };
    if (type) q.type = type;
    if (from || to) {
      const dateFrom = from ? new Date(from) : null;
      const dateTo   = to   ? new Date(to)   : null;
      const dateRange = {};
      if (dateFrom) dateRange.$gte = dateFrom;
      if (dateTo)   dateRange.$lte = dateTo;
      // match if either createdAt OR taskData.dueDate falls in range
      q.$or = [
        { createdAt: dateRange },
        { 'taskData.dueDate': dateRange },
      ];
    }
    const activities = await Activity.find(q)
      .populate('lead', 'name company')
      .populate('user', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ success: true, data: activities });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/activities/team?from=&to=&type= — all activities (managers)
activitiesRouter.get('/team', async (req, res) => {
  try {
    const { from, to, type, userId } = req.query;
    const q = {};
    if (userId) q.user = userId;
    if (type) q.type = type;
    if (from || to) {
      const dateFrom = from ? new Date(from) : null;
      const dateTo   = to   ? new Date(to)   : null;
      const dateRange = {};
      if (dateFrom) dateRange.$gte = dateFrom;
      if (dateTo)   dateRange.$lte = dateTo;
      q.$or = [
        { createdAt: dateRange },
        { 'taskData.dueDate': dateRange },
      ];
    }
    const activities = await Activity.find(q)
      .populate('lead', 'name company')
      .populate('user', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(500);
    res.json({ success: true, data: activities });
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
const { cacheMiddleware: _cacheMw } = require('../middleware/cacheMiddleware');
const { TTL: _TTL, invalidateLead: _invLead } = require('../services/cache');
const _stages = require('../services/pipelineStages');
const PipelineStage = require('../models/PipelineStage');
const { checkPerm: _checkPerm } = require('../middleware/auth');

pipelineRouter.use(auth);

// Kanban: cache 30 seg por usuario (dato "vivo", se refresca con WS events)
pipelineRouter.get('/kanban',
  _checkPerm('pipeline.view'),
  _cacheMw(_TTL.HOT, req => `kanban:${req.user.id}:${req.user.role}`),
  async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.user.role === 'executive') filter.assignedTo = req.user._id;

    // Las etapas son configurables (colección PipelineStage), así que el
    // tablero se arma con las que haya en ese momento.
    const stageDocs = await _stages.getStages();
    const STAGES = stageDocs.map(s => s.key);
    const SELECT = { company:1, contact:1, stage:1, score:1, priority:1, value:1,
                     source:1, services:1, createdAt:1, lastContactDate:1,
                     daysSinceLastContact:1, assignedTo:1 };

    // Una sola query con $facet en lugar de 7 queries paralelas
    const [agg] = await Lead.aggregate([
      { $match: filter },
      { $sort: { score: -1, updatedAt: -1 } },
      { $facet: Object.fromEntries(
          STAGES.map(s => [s, [
            { $match: { stage: s } },
            { $limit: 20 },
            { $project: SELECT },
          ]])
        )
      },
    ]);

    // Populate assignedTo en memoria (evita N+1 de populate por stage)
    const allUserIds = new Set();
    for (const stage of STAGES) {
      for (const lead of agg[stage] || []) {
        if (lead.assignedTo) allUserIds.add(String(lead.assignedTo));
      }
    }
    const User = require('mongoose').model('User');
    const users = await User.find({ _id: { $in: [...allUserIds] } })
      .select('name avatar').lean();
    const userMap = Object.fromEntries(users.map(u => [String(u._id), u]));

    const result = {};
    for (const stage of STAGES) {
      result[stage] = (agg[stage] || []).map(lead => ({
        ...lead,
        assignedTo: lead.assignedTo ? (userMap[String(lead.assignedTo)] || lead.assignedTo) : null,
      }));
    }

    // Se devuelven también las etapas para que el tablero pinte columnas,
    // colores y orden sin una segunda petición.
    res.json({ success: true, data: result, stages: stageDocs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

pipelineRouter.put('/move', _checkPerm('pipeline.move'), async (req, res) => {
  try {
    const { leadId, newStage } = req.body;
    if (!(await _stages.exists(newStage))) {
      return res.status(400).json({ success: false, message: 'La etapa indicada no existe' });
    }
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead no encontrado' });
    const prevStage = lead.stage;

    await Lead.findByIdAndUpdate(leadId, { stage: newStage });
    await Activity.create({
      lead: leadId, user: req.user._id, type: 'stage_change',
      direction: 'internal', stageChange: { from: prevStage, to: newStage },
      content: `Etapa: ${prevStage} → ${newStage}`
    });

    _invLead(String(req.user._id), lead.assignedTo ? String(lead.assignedTo) : null);
    req.io?.emit('pipeline_updated', { leadId, stage: newStage });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── Etapas del pipeline ──────────────────────────────────────────────────────
// Verlas puede cualquiera (el tablero las necesita); editarlas requiere permiso.

pipelineRouter.get('/stages', _checkPerm('pipeline.view'), async (req, res) => {
  try {
    res.json({ success: true, data: await _stages.getStages() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Crea una etapa nueva al final del tablero.
pipelineRouter.post('/stages', _checkPerm('pipeline.stages'), async (req, res) => {
  try {
    const { label, color, description, emoji } = req.body;
    if (!String(label || '').trim()) {
      return res.status(400).json({ success: false, message: 'La etapa necesita un nombre' });
    }

    const existentes = await _stages.getStages();
    // Las etapas nuevas entran antes de las de cierre: el orden del tablero
    // cuenta una historia y "Ganado"/"Perdido" van siempre al final.
    const ultimaAbierta = existentes.filter(s => s.type === 'open').pop();
    const order = ultimaAbierta ? ultimaAbierta.order + 1 : existentes.length;

    const stage = await PipelineStage.create({
      key: await _stages.buildKey(label),
      label: String(label).trim(),
      color: color || '#6B7280',
      emoji: String(emoji || '').slice(0, 4),
      description,
      type: 'open',
      order,
    });

    // Se recolocan las de cierre para que sigan al final.
    await PipelineStage.updateMany(
      { type: { $in: ['won', 'lost'] } },
      { $inc: { order: 1 } }
    );
    _stages.invalidate();

    res.status(201).json({ success: true, data: stage, message: `Etapa "${stage.label}" creada` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Reordenar: llega la lista de ids en el orden deseado.
// OJO: declarada antes que /stages/:id — si no, Express manda "reorder" al
// parámetro :id y el cast a ObjectId revienta.
pipelineRouter.put('/stages/reorder', _checkPerm('pipeline.stages'), async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) {
      return res.status(400).json({ success: false, message: 'Se espera un arreglo de ids' });
    }
    await Promise.all(order.map((id, index) =>
      PipelineStage.findByIdAndUpdate(id, { order: index })
    ));
    _stages.invalidate();
    res.json({ success: true, data: await _stages.getStages(), message: 'Orden actualizado' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Renombrar, recolorear o describir. La clave y el tipo no se tocan: hay leads
// y lógica de negocio apuntando a ellos.
pipelineRouter.put('/stages/:id', _checkPerm('pipeline.stages'), async (req, res) => {
  try {
    const updates = {};
    for (const campo of ['label', 'color', 'description', 'emoji']) {
      if (req.body[campo] !== undefined) updates[campo] = req.body[campo];
    }
    const stage = await PipelineStage.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!stage) return res.status(404).json({ success: false, message: 'Etapa no encontrada' });

    _stages.invalidate();
    res.json({ success: true, data: stage, message: 'Etapa actualizada' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Eliminar. Si la etapa tiene leads hay que decir a cuál se mueven: perderlos
// en una etapa inexistente los sacaría del tablero.
pipelineRouter.delete('/stages/:id', _checkPerm('pipeline.stages'), async (req, res) => {
  try {
    const stage = await PipelineStage.findById(req.params.id);
    if (!stage) return res.status(404).json({ success: false, message: 'Etapa no encontrada' });
    if (stage.isSystem) {
      return res.status(400).json({
        success: false,
        message: `"${stage.label}" es una etapa del sistema y no se puede eliminar`,
      });
    }

    const enUso = await Lead.countDocuments({ stage: stage.key, isActive: true });
    const destino = req.body?.moveTo;

    if (enUso && !destino) {
      return res.status(400).json({
        success: false,
        needsTarget: true,
        count: enUso,
        message: `La etapa tiene ${enUso} lead(s). Indica a qué etapa moverlos.`,
      });
    }
    if (enUso) {
      if (!(await _stages.exists(destino)) || destino === stage.key) {
        return res.status(400).json({ success: false, message: 'Etapa destino inválida' });
      }
      await Lead.updateMany({ stage: stage.key }, { stage: destino });
    }

    await PipelineStage.deleteOne({ _id: stage._id });
    _stages.invalidate();

    res.json({
      success: true,
      message: enUso
        ? `Etapa eliminada y ${enUso} lead(s) movidos`
        : 'Etapa eliminada',
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
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
        connected: !!(  (process.env.WHATSAPP_TOKEN || process.env.META_WA_TOKEN) &&
                        (process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.META_WA_PHONE_ID)),
        provider: 'Meta WhatsApp Cloud API',
        phoneId: (process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.META_WA_PHONE_ID) ? '✅ Configurado' : '❌ No configurado'
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
        meta:     `${PUBLIC_BASE_URL}/api/webhooks/meta`,
        whatsapp: `${PUBLIC_BASE_URL}/api/whatsapp/webhook`,
        generic:  `${PUBLIC_BASE_URL}/api/webhooks/generic`,
        linkedin: `${PUBLIC_BASE_URL}/api/webhooks/linkedin`
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
