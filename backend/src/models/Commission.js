const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema({
  // Ejecutivo que generó la comisión
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Lead / deal relacionado
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },

  // Operación relacionada (si aplica)
  operation: { type: mongoose.Schema.Types.ObjectId, ref: 'Operation' },

  // Origen del lead (define qué tabla de comisiones aplica)
  leadType: {
    type: String,
    enum: ['campaign', 'direct', 'referral'],
    default: 'direct',
  },

  // Tipo de servicio
  serviceType: {
    type: String,
    enum: ['maritimo_import', 'maritimo_export', 'aereo_import', 'aereo_export',
           'terrestre_usa', 'terrestre_nacional', 'despacho_aduanal', 'almacenaje',
           'seguro_carga', 'otro'],
    default: 'otro',
  },

  // Datos del deal
  clientName:   { type: String, required: true },
  dealValue:    { type: Number, required: true },   // Valor total del deal (MXN)
  costValue:    { type: Number, default: 0 },        // Costo/gasto asociado (MXN)
  profitValue:  { type: Number, default: 0 },        // Utilidad = dealValue - costValue
  commissionPct:{ type: Number, required: true },    // % de comisión (ej: 5)
  commissionAmt:{ type: Number, required: true },    // Monto de comisión calculado

  // Período
  period:   { type: String }, // "2026-06" — año-mes para agrupar
  dealDate: { type: Date, default: Date.now },

  // Estado de pago
  status: {
    type: String,
    enum: ['pending', 'approved', 'paid', 'cancelled'],
    default: 'pending',
  },
  paidAt:   { type: Date },
  paidBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  notes: { type: String },
}, { timestamps: true });

// Calcular utilidad y comisión antes de guardar
commissionSchema.pre('save', function(next) {
  this.profitValue  = this.dealValue - (this.costValue || 0);
  this.commissionAmt = Math.round(this.profitValue * (this.commissionPct / 100) * 100) / 100;
  this.period = new Date(this.dealDate).toISOString().slice(0, 7); // "YYYY-MM"
  next();
});

commissionSchema.index({ user: 1, period: 1 });
commissionSchema.index({ status: 1 });
commissionSchema.index({ lead: 1 });

module.exports = mongoose.model('Commission', commissionSchema);
