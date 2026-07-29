const mongoose = require('mongoose');

// Acción de playbook con retraso: "3 días después de entrar a Propuesta, enviar
// seguimiento". Se encola aquí y el cron la ejecuta cuando vence.
const scheduledActionSchema = new mongoose.Schema({
  lead:  { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  user:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // quien movió el lead
  stage: { type: String, required: true }, // etapa que disparó el playbook

  action: { type: mongoose.Schema.Types.Mixed, required: true }, // la acción tal cual
  runAt:  { type: Date, required: true },

  status: { type: String, enum: ['pending', 'done', 'failed', 'canceled'], default: 'pending' },
  error:  String,
  executedAt: Date,
}, { timestamps: true });

scheduledActionSchema.index({ status: 1, runAt: 1 });
scheduledActionSchema.index({ lead: 1, status: 1 });

module.exports = mongoose.model('ScheduledAction', scheduledActionSchema);
