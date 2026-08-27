const mongoose = require('mongoose');

// ============================================
// Plantilla de WhatsApp — espejo local
// ============================================
//
// Quien aprueba o rechaza es Meta, y lo hace en diferido: minutos u horas
// después de crearla. Hasta ahora el CRM no guardaba nada —preguntaba la lista
// al proveedor cada vez— así que una plantilla recién enviada era invisible
// mientras estaba pendiente, y el motivo de un rechazo no lo veía nadie.
//
// Este espejo existe para tres cosas que la lista del proveedor no da:
//   · Saber QUIÉN la creó, para avisarle cuando Meta responda.
//   · Conservar el motivo del rechazo, que llega una sola vez por webhook.
//   · Mostrar las pendientes junto a las aprobadas en la misma pantalla.
//
// No es la fuente de verdad de qué se puede enviar: eso lo sigue diciendo el
// proveedor, y cada vez que se lista se refresca este espejo con su respuesta.

const buttonSchema = new mongoose.Schema({
  type: { type: String, enum: ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'], required: true },
  text: { type: String, required: true },
  url:   { type: String },   // solo URL
  phone: { type: String },   // solo PHONE_NUMBER
}, { _id: false });

const waTemplateSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  language: { type: String, default: 'es_MX' },
  category: { type: String, enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'], default: 'UTILITY' },

  // Estados de Meta. PENDING es el que asigna el CRM al enviarla a revisión;
  // el resto llegan por webhook o al refrescar la lista del proveedor.
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'IN_APPEAL'],
    default: 'PENDING',
    index: true,
  },
  // Por qué la rechazó Meta. Llega en el webhook y no se vuelve a repetir.
  rejectionReason: { type: String },

  // Contenido, tal como se envió a revisión.
  headerFormat: { type: String, enum: ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'], default: undefined },
  headerText:   { type: String },
  headerHandle: { type: String },
  bodyText:     { type: String, required: true },
  footerText:   { type: String },
  buttons:      { type: [buttonSchema], default: [] },
  // Valores de ejemplo de cada {{n}}: Meta los exige y conviene conservarlos
  // para poder reenviar la plantilla corregida sin volver a inventarlos.
  examples:     { type: [String], default: [] },

  // Qué significa cada variable {{n}} (la posición en el array es n-1).
  //
  // Sin esto, al enviar la plantilla había que teclear TODOS los valores a
  // mano, incluso el nombre del contacto que el CRM ya conoce. Guardando el
  // mapeo, las variables de tipo `field` se rellenan solas con el dato del
  // lead y solo se piden las `custom`, que son las que dependen del momento
  // (una fecha, un número de embarque, un monto).
  variables: {
    type: [new mongoose.Schema({
      // 'field'  → dato del CRM, se resuelve solo (ver source).
      // 'custom' → lo escribe el ejecutivo al enviar.
      kind:   { type: String, enum: ['field', 'custom'], default: 'field' },
      // Clave del dato del lead cuando kind = 'field' ('contact', 'company'…).
      source: { type: String },
      // Etiqueta que se le muestra al ejecutivo cuando kind = 'custom'.
      label:  { type: String },
      // Texto de ejemplo, el que se le mandó a Meta para aprobar.
      sample: { type: String },
    }, { _id: false })],
    default: [],
  },

  provider:   { type: String, enum: ['meta', 'labia'], default: 'meta' },
  providerId: { type: String },

  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  submittedAt: { type: Date, default: Date.now },
  reviewedAt:  { type: Date },
  lastSyncAt:  { type: Date },
}, { timestamps: true });

// Meta identifica una plantilla por nombre + idioma: la misma plantilla en
// español y en inglés son dos registros distintos y ambos se pueden enviar.
waTemplateSchema.index({ name: 1, language: 1 }, { unique: true });

module.exports = mongoose.models.WaTemplate
  || mongoose.model('WaTemplate', waTemplateSchema);
