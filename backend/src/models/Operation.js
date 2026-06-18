const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  type: { type: String, enum: ['bl_awb', 'factura', 'packing_list', 'cove', 'pedimento', 'cert_origen', 'carta_porte', 'otro'], required: true },
  status: { type: String, enum: ['pending', 'received', 'expired'], default: 'pending' },
  deadline: Date,
  notes: String,
}, { _id: false });

const operationSchema = new mongoose.Schema({
  // Identificación
  bookingNumber: { type: String, required: true, unique: true },
  blAwbCartaPorte: String,

  // Relación con lead/cliente
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  clientName: String, // copia para mostrar sin populate

  // Tipo de servicio
  serviceType: {
    type: String,
    enum: ['maritimo_fcl', 'maritimo_lcl', 'aereo', 'terrestre_full', 'terrestre_sencillo', 'terrestre_economico', 'almacenaje', 'aduanal_importacion', 'aduanal_exportacion'],
    required: true,
  },

  // Ruta
  origin: String,
  destination: String,
  carrier: String, // naviera, aerolinea, transportista

  // Carga
  containerType: String, // '20ft', '40ft', '40hc', 'lcl', 'pallet', etc.
  weight: Number,   // kg
  volume: Number,   // cbm
  units: Number,

  // Fechas
  etd: Date,  // Estimated Time of Departure
  eta: Date,  // Estimated Time of Arrival
  actualDelivery: Date,

  // Estado del embarque
  status: {
    type: String,
    enum: ['booking', 'departed', 'in_transit', 'in_customs', 'released', 'delivered'],
    default: 'booking',
  },

  // Documentos
  documents: [documentSchema],

  // Interno
  notes: String,
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Auto-generar booking number si no se provee
operationSchema.pre('validate', async function (next) {
  if (!this.bookingNumber) {
    const prefix = {
      maritimo_fcl: 'B', maritimo_lcl: 'B',
      aereo: 'A',
      terrestre_full: 'T', terrestre_sencillo: 'T', terrestre_economico: 'T',
      almacenaje: 'W',
      aduanal_importacion: 'D', aduanal_exportacion: 'D',
    }[this.serviceType] || 'OP';
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments();
    this.bookingNumber = `${prefix}-${year}-${String(count + 1).padStart(3, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Operation', operationSchema);
