const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const { auth, adminOnly } = require('../middleware/auth');
const { scoreLeadWithAI } = require('../services/aiAgent');
const { invalidateLead } = require('../services/cache');
const { enqueue } = require('../services/jobQueue');
const { generateStageTasks, DEFAULT_PLAYBOOKS } = require('../services/aiTasks');
const Playbook = require('../models/Playbook');

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

    const safeLimit = Math.min(Number(limit) || 25, 100); // máximo 100 por página
    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .populate('assignedTo', 'name email avatar')
        .sort(sort)
        .skip(skip)
        .limit(safeLimit)
        .lean(),
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
      .limit(50)
      .lean();

    res.json({ success: true, data: lead, activities });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/leads
router.post('/', async (req, res) => {
  try {
    const { autoAssignLead } = require('../services/leadAssignment');
    const { researchCompany } = require('../services/companyResearch');

    // Auto-asignar si no se especifica ejecutivo
    let assignedTo = req.body.assignedTo || req.user._id;
    if (!req.body.assignedTo) {
      const bestExec = await autoAssignLead({ services: req.body.services });
      if (bestExec) assignedTo = bestExec._id;
    }

    const leadData = {
      ...req.body,
      assignedTo,
      assignedAt: new Date()
    };

    const lead = await Lead.create(leadData);

    // Score automático con IA (async, no bloquea)
    scoreLeadWithAI(lead._id).catch(console.error);

    // Investigación de empresa con IA (async, no bloquea)
    researchCompany(lead).then(async (research) => {
      await Lead.findByIdAndUpdate(lead._id, { aiResearch: research });
    }).catch(console.error);

    // Actividad inicial
    await Activity.create({
      lead: lead._id,
      user: req.user._id,
      type: 'note',
      direction: 'internal',
      content: `Lead creado desde ${lead.source}`,
      isAuto: false
    });

    // Si fue auto-asignado, registrar en timeline
    if (!req.body.assignedTo && String(assignedTo) !== String(req.user._id)) {
      await Activity.create({
        lead: lead._id,
        user: assignedTo,
        type: 'note',
        direction: 'internal',
        isAuto: true,
        subject: '🤖 Lead asignado automáticamente',
        content: `Lead asignado automáticamente al ejecutivo con menor carga de trabajo.`,
      });
    }

    // Notificar via socket al ejecutivo asignado
    req.io?.to(`user_${assignedTo}`).emit('new_lead', lead);
    invalidateLead(String(req.user._id), assignedTo ? String(assignedTo) : null);
    res.status(201).json({ success: true, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/leads/:id/research — investigación manual de empresa
router.post('/:id/research', async (req, res) => {
  try {
    const { researchCompany } = require('../services/companyResearch');
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead no encontrado' });

    const research = await researchCompany(lead);
    await Lead.findByIdAndUpdate(lead._id, { aiResearch: research });

    res.json({ success: true, data: research });
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

    // Si cambia de etapa: registrar actividad + generar tareas IA en background
    const stageChanged = updates.stage && updates.stage !== prevStage;
    if (stageChanged) {
      await Activity.create({
        lead: lead._id,
        user: req.user._id,
        type: 'stage_change',
        direction: 'internal',
        stageChange: { from: prevStage, to: updates.stage },
        content: `Etapa cambiada: ${prevStage} → ${updates.stage}`,
      });
    }

    const updated = await Lead.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('assignedTo', 'name email avatar');

    // Option B: auto-create AI tasks on stage change (background, no blocking)
    if (stageChanged) {
      setImmediate(async () => {
        try {
          const newStage = updates.stage;
          // Check if playbook exists for this stage
          const playbook = await Playbook.findOne({ stage: newStage, isActive: true });
          let tasks;
          if (playbook && !playbook.useAI && playbook.tasks?.length) {
            // Option C: use fixed playbook tasks
            tasks = playbook.tasks.map(t => ({ title: t.title, dueInDays: t.dueInDays }));
          } else {
            // Option B: generate with AI (falls back to defaults if no API key)
            tasks = await generateStageTasks(updated, newStage);
          }
          // Create task activities
          const now = new Date();
          for (const task of tasks) {
            const dueDate = new Date(now.getTime() + (task.dueInDays || 2) * 86400000);
            await Activity.create({
              lead: lead._id,
              user: req.user._id,
              type: 'task',
              direction: 'internal',
              content: task.title,
              isAuto: true,
              taskData: {
                completed: false,
                dueDate,
                priority: 'medium',
              },
            });
          }
        } catch (e) {
          console.error('[AutoTasks] Error generando tareas:', e.message);
        }
      });
    }

    req.io?.emit('lead_updated', updated);
    invalidateLead(String(req.user._id), updated.assignedTo ? String(updated.assignedTo._id || updated.assignedTo) : null);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/leads/:id (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    await Lead.findByIdAndUpdate(req.params.id, { isActive: false });
    invalidateLead(String(req.user._id));
    res.json({ success: true, message: 'Lead archivado' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/leads/rescore-all — encola rescoring en background (admin)
router.post('/rescore-all', adminOnly, async (req, res) => {
  try {
    const job = await enqueue('lead_rescore_all', {}, req.user._id);
    res.status(202).json({ success: true, message: 'Rescoring encolado en background', data: { jobId: job._id } });
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

// POST /api/leads/import — bulk import (async, returns jobId)
router.post('/import', async (req, res) => {
  try {
    const { leads: rows } = req.body;
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ success: false, message: 'No hay filas para importar' });
    }
    const job = await enqueue('leads_import', { rows, userId: req.user._id }, req.user._id);
    invalidateLead(String(req.user._id));
    res.status(202).json({ success: true, message: `Importando ${rows.length} leads en background`, data: { jobId: job._id, total: rows.length } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/leads/:id/stage-suggestions — Option A: get AI task suggestions for current stage
router.get('/:id/stage-suggestions', async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead no encontrado' });

    const stage = req.query.stage || lead.stage;
    // Check for fixed playbook first
    const playbook = await Playbook.findOne({ stage, isActive: true });
    let tasks;
    if (playbook && !playbook.useAI && playbook.tasks?.length) {
      tasks = playbook.tasks.map(t => ({ title: t.title, dueInDays: t.dueInDays }));
    } else {
      tasks = await generateStageTasks(lead, stage);
    }
    res.json({ success: true, data: { tasks, stage, source: (playbook && !playbook.useAI) ? 'playbook' : 'ai' } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/leads/:id/create-stage-tasks — manually trigger task creation for current stage
router.post('/:id/create-stage-tasks', async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead no encontrado' });

    const stage = req.body.stage || lead.stage;
    const playbook = await Playbook.findOne({ stage, isActive: true });
    let tasks;
    if (playbook && !playbook.useAI && playbook.tasks?.length) {
      tasks = playbook.tasks.map(t => ({ title: t.title, dueInDays: t.dueInDays }));
    } else {
      tasks = await generateStageTasks(lead, stage);
    }

    const now = new Date();
    const created = [];
    for (const task of tasks) {
      const dueDate = new Date(now.getTime() + (task.dueInDays || 2) * 86400000);
      const act = await Activity.create({
        lead: lead._id,
        user: req.user._id,
        type: 'task',
        direction: 'internal',
        content: task.title,
        isAuto: true,
        taskData: { completed: false, dueDate, priority: 'medium' },
      });
      created.push(act);
    }
    res.json({ success: true, data: { created: created.length, tasks: created } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
