const mongoose = require('mongoose');

// Configuración de integraciones editable desde el panel.
// El valor se guarda SIEMPRE cifrado (AES-256-GCM); ver services/settingsService.
const settingSchema = new mongoose.Schema({
  key:       { type: String, required: true, unique: true },
  value:     { type: String, required: true },   // cifrado: iv:tag:datos
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Setting', settingSchema);
