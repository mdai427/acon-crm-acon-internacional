const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const { auth, adminOnly } = require('../middleware/auth');
const { scoreLeadWithAI } = require('../services/aiAgent');

// Todos los endpoints requieren autenticación
router.use(auth);

// GET /api/leads — lista con filtros y paginacion
router.get('/', async (req, res) => {
  try {
    const {
      stage, source, priority, assignedTo, search,
      page = 1, limit = 25, sortBy = 'createdAt', sortDir = 'desc',
      minScore, maxScore, services, country
    } = req.query;

    const filter = { isActive: true };

    // Ejecutivos solo ven sus propios leads
    if (req.user.role === 'executive') {
      filter.assignedTo = req.user._id;
    } else if (assignedTo) {
      filter.assignedTo = assignedTo;
    }

    if (stage)    filter.stage = stage;
    if (source)   filter.source = source;
    if (priority) filter.priority = priority;
    if (country)  filter.country = new RegExp(country, 'i');
    if (services) filter.services = { $in: services.split(',') };
    if (minScore || maxScore) {
      filter.score = {};
      if (minScore) filter.score.$gte = Number(minScore);
      if (maxScore) filter.score.$lte = Number(maxScore);
    }
    if (search) {
      filter.$text = { $search: search };
    }

    const sort = { [sortBy]: sortDir === 'asc' ? 1 : -1 };
    const skip = (Number(page) - 1) * Number(limit);

    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .populate('assignedTo', 'name email avatar')
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),
      Lead.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: leads,
      pagination: {
        total, page: Number(page),
        pages: Math.ceil(total / Number(limit)),
        limit: Number(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/leads/pipeline — conteo por etapa
router.get('/pipeline', async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.user.role === 'executive') filter.assignedTo = req.user._id;

    const pipeline = await Lead.aggregate([
      { $match: filter },
      { $group: {
        _id: '$stage',
        count: { $sum: 1 },
        totalValue: { $sum: '$value' },
        avgScore: { $avg: '$score' }
      }}
    ]);

    const stages = ['new','contacted','qualified','proposal','negotiation','closed_won','closed_lost'];
    const result = stages.map(stage => {
      const found = pipeline.find(p => p._id === stage) || {};
      return {
        stage,
        count: found.count || 0,
        totalValue: found.totalValue || 0,
        avgScore: Math.round(found.avgScore || 0)
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/leads/:id
router.get('/:id', async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('assignedTo', 'name email avatar phone');

    if (!lead) return res.status(404).json({ success: false, message: 'Lead no encontrado' });
    
    // Ejecutivo solo puede ver sus propios leads
    if (req.user.role === 'executive' && 
        lead.assignedTo?._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Acceso denegado' });
    }

    // Actividades del lead
    const activities = await Activity.find({ lead: lead._id })
      .populate('user', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ success: true, data: lead, activities });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/leads
router.post('/', async (req, res) => {
  try {
    const leadData = {
      ...req.body,
      assignedTo: req.body.assignedTo || req.user._id,
      assignedAt: new Date()
    };

    const lead = await Lead.create(leadData);

    // Score automático con IA (async, no bloquea)
    scoreLeadWithAI(lead._id).catch(console.error);

    // Actividad inicial
    await Activity.create({
      lead: lead._id,
      user: req.user._id,
      type: 'note',
      direction: 'internal',
      content: `Lead creado desde ${lead.source}`,
      isAuto: false
    });

    // Notificar via socket al ejecutivo asignado
    req.io?.to(`user_${leadData.assignedTo}`).emit('new_lead', lead);

    res.status(201).json({ success: true, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/leads/:id
router.put('/:id', async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead no encontrado' });

    const prevStage = lead.stage;
    const updates = req.body;

    // Si cambia de etapa, registrar actividad y re-scorear
    if (updates.stage && updates.stage !== prevStage) {
      await Activity.create({
        lead: lead._id,
        user: req.user._id,
        type: 'stage_change',
        direction: 'internal',
        stageChange: { from: prevStage, to: updates.stage },
        content: `Etapa cambiada: ${prevStage} → ${updates.stage}`
      });
      // Re-score cuando cambia de etapa (fire-and-forget)
      setImmediate(() => {
        scoreLeadWithAI(req.params.id).catch(e => console.error(`Score error ${req.params.id}:`, e.message));
      });
    }

    const updated = await Lead.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('assignedTo', 'name email avatar');

    req.io?.emit('lead_updated', updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/leads/:id (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    await Lead.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Lead archivado' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/leads/rescore-all — rescora todos los leads con score=0 (admin)
router.post('/rescore-all', adminOnly, async (req, res) => {
  try {
    const leads = await Lead.find({ isActive: true, score: 0 }).select('_id');
    res.json({ success: true, message: `Rescoring ${leads.length} leads en segundo plano...`, count: leads.length });

    // Ejecutar en background sin bloquear respuesta
    (async () => {
      let ok = 0, fail = 0;
      for (const l of leads) {
        try {
          await scoreLeadWithAI(l._id);
          ok++;
        } catch (e) {
          console.error(`Rescore failed for ${l._id}:`, e.message);
          fail++;
        }
        await new Promise(r => setTimeout(r, 200)); // Throttle
      }
      console.log(`✅ Rescore completo: ${ok} ok, ${fail} errores`);
    })().catch(console.error);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/leads/:id/assign
router.post('/:id/assign', auth, async (req, res) => {
  try {
    const { userId } = req.body;
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { assignedTo: userId, assignedAt: new Date() },
      { new: true }
    ).populate('assignedTo', 'name email');

    await Activity.create({
      lead: lead._id,
      user: req.user._id,
      type: 'system',
      direction: 'internal',
      content: `Lead reasignado a ${lead.assignedTo.name}`
    });

    req.io?.to(`user_${userId}`).emit('lead_assigned', lead);
    res.json({ success: true, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
