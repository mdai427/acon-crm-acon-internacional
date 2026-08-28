const mongoose = require('mongoose');

// ============================================
// Flujo de automatización: disparador + grafo de pasos
// ============================================
//
// Un flujo dice "cuando pase X, recorre estos pasos". Sustituye a Playbooks,
// Reglas de seguimiento, Secuencias y las Automatizaciones de Marketing. El
// motor que lo ejecuta vive en services/flows/engine.js.
//
// nodes[]: cada paso del canvas. `type` decide qué hace y qué salidas tiene;
// `config` es libre y lo valida services/flows/validate.js según el tipo.
// edges[]: conexiones. `fromHandle` es la salida del paso de origen:
//   · 'next'              — pasos con una sola salida
//   · 'yes' | 'no'        — Condición
//   · 'happened'|'timeout'— Esperar «hasta que…»
//   · <valor> | 'other'   — Dividir por

const NODE_TYPES = [
  'trigger',
  // control
  'wait', 'condition', 'split', 'exit', 'note',
  // acciones
  'send_whatsapp', 'send_email', 'create_task', 'notify', 'ai_email_draft',
  'change_stage', 'assign', 'tag', 'update_field', 'enroll_flow',
];

const TRIGGER_TYPES = [
  'lead.created', 'lead.stage_entered', 'lead.score_changed', 'lead.assigned',
  'message.received', 'quote.sent', 'quote.accepted', 'quote.rejected', 'call.ended',
  'lead.inactive', 'lead.date_reached', 'manual',
];

// Condición reutilizable: grupo AND/OR de reglas sobre campos del lead.
const ruleSchema = new mongoose.Schema({
  field: { type: String, required: true },
  cmp:   { type: String, enum: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'contains', 'exists', 'not_exists'], default: 'eq' },
  value: { type: mongoose.Schema.Types.Mixed },
}, { _id: false });

const conditionSchema = new mongoose.Schema({
  op:    { type: String, enum: ['and', 'or'], default: 'and' },
  rules: { type: [ruleSchema], default: [] },
}, { _id: false });

const nodeSchema = new mongoose.Schema({
  id:       { type: String, required: true },
  type:     { type: String, enum: NODE_TYPES, required: true },
  label:    { type: String, default: '' },
  position: { x: { type: Number, default: 0 }, y: { type: Number, default: 0 } },
  config:   { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

const edgeSchema = new mongoose.Schema({
  id:         { type: String, required: true },
  from:       { type: String, required: true },
  fromHandle: { type: String, default: 'next' },
  to:         { type: String, required: true },
}, { _id: false });

const flowSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  isActive:    { type: Boolean, default: false },
  // Sube en cada publicación. Las ejecuciones en curso guardan la versión con
  // la que arrancaron y siguen con ella aunque el flujo cambie.
  version:     { type: Number, default: 0 },
  status:      { type: String, enum: ['draft', 'published'], default: 'draft' },

  trigger: {
    type:         { type: String, enum: TRIGGER_TYPES, required: true },
    params:       { type: mongoose.Schema.Types.Mixed, default: {} },
    entryFilters: { type: conditionSchema, default: () => ({ op: 'and', rules: [] }) },
  },

  settings: {
    allowReentry:      { type: Boolean, default: false },
    cooldownDays:      { type: Number, default: 7 },
    onDeactivate:      { type: String, enum: ['pause', 'exit'], default: 'pause' },
    businessHoursOnly: { type: Boolean, default: false },
    // Inscripción manual desde la ficha del lead, aunque el disparador sea otro.
    allowManualEnroll: { type: Boolean, default: true },
  },

  nodes: { type: [nodeSchema], default: [] },
  edges: { type: [edgeSchema], default: [] },

  // Última versión publicada, congelada: es lo que ejecuta el motor.
  published: {
    version: Number,
    trigger: mongoose.Schema.Types.Mixed,
    settings: mongoose.Schema.Types.Mixed,
    nodes: mongoose.Schema.Types.Mixed,
    edges: mongoose.Schema.Types.Mixed,
    at: Date,
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },

  origin: { type: String, enum: ['user', 'factory'], default: 'user' },

  stats: {
    runsTotal:  { type: Number, default: 0 },
    runsActive: { type: Number, default: 0 },
    lastRunAt:  Date,
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

flowSchema.index({ isActive: 1, 'trigger.type': 1 });

flowSchema.statics.NODE_TYPES = NODE_TYPES;
flowSchema.statics.TRIGGER_TYPES = TRIGGER_TYPES;

module.exports = mongoose.models.Flow || mongoose.model('Flow', flowSchema);
