const mongoose = require('mongoose');

const followUpRuleSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: String,
  isActive:    { type: Boolean, default: true },

  // Condición disparadora
  trigger: {
    type:     { type: String, enum: ['days_inactive', 'stage_entered', 'score_below'], required: true },
    value:    { type: Number },   // días / score mínimo
    stages:   [String],          // etapas aplicables (vacío = todas)
  },

  // Acción a ejecutar
  action: {
    type:     { type: String, enum: ['whatsapp', 'email', 'task', 'whatsapp_and_email'], required: true },
    template: String,            // template de email
    message:  String,            // mensaje WhatsApp o descripción de tarea
    subject:  String,            // asunto email
    taskTitle: String,
    delayHours: { type: Number, default: 0 }, // retraso en horas
  },

  // Control de ejecución
  cooldownDays: { type: Number, default: 3 },   // mínimo días entre ejecuciones para el mismo lead
  maxExecutions: { type: Number, default: 0 },   // 0 = ilimitado
  executionCount: { type: Number, default: 0 },

  lastRun: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

followUpRuleSchema.index({ isActive: 1 });           // GET /rules y /pending
followUpRuleSchema.index({ 'trigger.type': 1 });    // branch logic en execute

module.exports = mongoose.model('FollowUpRule', followUpRuleSchema);
