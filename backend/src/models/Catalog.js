const mongoose = require('mongoose');

/**
 * Catálogo logístico ACON CRM
 * type: puerto | aduana | aeropuerto | naviera | aerolinea | transportista | incoterm | contenedor | ruta_frecuente | pais | ciudad
 */
const catalogSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['puerto', 'aduana', 'aeropuerto', 'naviera', 'aerolinea', 'transportista', 'incoterm', 'contenedor', 'ruta_frecuente', 'pais', 'ciudad'],
  },
  code:    { type: String, trim: true },      // IATA, LOCODE, UNECE, etc.
  name:    { type: String, required: true, trim: true },
  country: { type: String, trim: true },
  region:  { type: String, trim: true },      // Para rutas: ej. "Asia", "Norteamérica"
  extra:   { type: mongoose.Schema.Types.Mixed }, // datos adicionales específicos por tipo
  isActive: { type: Boolean, default: true },
  order:   { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

catalogSchema.index({ type: 1, isActive: 1 });
catalogSchema.index({ type: 1, name: 1 });

module.exports = mongoose.model('Catalog', catalogSchema);
