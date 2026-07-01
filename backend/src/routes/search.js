const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Operation = require('../models/Operation');
const Quote = require('../models/Quote');
const { auth } = require('../middleware/auth');

router.use(auth);

// GET /api/search?q=...
router.get('/', async (req, res) => {
  try {
    const { q = '' } = req.query;
    if (q.trim().length < 2) return res.json({ success: true, data: { leads: [], operations: [], quotes: [] } });

    const regex = new RegExp(q.trim(), 'i');
    const baseLeadFilter = { isActive: true };
    if (req.user.role === 'executive') baseLeadFilter.assignedTo = req.user._id;

    const [leads, operations, quotes] = await Promise.all([
      Lead.find({
        ...baseLeadFilter,
        $or: [{ company: regex }, { contact: regex }, { email: regex }, { phone: regex }]
      })
        .limit(6)
        .select('company contact stage score value email')
        .populate('assignedTo', 'name')
        .lean(),

      Operation.find({
        $or: [{ clientName: regex }, { bookingNumber: regex }, { blAwbCartaPorte: regex }]
      })
        .limit(4)
        .select('clientName bookingNumber status serviceType')
        .lean(),

      Quote.find({
        $or: [{ clientName: regex }, { folio: regex }]
      })
        .limit(4)
        .select('clientName folio status totalUSD serviceType')
        .lean(),
    ]);

    res.json({ success: true, data: { leads, operations, quotes } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
