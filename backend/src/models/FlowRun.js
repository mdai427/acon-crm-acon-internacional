const mongoose = require('mongoose');

// ============================================
// Ejecución de un flujo sobre un lead
// ============================================
//
// Un lead que entra a un flujo produce un FlowRun. El motor avanza
// `currentNodeId` paso a paso; en un Esperar queda en `waiting` con
// `nextRunAt` (por tiempo) o `waitingFor.event` (por evento). Sustituye a
// ScheduledAction y SequenceEnrollment.

const stepLogSchema = new mongoose.Schema({
  nodeId:  String,
  type:    String,
  at:      { type: Date, default: Date.now },
  result:  { type: String, enum: ['ok', 'skipped', 'failed', 'degraded', 'postponed', 'waiting', 'resumed'] },
  detail:  String,
  handle:  String, // salida tomada
  activityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Activity' },
}, { _id: false });

const flowRunSchema = new mongoose.Schema({
  flow:        { type: mongoose.Schema.Types.ObjectId, ref: 'Flow', required: true },
  flowVersion: { type: Number, required: true },
  lead:        { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },

  triggeredBy: {
    type:    { type: String }, // tipo de disparador o 'manual' / 'test'
    eventId: String,
    userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    event:   mongoose.Schema.Types.Mixed, // resumen del evento que abrió el flujo
  },

  status: { type: String, enum: ['running', 'waiting', 'completed', 'exited', 'failed', 'paused'], default: 'running', index: true },
  currentNodeId: String,
  nextRunAt: Date,

  waitingFor: {
    kind:   { type: String, enum: ['time', 'event'] },
    event:  String,                          // nombre del evento esperado
    filter: mongoose.Schema.Types.Mixed,     // p. ej. { channel: 'whatsapp' }
    until:  Date,                            // tope del «hasta que…»
    // true = el paso actual no se ejecutó todavía (se pospuso por frecuencia).
    retryNode: { type: Boolean, default: false },
  },

  // Lock optimista: quien reanuda escribe su marca; otro worker no la pisa.
  lockedAt: Date,

  context: {
    vars:          { type: mongoose.Schema.Types.Mixed, default: {} },
    lastAiResult:  mongoose.Schema.Types.Mixed,
    lastEvent:     mongoose.Schema.Types.Mixed,
    consumedEvents:{ type: [String], default: [] },
    steps:         { type: Number, default: 0 },
  },

  stepLog: { type: [stepLogSchema], default: [] },
  exitReason: String,
  finishedAt: Date,
}, { timestamps: true });

flowRunSchema.index({ status: 1, nextRunAt: 1 });
flowRunSchema.index({ lead: 1, flow: 1, status: 1 });
flowRunSchema.index({ flow: 1, status: 1 });
flowRunSchema.index({ lead: 1, status: 1, 'waitingFor.event': 1 });

module.exports = mongoose.models.FlowRun || mongoose.model('FlowRun', flowRunSchema);
