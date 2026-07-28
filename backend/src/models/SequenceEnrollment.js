const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema({
  sequence:   { type: mongoose.Schema.Types.ObjectId, ref: 'Sequence', required: true },
  lead:       { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  enrolledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  enrolledAt: { type: Date, default: Date.now },
  status:     { type: String, enum: ['active', 'completed', 'paused', 'exited'], default: 'active' },
  currentStep:{ type: Number, default: 0 }, // index del siguiente paso a ejecutar
  nextRunAt:  { type: Date },               // cuándo ejecutar el siguiente paso
  exitReason: { type: String },
  log: [{
    step:       Number,
    executedAt: Date,
    channel:    String,
    result:     { type: String, enum: ['sent', 'skipped', 'failed'] },
    note:       String,
  }],
}, { timestamps: true });

enrollmentSchema.index({ sequence: 1, lead: 1 });
enrollmentSchema.index({ status: 1, nextRunAt: 1 }); // cron job query

module.exports = mongoose.model('SequenceEnrollment', enrollmentSchema);
