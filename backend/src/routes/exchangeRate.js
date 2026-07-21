const express = require('express');
const router = express.Router();
const { auth, adminOnly } = require('../middleware/auth');
const { fetchAndSaveRate, getCurrentRate, setManualRate, getRateHistory } = require('../services/dofService');

router.use(auth);

// GET /api/exchange-rate/current — tipo de cambio vigente
router.get('/current', async (req, res) => {
  try {
    const data = await getCurrentRate();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/exchange-rate/refresh — forzar actualización desde DOF (admin)
router.post('/refresh', adminOnly, async (req, res) => {
  try {
    const data = await fetchAndSaveRate();
    res.json({ success: true, data, message: 'Tipo de cambio actualizado desde DOF' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/exchange-rate/manual — establecer tipo de cambio manual (admin)
router.put('/manual', adminOnly, async (req, res) => {
  try {
    const { rate } = req.body;
    const val = parseFloat(rate);
    if (!val || val < 1 || val > 500) {
      return res.status(400).json({ success: false, message: 'Tipo de cambio inválido' });
    }
    const data = await setManualRate(val, req.user._id);
    res.json({ success: true, data, message: `Tipo de cambio manual establecido: $${val} MXN/USD` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/exchange-rate/history — historial (últimos 30 días)
router.get('/history', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const data = await getRateHistory(Math.min(Number(days), 90));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
