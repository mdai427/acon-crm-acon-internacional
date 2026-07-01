const express = require('express');
const router  = express.Router();
const Commission = require('../models/Commission');
const { auth, adminOnly } = require('../middleware/auth');

router.use(auth);

// ── GET /api/commissions — lista con filtros ──────────────────
router.get('/', async (req, res) => {
  try {
    const { period, status, userId } = req.query;
    const filter = {};

    // Ejecutivos solo ven las suyas; admins ven todas
    if (req.user.role !== 'admin') {
      filter.user = req.user._id;
    } else if (userId) {
      filter.user = userId;
    }

    if (period) filter.period = period;
    if (status) filter.status = status;

    const commissions = await Commission.find(filter)
      .populate('user', 'name email')
      .populate('lead', 'company stage')
      .sort({ dealDate: -1 })
      .limit(200);

    // Totales
    const totals = commissions.reduce((acc, c) => {
      acc.dealValue    += c.dealValue    || 0;
      acc.profitValue  += c.profitValue  || 0;
      acc.commissionAmt+= c.commissionAmt|| 0;
      if (c.status === 'paid')    acc.paid    += c.commissionAmt || 0;
      if (c.status === 'pending') acc.pending += c.commissionAmt || 0;
      return acc;
    }, { dealValue: 0, profitValue: 0, commissionAmt: 0, paid: 0, pending: 0 });

    res.json({ success: true, data: commissions, totals });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/commissions/summary — resumen por ejecutivo ──────
router.get('/summary', async (req, res) => {
  try {
    const { period } = req.query;
    const match = {};
    if (period) match.period = period;
    if (req.user.role !== 'admin') match.user = req.user._id;

    const summary = await Commission.aggregate([
      { $match: match },
      {
        $group: {
          _id: { user: '$user', period: '$period' },
          totalDeal:       { $sum: '$dealValue' },
          totalProfit:     { $sum: '$profitValue' },
          totalCommission: { $sum: '$commissionAmt' },
          paidCommission:  { $sum: { $cond: [{ $eq: ['$status','paid'] }, '$commissionAmt', 0] } },
          pendingCommission:{ $sum: { $cond: [{ $eq: ['$status','pending'] }, '$commissionAmt', 0] } },
          count:           { $sum: 1 },
        },
      },
      { $sort: { totalCommission: -1 } },
    ]);

    // Poblar usuarios
    const User = require('../models/User');
    const populated = await Promise.all(summary.map(async s => {
      const user = await User.findById(s._id.user).select('name email');
      return { ...s, user };
    }));

    res.json({ success: true, data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Defaults globales del sistema (fallback cuando el ejecutivo no tiene regla propia)
const DEFAULT_RATES = {
  maritimo_import:    5,
  maritimo_export:    5,
  aereo_import:       6,
  aereo_export:       6,
  terrestre_usa:      4,
  terrestre_nacional: 4,
  despacho_aduanal:   8,
  almacenaje:         6,
  seguro_carga:       10,
  otro:               5,
};

// ── GET /api/commissions/config — defaults globales por servicio ──
router.get('/config', async (req, res) => {
  res.json({ success: true, data: DEFAULT_RATES });
});

// ── GET /api/commissions/rules/:userId — reglas del ejecutivo ──
router.get('/rules/:userId', async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.params.userId).select('name email commissionRules');
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    res.json({ success: true, data: { user, defaults: DEFAULT_RATES } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/commissions/rules/:userId — guardar reglas del ejecutivo (admin) ──
router.put('/rules/:userId', adminOnly, async (req, res) => {
  try {
    const User = require('../models/User');
    const { commissionRules } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { commissionRules },
      { new: true }
    ).select('name email commissionRules');
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── GET /api/commissions/rules-resolved/:userId — reglas efectivas (propias + defaults) ──
// Devuelve para cada leadType+serviceType el % que aplica: el del ejecutivo si existe, o el default
router.get('/rules-resolved/:userId', async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.params.userId).select('commissionRules');
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

    const leadTypes = ['campaign', 'direct', 'referral'];
    const services  = Object.keys(DEFAULT_RATES);
    const resolved  = {};

    for (const lt of leadTypes) {
      resolved[lt] = {};
      for (const svc of services) {
        const custom = user.commissionRules?.[lt]?.[svc];
        resolved[lt][svc] = custom != null ? custom : DEFAULT_RATES[svc];
      }
    }

    res.json({ success: true, data: resolved });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/commissions — crear comisión ────────────────────
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    // Si no se indica usuario, usar el actual
    if (!data.user) data.user = req.user._id;
    // Solo admin puede crear para otros
    if (req.user.role !== 'admin') data.user = req.user._id;

    const commission = await Commission.create(data);
    await commission.populate('user', 'name email');
    await commission.populate('lead', 'company');

    res.status(201).json({ success: true, data: commission });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── PUT /api/commissions/:id — actualizar estado ──────────────
router.put('/:id', async (req, res) => {
  try {
    const { status, notes } = req.body;
    const update = { notes };

    if (status) {
      update.status = status;
      if (status === 'paid') {
        update.paidAt = new Date();
        update.paidBy = req.user._id;
      }
    }

    const commission = await Commission.findByIdAndUpdate(
      req.params.id, update, { new: true }
    ).populate('user', 'name email').populate('lead', 'company');

    if (!commission) return res.status(404).json({ success: false, message: 'No encontrado' });
    res.json({ success: true, data: commission });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/commissions/:id ───────────────────────────────
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    await Commission.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
