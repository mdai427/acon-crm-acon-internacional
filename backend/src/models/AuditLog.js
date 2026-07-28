const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema({
  // Quién
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName: { type: String },  // denormalizado para consultas rápidas
  userRole: { type: String },
  ip:       { type: String },
  userAgent:{ type: String },

  // Qué
  action:   { type: String, required: true }, // 'create' | 'update' | 'delete' | 'login' | 'export'
  entity:   { type: String, required: true }, // 'Lead' | 'Quote' | 'User' | 'Catalog' | ...
  entityId: { type: mongoose.Schema.Types.ObjectId },
  entityLabel:{ type: String }, // nombre descriptivo (company name, folio, etc.)

  // Cambios
  changes: [{
    field:    String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
  }],

  // Contexto adicional
  meta: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

auditSchema.index({ createdAt: -1 });
auditSchema.index({ user: 1, createdAt: -1 });
auditSchema.index({ entity: 1, entityId: 1 });
auditSchema.index({ action: 1 });

module.exports = mongoose.model('AuditLog', auditSchema);
