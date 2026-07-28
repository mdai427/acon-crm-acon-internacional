const mongoose = require('mongoose');

// Registro de llamadas hechas desde el CRM con Twilio.
// El ciclo de vida lo escriben los webhooks de Twilio: /voice crea el registro,
// /status actualiza duración y resultado, /recording adjunta el audio y dispara
// la transcripción.
const callSchema = new mongoose.Schema({
  lead:    { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },   // quién llamó

  direction: { type: String, enum: ['outbound', 'inbound'], default: 'outbound' },
  from: String,   // caller ID usado
  to:   String,   // número marcado (E.164)

  // callSid es el de la llamada del navegador (parent); childSid el del tramo
  // hacia el cliente, que es el que trae la duración real conversada.
  callSid:  { type: String, index: true },
  childSid: { type: String, index: true },

  // Estados de Twilio: queued, ringing, in-progress, completed, busy,
  // no-answer, failed, canceled.
  status:     { type: String, default: 'queued' },
  startedAt:  Date,
  answeredAt: Date,
  endedAt:    Date,
  duration:   { type: Number, default: 0 }, // segundos conversados
  price:      Number,                        // costo reportado por Twilio
  priceUnit:  String,

  recording: {
    sid: String,
    url: String,              // URL de la grabación en Twilio (requiere auth)
    duration: Number,
  },

  transcription: {
    // pending → processing → done | failed | skipped
    status:   { type: String, default: 'pending' },
    text:     String,
    language: String,
    provider: String,          // 'openai-whisper'
    error:    String,
    updatedAt: Date,
  },

  notes: String,
}, { timestamps: true });

callSchema.index({ lead: 1, createdAt: -1 });
callSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Call', callSchema);
