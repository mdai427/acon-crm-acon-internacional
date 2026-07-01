const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Quote = require('../models/Quote');
const Activity = require('../models/Activity');
const { auth } = require('../middleware/auth');

router.use(auth);

// GET /api/notifications — centro de notificaciones
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const base = { isActive: true };
    if (req.user.role === 'executive') base.assignedTo = req.user._id;

    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);

    const [
      overdueFollowUps,
      noContactLeads,
      overdueQuotes,
      pendingTasks,
    ] = await Promise.all([
      // Seguimientos vencidos
      Lead.find({
        ...base,
        nextFollowUpDate: { $lt: now },
        stage: { $nin: ['closed_won', 'closed_lost'] }
      }).select('company contact nextFollowUpDate stage score').limit(15).lean(),

      // Leads sin contacto en 7+ días (activos)
      Lead.find({
        ...base,
        stage: { $nin: ['closed_won', 'closed_lost'] },
        $or: [
          { lastContactDate: { $lt: sevenDaysAgo } },
          { lastContactDate: { $exists: false } }
        ]
      }).select('company contact lastContactDate stage score').limit(15).lean(),

      // Cotizaciones vencidas
      Quote.find({
        validUntil: { $lt: now },
        status: { $in: ['sent', 'draft'] }
      }).select('folio clientName validUntil totalUSD status').limit(10).lean(),

      // Tareas pendientes vencidas
      Activity.find({
        type: 'task',
        'taskData.completed': false,
        'taskData.dueDate': { $lt: now },
        ...(req.user.role === 'executive' ? { user: req.user._id } : {})
      }).select('lead subject taskData createdAt').populate('lead', 'company').limit(10).lean(),
    ]);

    const total = overdueFollowUps.length + noContactLeads.length +
                  overdueQuotes.length + pendingTasks.length;

    res.json({
      success: true,
      data: {
        total,
        overdueFollowUps,
        noContactLeads,
        overdueQuotes,
        pendingTasks,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
