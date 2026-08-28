const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  lead:      { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null si es automatico por IA
  type: {
    type: String,
    enum: ['whatsapp_in', 'whatsapp_out', 'email_in', 'email_out',
           'call', 'meeting', 'note', 'stage_change', 'ai_action',
           'document', 'task', 'system'],
    required: true
  },
  direction: { type: String, enum: ['inbound', 'outbound', 'internal'] },
  subject:   { type: String },
  content:   { type: String }, // cuerpo del mensaje/nota
  isAuto:    { type: Boolean, default: false }, // true = generado por agente IA
  
  // Para emails
  emailData: {
    messageId: String,
    from:      String,
    to:        [String],
    cc:        [String],
    attachments: [{ filename: String, url: String, size: Number }]
  },
  
  // Para WhatsApp
  waData: {
    messageId: String,
    from:      String,
    to:        String,
    mediaUrl:  String,
    mediaType: String, // image, document, audio
    status:    String  // sent, delivered, read
  },
  
  // Para cambios de etapa
  stageChange: {
    from: String,
    to:   String
  },
  
  // Para tareas
  taskData: {
    dueDate:   Date,
    completed: { type: Boolean, default: false },
    completedAt: Date
  },
  
  metadata: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

activitySchema.index({ lead: 1, createdAt: -1 });      // timeline por lead
activitySchema.index({ user: 1, createdAt: -1 });      // actividades por ejecutivo
activitySchema.index({ type: 1 });
activitySchema.index({ lead: 1, isAuto: 1 });           // cooldown check en followups
activitySchema.index({ createdAt: -1 });                // reports / dashboard últimos 30 días

// Un mensaje entrante (WhatsApp o correo, venga de Meta, Labia o el buzón) es
// un evento para los flujos: «cuando el lead escribe» y las esperas «hasta que
// responda» se enganchan aquí y no en cada webhook.
activitySchema.post('save', function (doc) {
  if (!this.isNew && !doc.$isNew) return;
  if (doc.type !== 'whatsapp_in' && doc.type !== 'email_in') return;
  require('../services/events').emit('message.received', {
    leadId: doc.lead,
    channel: doc.type === 'whatsapp_in' ? 'whatsapp' : 'email',
    activityId: doc._id,
    text: (doc.content || '').slice(0, 2000),
  });
});

module.exports = mongoose.model('Activity', activitySchema);
