const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  concept: { type: String, required: true },
  unit:    { type: String, default: 'Global' },
  qty:     { type: Number, default: 1 },
  unitPrice: { type: Number, default: 0 },
  currency: { type: String, enum: ['USD', 'MXN'], default: 'USD' },
  notes:   String,
}, { _id: false });

const quoteSchema = new mongoose.Schema({
  folio:   { type: String, unique: true },
  lead:    { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  clientName:    String,
  clientEmail:   String,
  clientPhone:   String,
  contactName:   String,

  serviceType: {
    type: String,
    enum: ['maritimo_fcl','maritimo_lcl','aereo','terrestre_full','terrestre_sencillo','terrestre_economico','almacenaje','aduanal_importacion','aduanal_exportacion'],
    required: true,
  },

  origin:      String,
  destination: String,
  incoterm:    { type: String, default: 'EXW' },
  carrier:     String,

  // Carga
  containerType: String,
  weight:  Number,
  volume:  Number,
  units:   Number,
  commodity: String, // descripción de la mercancía

  // Cliente adicional
  clientAddress: String,
  salesRep:      String,
  paymentTerms:  { type: String, default: 'Due on receipt service' },

  items: [lineItemSchema],

  // Tabla de rutas FCL/LCL (alternativa a items para marítimo)
  routes: [{
    origen:      String,
    pol:         String, // port of loading
    pod:         String, // port of discharge
    transitDays: String,
    price20:     Number,
    price40:     Number,
    price40HC:   Number,
    currency:    { type: String, default: 'USD' },
    _id: false,
  }],

  // Cargos adicionales
  additionalCharges: {
    docFee:        { type: Number, default: 0 },
    releaseFee:    { type: Number, default: 0 },
    cartaGarantia: String,
    freeDays:      { type: Number, default: 21 },
  },

  // Totales calculados
  totalUSD: { type: Number, default: 0 },
  totalMXN: { type: Number, default: 0 },

  currency:    { type: String, enum: ['USD', 'MXN'], default: 'USD' },
  exchangeRate: { type: Number, default: 17 },

  validity:    { type: Number, default: 15 }, // días
  validUntil:  Date,
  notes:       String,
  terms:       String,

  status: { type: String, enum: ['draft','pending_approval','approved','rejected_approval','sent','accepted','rejected','expired'], default: 'draft' },

  sentAt:     Date,
  acceptedAt: Date,

  // ── Flujo de aprobación interna ──────────────────────────
  approval: {
    requestedAt:  Date,
    requestedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt:   Date,
    reviewedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decision:     { type: String, enum: ['approved', 'rejected'] },
    comments:     String,
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Version history — snapshot on each PUT
  versions: [{
    versionNumber: Number,
    savedAt: { type: Date, default: Date.now },
    savedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    snapshot: { type: mongoose.Schema.Types.Mixed }, // JSON snapshot of full doc
  }],
}, { timestamps: true });

// Auto folio
quoteSchema.pre('validate', async function (next) {
  if (!this.folio) {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments();
    this.folio = `COT-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  if (!this.validUntil && this.validity) {
    const d = new Date();
    d.setDate(d.getDate() + this.validity);
    this.validUntil = d;
  }
  next();
});

quoteSchema.index({ lead: 1 });                    // join con lead
quoteSchema.index({ status: 1 });                  // filtro de estado
quoteSchema.index({ createdBy: 1 });
quoteSchema.index({ createdAt: -1 });              // sort más común
quoteSchema.index({ validUntil: 1 });              // alertas de vencimiento

module.exports = mongoose.model('Quote', quoteSchema);
