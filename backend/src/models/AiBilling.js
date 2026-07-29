const mongoose = require('mongoose');

// Configuración de reventa de IA. Es un documento único (singleton): tarifas de
// costo por modelo y el margen que se le agrega al CRM.
//
// Precios en USD por millón de tokens (chat) o por minuto (audio), que es como
// los publican los proveedores.
const modelPriceSchema = new mongoose.Schema({
  provider:   { type: String, default: 'openai' },   // ver config/aiProviders
  model:      { type: String, required: true },
  kind:       { type: String, enum: ['chat', 'audio'], default: 'chat' },
  inputPer1M:  { type: Number, default: 0 },
  outputPer1M: { type: Number, default: 0 },
  perMinute:   { type: Number, default: 0 },
  // Si se define, pisa al margen global para este modelo.
  marginPct:   { type: Number, default: null },
  // 'auto' = se actualiza con el catálogo de OpenRouter; 'manual' = lo fijó el
  // super admin y ninguna sincronización lo pisa.
  priceSource: { type: String, enum: ['auto', 'manual'], default: 'auto' },
  priceUpdatedAt: Date,
}, { _id: false });

// Modelo asignado a cada agente del CRM. Vacío = usa el modelo por defecto.
const agentModelSchema = new mongoose.Schema({
  agent:    { type: String, required: true },   // id de config/aiAgents
  provider: { type: String, default: '' },      // '' = proveedor por defecto
  model:    { type: String, default: '' },      // '' = modelo por defecto
}, { _id: false });

const aiBillingConfigSchema = new mongoose.Schema({
  singleton: { type: String, default: 'config', unique: true },

  // Modelos por defecto cuando un agente no tiene uno propio.
  defaultChatModel:  { type: String, default: 'gpt-4o-mini' },
  defaultAudioModel: { type: String, default: 'whisper-1' },
  // Asignación explícita por agente (la controla solo el super admin).
  agents: { type: [agentModelSchema], default: [] },

  // Proveedor por defecto cuando un agente no indica otro.
  defaultProvider: { type: String, default: 'openai' },
  // Última sincronización de precios con el catálogo de OpenRouter.
  pricesSyncedAt: Date,

  // Margen de reventa por defecto, en porcentaje sobre el costo real.
  defaultMarginPct: { type: Number, default: 40 },
  currency: { type: String, default: 'USD' },

  models: { type: [modelPriceSchema], default: [] },

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Periodo de facturación mensual. Mientras está abierto los totales se calculan
// en vivo; al cerrarlo se congelan para que el histórico no cambie aunque luego
// se ajusten tarifas o márgenes.
const aiPeriodSchema = new mongoose.Schema({
  period: { type: String, required: true, unique: true }, // 'AAAA-MM'
  status: { type: String, enum: ['open', 'closed'], default: 'open' },

  totals: {
    calls:        { type: Number, default: 0 },
    inputTokens:  { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    audioSeconds: { type: Number, default: 0 },
    costUsd:      { type: Number, default: 0 },  // costo real (solo super admin)
    priceUsd:     { type: Number, default: 0 },  // total facturado al CRM
    marginUsd:    { type: Number, default: 0 },
  },
  // Desglose por herramienta, congelado al cerrar.
  byFeature: { type: [{
    feature: String,
    calls: Number,
    costUsd: Number,
    priceUsd: Number,
  }], default: [] },

  closedAt: Date,
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  note: String,
}, { timestamps: true });

const AiBillingConfig = mongoose.model('AiBillingConfig', aiBillingConfigSchema);
const AiPeriod = mongoose.model('AiPeriod', aiPeriodSchema);

module.exports = { AiBillingConfig, AiPeriod };
