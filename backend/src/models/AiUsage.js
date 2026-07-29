const mongoose = require('mongoose');

// Un documento por cada llamada a la IA. Guarda a la vez el costo real del
// proveedor y el precio con margen que se le cobra al CRM, para que el panel de
// super admin pueda ver la ganancia sin recalcular nada.
//
// Los importes están en USD con 6 decimales de precisión efectiva (una llamada
// barata cuesta fracciones de centavo).
const aiUsageSchema = new mongoose.Schema({
  // Herramienta del CRM que consumió la IA: 'lead_scoring', 'copilot',
  // 'call_transcription', 'email_draft', 'company_research', 'quote_suggest'…
  feature:  { type: String, required: true, index: true },
  provider: { type: String, default: 'openai' },
  model:    { type: String, required: true },
  // 'chat' (tokens) o 'audio' (minutos)
  kind:     { type: String, enum: ['chat', 'audio'], default: 'chat' },

  inputTokens:  { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  audioSeconds: { type: Number, default: 0 },

  costUsd:   { type: Number, default: 0 },  // lo que cuesta al proveedor
  marginPct: { type: Number, default: 0 },  // margen aplicado en ese momento
  priceUsd:  { type: Number, default: 0 },  // lo que se le cobra al CRM

  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },

  // Periodo de facturación 'AAAA-MM'. Se fija al registrar para que un cierre
  // posterior no pueda mover el uso de mes.
  period: { type: String, required: true, index: true },

  status: { type: String, enum: ['ok', 'error'], default: 'ok' },
  error:  String,
  meta:   { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

aiUsageSchema.index({ period: 1, feature: 1 });
aiUsageSchema.index({ createdAt: -1 });
aiUsageSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('AiUsage', aiUsageSchema);
