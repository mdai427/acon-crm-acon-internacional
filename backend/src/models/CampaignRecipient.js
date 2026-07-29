const mongoose = require('mongoose');

// ============================================
// Destinatario de campaña
// ============================================
//
// Una fila por (campaña, lead). Es lo que permite atribuir cada evento del
// proveedor —entregado, rebotado, abierto, clic— al envío concreto, y por lo
// tanto tener métricas por campaña Y por contacto: "este lead abrió la
// cotización tres veces" vale más que un porcentaje global.

const campaignRecipientSchema = new mongoose.Schema({
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
  lead:     { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  email:    { type: String, required: true, lowercase: true, trim: true },

  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed', 'skipped', 'unsubscribed'],
    default: 'pending',
  },
  // Motivo cuando no se envió: 'suppressed' (rebotó antes), 'no_email', o el
  // error del proveedor tras agotar los reintentos.
  reason: { type: String },

  // Id que devuelve Resend: es la llave para casar los webhooks con esta fila.
  messageId: { type: String, index: true },

  sentAt: Date,
  deliveredAt: Date,
  firstOpenAt: Date,
  firstClickAt: Date,
  // Fecha de la primera respuesta del contacto tras este envío.
  repliedAt: Date,
  // Un mismo correo se abre varias veces; el conteo es la señal de interés.
  openCount:  { type: Number, default: 0 },
  clickCount: { type: Number, default: 0 },
  attempts:   { type: Number, default: 0 },
}, { timestamps: true });

campaignRecipientSchema.index({ campaign: 1, status: 1 });
campaignRecipientSchema.index({ campaign: 1, lead: 1 }, { unique: true });

module.exports = mongoose.models.CampaignRecipient
  || mongoose.model('CampaignRecipient', campaignRecipientSchema);
