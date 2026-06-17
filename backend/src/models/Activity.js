const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  lead:      { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
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

activitySchema.index({ lead: 1, createdAt: -1 });
activitySchema.index({ user: 1, createdAt: -1 });
activitySchema.index({ type: 1 });

module.exports = mongoose.model('Activity', activitySchema);
