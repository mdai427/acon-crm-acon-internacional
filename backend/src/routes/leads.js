const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const { auth, adminOnly } = require('../middleware/auth');
const { audit } = require('../services/auditService');
const { scoreLeadWithAI } = require('../services/aiAgent');
const { invalidateLead } = require('../services/cache');
const { enqueue } = require('../services/jobQueue');
const { generateStageTasks, DEFAULT_PLAYBOOKS } = require('../services/aiTasks');
const Playbook = require('../models/Playbook');
const User = require('../models/User');
const { notifyLeadAssigned } = require('../services/notificationService');

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
    if (country) {
      const escapedCountry = country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.country = new RegExp(escapedCountry, 'i');
    }
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

    // Notificación email + WhatsApp si fue asignado a alguien distinto al creador
    if (assignedTo && String(assignedTo) !== String(req.user._id)) {
      const assignee = await User.findById(assignedTo).select('name email phone').lean();
      if (assignee) {
        notifyLeadAssigned({ lead, assignee, io: req.io }).catch(() => {});
      }
    }

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

    // Audit log
    const TRACKED = ['stage', 'value', 'priority', 'assignedTo', 'notes', 'isActive'];
    const before = {};
    const after  = {};
    for (const key of TRACKED) {
      if (key in updates) {
        before[key] = lead[key];
        after[key]  = updated[key];
      }
    }
    audit({ req, action: 'update', entity: 'Lead', entityId: lead._id, entityLabel: lead.company, before, after }).catch(() => {});

    // Notify new assignee if assignedTo changed
    if (updates.assignedTo && String(updates.assignedTo) !== String(lead.assignedTo)) {
      const assignee = await User.findById(updates.assignedTo).select('name email phone').lean();
      if (assignee && String(updates.assignedTo) !== String(req.user._id)) {
        notifyLeadAssigned({ lead: updated, assignee, io: req.io }).catch(() => {});
      }
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
    const lead = await Lead.findById(req.params.id).select('company').lean();
    await Lead.findByIdAndUpdate(req.params.id, { isActive: false });
    audit({ req, action: 'delete', entity: 'Lead', entityId: req.params.id, entityLabel: lead?.company }).catch(() => {});
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

// ── File attachments (S3 + local fallback) ──────────────────────
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { USE_S3, uploadBuffer, getPresignedUrl, deleteObject } = require('../services/s3Service');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/leads');
if (!USE_S3 && !fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_TYPES = [
  'application/pdf','image/jpeg','image/png','image/gif',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain','text/csv',
];

// Always use memory storage — we either upload to S3 or write to disk manually
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de archivo no permitido'));
  },
});

// POST /api/leads/:id/attachments
router.post('/:id/attachments', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No se recibió archivo' });
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead no encontrado' });

    const safe = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${Date.now()}-${safe}`;
    let s3Key = null;

    if (USE_S3) {
      s3Key = `leads/${req.params.id}/${filename}`;
      await uploadBuffer(req.file.buffer, s3Key, req.file.mimetype);
    } else {
      // Fallback: write to local disk
      if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);
    }

    const att = {
      filename:     s3Key || filename,   // S3 key or local filename
      originalName: req.file.originalname,
      mimetype:     req.file.mimetype,
      size:         req.file.size,
      s3:           USE_S3,
      uploadedBy:   req.user._id,
      uploadedAt:   new Date(),
    };
    lead.attachments.push(att);
    await lead.save();

    await Activity.create({
      lead: lead._id, user: req.user._id,
      type: 'document', direction: 'internal',
      content: `Archivo adjunto: ${req.file.originalname}`,
      metadata: { filename: att.filename, originalName: req.file.originalname, size: req.file.size },
    });

    res.json({ success: true, data: att });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// DELETE /api/leads/:id/attachments/:attId
router.delete('/:id/attachments/:attId', async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead no encontrado' });
    const att = lead.attachments.id(req.params.attId);
    if (!att) return res.status(404).json({ success: false, message: 'Archivo no encontrado' });

    if (att.s3) {
      await deleteObject(att.filename).catch(() => {});
    } else {
      const filePath = path.join(UPLOAD_DIR, att.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    att.deleteOne();
    await lead.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/leads/:id/attachments/:attId/download
// Returns presigned URL (S3) or streams file (local)
router.get('/:id/attachments/:attId/download', async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id).lean();
    if (!lead) return res.status(404).json({ success: false });
    const att = lead.attachments.find(a => a._id.toString() === req.params.attId);
    if (!att) return res.status(404).json({ success: false });

    if (att.s3) {
      const url = await getPresignedUrl(att.filename, 900); // 15 min
      return res.json({ success: true, url, originalName: att.originalName });
    }

    const filePath = path.join(UPLOAD_DIR, att.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Archivo no encontrado en disco' });
    res.download(filePath, att.originalName);
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
