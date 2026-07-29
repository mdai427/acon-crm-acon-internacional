// ============================================
// Panel de super admin — reventa de IA
// ============================================
// Solo el dueño de la plataforma: ve el costo real del proveedor, define el
// margen de reventa y cierra los periodos que se le facturan al CRM.
const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { superAdminOnly } = require('../services/superAdmin');
const AiUsage = require('../models/AiUsage');
const User = require('../models/User');
const aiBilling = require('../services/aiBilling');
const { labelFor } = require('./aiUsage');

router.use(auth, superAdminOnly);

// ─────────────────────────────────────────
// GET /api/superadmin/overview — métricas del periodo y acumulado
// ─────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const period = req.query.period || aiBilling.periodOf();
    const [current, config, allTime, byModel, byUser] = await Promise.all([
      aiBilling.getPeriod(period),
      aiBilling.getConfig(),
      AiUsage.aggregate([
        { $match: { status: 'ok' } },
        { $group: { _id: null, calls: { $sum: 1 }, costUsd: { $sum: '$costUsd' }, priceUsd: { $sum: '$priceUsd' } } },
      ]),
      AiUsage.aggregate([
        { $match: { period, status: 'ok' } },
        { $group: { _id: '$model', calls: { $sum: 1 }, costUsd: { $sum: '$costUsd' }, priceUsd: { $sum: '$priceUsd' } } },
        { $sort: { costUsd: -1 } },
      ]),
      AiUsage.aggregate([
        { $match: { period, status: 'ok', user: { $ne: null } } },
        { $group: { _id: '$user', calls: { $sum: 1 }, costUsd: { $sum: '$costUsd' }, priceUsd: { $sum: '$priceUsd' } } },
        { $sort: { priceUsd: -1 } },
        { $limit: 20 },
      ]),
    ]);

    const users = await User.find({ _id: { $in: byUser.map(u => u._id) } }).select('name email').lean();
    const userById = Object.fromEntries(users.map(u => [String(u._id), u]));

    const total = allTime[0] || { calls: 0, costUsd: 0, priceUsd: 0 };
    const errors = await AiUsage.countDocuments({ period, status: 'error' });

    res.json({
      success: true,
      data: {
        period: current.period,
        status: current.status,
        closedAt: current.closedAt || null,
        defaultMarginPct: config.defaultMarginPct,
        totals: current.totals,
        byFeature: (current.byFeature || []).map(f => ({
          ...f,
          featureLabel: labelFor(f.feature),
          marginUsd: aiBilling.round6(f.priceUsd - f.costUsd),
        })),
        byModel: byModel.map(m => ({
          model: m._id,
          calls: m.calls,
          costUsd: aiBilling.round6(m.costUsd),
          priceUsd: aiBilling.round6(m.priceUsd),
          marginUsd: aiBilling.round6(m.priceUsd - m.costUsd),
        })),
        byUser: byUser.map(u => ({
          user: userById[String(u._id)] || { name: 'Usuario eliminado' },
          calls: u.calls,
          costUsd: aiBilling.round6(u.costUsd),
          priceUsd: aiBilling.round6(u.priceUsd),
        })),
        allTime: {
          calls: total.calls,
          costUsd: aiBilling.round6(total.costUsd),
          priceUsd: aiBilling.round6(total.priceUsd),
          marginUsd: aiBilling.round6(total.priceUsd - total.costUsd),
        },
        errors,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────
// GET /api/superadmin/usage — detalle con costo real
// ─────────────────────────────────────────
router.get('/usage', async (req, res) => {
  try {
    const period = req.query.period || aiBilling.periodOf();
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const filter = { period };
    if (req.query.feature) filter.feature = req.query.feature;
    if (req.query.status) filter.status = req.query.status;

    const [items, total] = await Promise.all([
      AiUsage.find(filter)
        .populate('user', 'name email')
        .populate('lead', 'company')
        .sort({ createdAt: -1 })
        .skip(skip).limit(limit).lean(),
      AiUsage.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items.map(u => ({ ...u, featureLabel: labelFor(u.feature) })),
      meta: { total, limit, skip },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────
// GET/PUT /api/superadmin/pricing — tarifas y margen de reventa
// ─────────────────────────────────────────
router.get('/pricing', async (req, res) => {
  try {
    const config = await aiBilling.getConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/pricing', async (req, res) => {
  try {
    const config = await aiBilling.updateConfig(req.body, req.user._id);
    res.json({ success: true, data: config, message: 'Tarifas actualizadas' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────
// Periodos de facturación
// ─────────────────────────────────────────
router.get('/periods', async (req, res) => {
  try {
    res.json({ success: true, data: await aiBilling.listPeriods() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/periods/:period/close', async (req, res) => {
  try {
    const closed = await aiBilling.closePeriod(req.params.period, req.user._id, req.body?.note);
    res.json({ success: true, data: closed, message: `Periodo ${req.params.period} cerrado` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/periods/:period/reopen', async (req, res) => {
  try {
    const reopened = await aiBilling.reopenPeriod(req.params.period);
    res.json({ success: true, data: reopened, message: `Periodo ${req.params.period} reabierto` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
