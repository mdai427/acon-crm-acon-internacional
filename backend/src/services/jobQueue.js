// ============================================
// ACON CRM — In-Process Job Queue
// Zero external dependencies (no Redis/Bull)
// Persists job status in MongoDB via JobModel
// ============================================
const mongoose = require('mongoose');

// ── Job Schema ──────────────────────────────────────────────────────
const jobSchema = new mongoose.Schema({
  type:      { type: String, required: true, index: true },
  status:    { type: String, enum: ['pending','running','done','failed'], default: 'pending', index: true },
  payload:   { type: mongoose.Schema.Types.Mixed },
  result:    { type: mongoose.Schema.Types.Mixed },
  error:     String,
  progress:  { type: Number, default: 0 },   // 0-100
  total:     { type: Number, default: 0 },
  startedAt: Date,
  doneAt:    Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Auto-cleanup jobs older than 24h
jobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

const Job = mongoose.models.Job || mongoose.model('Job', jobSchema);

// ── In-memory queue (survives only within process) ─────────────────
const queue = [];
let running = false;

// ── Handlers registry ──────────────────────────────────────────────
const handlers = {};

function register(type, fn) {
  handlers[type] = fn;
}

// ── Enqueue ────────────────────────────────────────────────────────
async function enqueue(type, payload, userId) {
  const job = await Job.create({ type, payload, createdBy: userId });
  queue.push(job._id.toString());
  setImmediate(drain);
  return job;
}

// ── Worker drain loop ──────────────────────────────────────────────
async function drain() {
  if (running || !queue.length) return;
  running = true;

  while (queue.length) {
    const jobId = queue.shift();
    let job;
    try {
      job = await Job.findByIdAndUpdate(jobId, { status: 'running', startedAt: new Date() }, { new: true });
      if (!job) continue;

      const handler = handlers[job.type];
      if (!handler) throw new Error(`No handler for job type: ${job.type}`);

      // Pass an updater fn for progress reporting
      const updateProgress = async (progress, total) => {
        await Job.findByIdAndUpdate(jobId, { progress, total });
      };

      const result = await handler(job.payload, updateProgress);
      await Job.findByIdAndUpdate(jobId, { status: 'done', result, progress: 100, doneAt: new Date() });
    } catch (err) {
      console.error(`[JobQueue] Job ${jobId} failed:`, err.message);
      if (job) {
        await Job.findByIdAndUpdate(jobId, { status: 'failed', error: err.message, doneAt: new Date() });
      }
    }
  }

  running = false;
}

// ── Status query ───────────────────────────────────────────────────
async function getJob(jobId) {
  return Job.findById(jobId).lean();
}

async function getRecentJobs(userId, limit = 20) {
  return Job.find({ createdBy: userId }).sort({ createdAt: -1 }).limit(limit).lean();
}

module.exports = { register, enqueue, getJob, getRecentJobs, Job };
