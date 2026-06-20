// ============================================
// GET  /api/jobs/:id        — poll job status
// GET  /api/jobs            — recent jobs for user
// ============================================
const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { getJob, getRecentJobs } = require('../services/jobQueue');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const jobs = await getRecentJobs(req.user._id, 30);
    res.json({ success: true, data: jobs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const job = await getJob(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job no encontrado' });
    res.json({ success: true, data: job });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
