const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  // Clave de etapa del pipeline (configurable) o 'general'. Sin enum: las
  // etapas se crean desde el tablero.
  stage: { type: String, required: true, default: 'general' },
  channel: {
    type: String,
    enum: ['whatsapp','email','call_script'],
    required: true,
  },
  name:    { type: String, required: true },
  subject: { type: String },
  body:    { type: String, required: true },
  isDefault: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

templateSchema.index({ stage: 1, channel: 1 });    // filtro compuesto en GET /
templateSchema.index({ isDefault: 1 });             // filtro de plantillas default

module.exports = mongoose.model('Template', templateSchema);
