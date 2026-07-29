const mongoose = require('mongoose');

// ============================================
// Buzón de correo corporativo del CRM
// ============================================
//
// Un buzón es una dirección real del dominio (ventas@mail.aconinternacional.com)
// que envía y recibe dentro de la plataforma. NO es una cuenta de Google
// Workspace: no tiene contraseña ni IMAP, la conversación vive en el chat del
// lead. Por eso crear uno es solo insertar un documento — sin licencias ni APIs
// externas de por medio.
//
// El correo entrante llega por el webhook de Resend (ver services/inboundEmail)
// y se enruta al buzón cuyo `address` coincide con el destinatario.

const mailboxSchema = new mongoose.Schema({
  // Dirección completa en minúsculas. Es la clave de enrutamiento del correo
  // entrante, por eso es única.
  address: {
    type: String, required: true, unique: true, lowercase: true, trim: true,
  },
  // Nombre que ve el destinatario: "Sarahi Noriega — ACON Worldwide".
  displayName: { type: String, required: true, trim: true },

  // Dueño del buzón. Los correos entrantes se le notifican a él.
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Buzones compartidos (ventas@, cotizaciones@): varios usuarios lo atienden.
  sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Firma HTML que se anexa al final de cada correo saliente.
  signature: { type: String, default: '' },

  // Copia de los entrantes a una casilla externa (el Gmail personal del asesor),
  // para que no sienta que "pierde" el correo mientras se acostumbra al CRM.
  forwardTo: { type: String, default: '', lowercase: true, trim: true },

  isActive: { type: Boolean, default: true },
  // Buzón por defecto para los envíos automáticos del sistema (notificaciones,
  // secuencias) cuando nadie especifica remitente. Solo puede haber uno.
  isDefault: { type: Boolean, default: false },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

mailboxSchema.index({ assignedTo: 1 });
mailboxSchema.index({ isActive: 1, isDefault: 1 });

// Encabezado From con el formato "Nombre <dirección>".
mailboxSchema.methods.fromHeader = function fromHeader() {
  return `${this.displayName} <${this.address}>`;
};

module.exports = mongoose.models.Mailbox || mongoose.model('Mailbox', mailboxSchema);
