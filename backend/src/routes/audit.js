const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const { auth } = require('../middleware/auth');

// Only admin/direccion/gerencia can view audit logs
router.use(auth, (req, res, next) => {
  if (!['admin', 'direccion', 'gerencia'].includes(req.user?.role)) {
    return res.status(403).json({ success: false, message: 'Acceso denegado' });
  }
  next();
});

// GET /api/audit
router.get('/', async (req, res) => {
  try {
    const { entity, action, userId, from, to, search, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (entity) filter.entity = entity;
    if (action) filter.action = action;
    if (userId) filter.user = userId;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to);
    }
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'i');
      filter.$or = [{ userName: rx }, { entityLabel: rx }, { 'changes.field': rx }];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('user', 'name role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ success: true, data: logs, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/audit/entities — distinct entity types
router.get('/entities', async (req, res) => {
  try {
    const entities = await AuditLog.distinct('entity');
    res.json({ success: true, data: entities });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/audit/record/:entityId — audit trail for a specific record
router.get('/record/:entityId', async (req, res) => {
  try {
    const logs = await AuditLog.find({ entityId: req.params.entityId })
      .populate('user', 'name role')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ success: true, data: logs });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
