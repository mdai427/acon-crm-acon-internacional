const mongoose = require('mongoose');

// ============================================
// Lista de supresión de correo
// ============================================
//
// La supresión vive por DIRECCIÓN, no por lead: la misma dirección puede estar
// en varios leads (contacto duplicado, empresa con un solo correo) y si rebotó
// una vez, rebota para todos. El bloqueo en Lead.emailStatus es el reflejo de
// esto para la UI; la verdad para decidir si se envía o no es esta colección.

const emailSuppressionSchema = new mongoose.Schema({
  address: { type: String, required: true, unique: true, lowercase: true, trim: true },

  reason: {
    type: String,
    enum: ['hard_bounce', 'complaint', 'soft_bounces', 'manual'],
    required: true,
  },
  // Texto del proveedor ("mailbox does not exist"), útil para que el asesor
  // sepa si conviene pedir el correo correcto o el contacto se fue de la empresa.
  detail: { type: String },

  // Los rebotes blandos (buzón lleno, servidor caído) no bloquean al primero:
  // se acumulan y recién al tercero se considera muerta la dirección.
  bounceCount: { type: Number, default: 1 },
  lastBounceAt: { type: Date, default: Date.now },

  // Un admin puede reactivar una dirección (ej. el contacto avisó que ya
  // liberó el buzón). Queda registrado quién lo hizo.
  releasedAt: { type: Date },
  releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Solo bloquean las que no fueron liberadas.
emailSuppressionSchema.index({ address: 1, releasedAt: 1 });

module.exports = mongoose.models.EmailSuppression
  || mongoose.model('EmailSuppression', emailSuppressionSchema);
