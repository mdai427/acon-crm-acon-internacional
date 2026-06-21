// ============================================
// Option C — Playbooks por etapa
// GET  /api/playbooks              — list all
// PUT  /api/playbooks/:stage       — update/create playbook for a stage
// POST /api/playbooks/seed         — seed defaults
// ============================================
const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Playbook = require('../models/Playbook');
const { DEFAULT_PLAYBOOKS } = require('../services/aiTasks');

router.use(auth);

// GET /api/playbooks
router.get('/', async (req, res) => {
  try {
    const playbooks = await Playbook.find().sort({ stage: 1 }).lean();
    // Merge with defaults to always return all 7 stages
    const STAGES = ['new','contacted','qualified','proposal','negotiation','closed_won','closed_lost'];
    const map = Object.fromEntries(playbooks.map(p => [p.stage, p]));
    const result = STAGES.map(stage => map[stage] || {
      stage,
      isActive: true,
      useAI: true,
      tasks: DEFAULT_PLAYBOOKS[stage].map((title, i) => ({ title, dueInDays: (i + 1) * 2, order: i })),
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/playbooks/:stage
router.put('/:stage', async (req, res) => {
  try {
    const { tasks, isActive, useAI } = req.body;
    const playbook = await Playbook.findOneAndUpdate(
      { stage: req.params.stage },
      { tasks, isActive, useAI, updatedBy: req.user._id },
      { new: true, upsert: true, runValidators: true }
    );
    res.json({ success: true, data: playbook });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/playbooks/seed — seed all stages with defaults
router.post('/seed', async (req, res) => {
  try {
    const STAGES = ['new','contacted','qualified','proposal','negotiation','closed_won','closed_lost'];
    const results = [];
    for (const stage of STAGES) {
      const tasks = DEFAULT_PLAYBOOKS[stage].map((title, i) => ({ title, dueInDays: (i + 1) * 2, order: i }));
      const pb = await Playbook.findOneAndUpdate(
        { stage },
        { tasks, isActive: true, useAI: true, updatedBy: req.user._id },
        { new: true, upsert: true }
      );
      results.push(pb);
    }
    res.json({ success: true, data: results, message: `${results.length} playbooks inicializados` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
