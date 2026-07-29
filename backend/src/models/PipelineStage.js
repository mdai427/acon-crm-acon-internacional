const mongoose = require('mongoose');

// Etapas del pipeline comercial. Antes eran un enum fijo en el modelo Lead; al
// vivir en la base de datos cada instalación puede añadir, renombrar, reordenar
// o quitar etapas desde el panel.
//
// `key` es lo que se guarda en lead.stage, así que no cambia nunca una vez
// creada: renombrar afecta solo a `label`, el texto que ve el usuario.
const pipelineStageSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true, trim: true },
  label: { type: String, required: true, trim: true },

  // Orden de izquierda a derecha en el tablero.
  order: { type: Number, default: 0 },
  color: { type: String, default: '#6B7280' },
  // Emoji opcional que acompaña al nombre en el tablero y los playbooks.
  emoji: { type: String, default: '' },

  // 'open'  → sigue en juego
  // 'won'   → cierre ganado (dispara comisiones y cuenta como venta)
  // 'lost'  → cierre perdido
  type: { type: String, enum: ['open', 'won', 'lost'], default: 'open' },

  // Las etapas de sistema no se pueden borrar: hay lógica de negocio colgando
  // de ellas (comisiones sobre el cierre ganado, reportes de conversión).
  isSystem: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },

  description: String,
}, { timestamps: true });

pipelineStageSchema.index({ order: 1 });

// Las siete etapas con las que nació el CRM. Se siembran si la colección está
// vacía, de modo que una instalación existente no note el cambio.
const DEFAULT_STAGES = [
  { key: 'new',         label: 'Nuevos',       order: 0, color: '#6366F1', emoji: '✨', type: 'open', isSystem: true },
  { key: 'contacted',   label: 'Contactados',  order: 1, color: '#3B82F6', emoji: '📞', type: 'open' },
  { key: 'qualified',   label: 'Calificados',  order: 2, color: '#F59E0B', emoji: '⭐', type: 'open' },
  { key: 'proposal',    label: 'Propuesta',    order: 3, color: '#F97316', emoji: '📄', type: 'open' },
  { key: 'negotiation', label: 'Negociación',  order: 4, color: '#8B5CF6', emoji: '🤝', type: 'open' },
  { key: 'closed_won',  label: 'Ganado',       order: 5, color: '#16A34A', emoji: '🏆', type: 'won',  isSystem: true },
  { key: 'closed_lost', label: 'Perdido',      order: 6, color: '#DC2626', emoji: '❌', type: 'lost', isSystem: true },
];

module.exports = mongoose.model('PipelineStage', pipelineStageSchema);
module.exports.DEFAULT_STAGES = DEFAULT_STAGES;
