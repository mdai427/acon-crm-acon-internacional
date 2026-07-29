const mongoose = require('mongoose');

// Un playbook por etapa del pipeline: qué pasa cuando un lead entra a ella.
//
// Antes las "tareas" eran solo texto que el ejecutivo debía hacer a mano. Ahora
// cada entrada es una acción tipada que el motor ejecuta de verdad
// (services/playbookRunner):
//
//   task           → crea una tarea para el ejecutivo (como antes)
//   whatsapp       → ENVÍA el mensaje por WhatsApp al lead
//   email          → ENVÍA el correo al lead (asunto + cuerpo con variables)
//   ai_email_draft → la IA redacta un borrador y lo deja como tarea a aprobar
//   notify         → avisa al ejecutivo asignado (in-app y correo)
//
// Variables disponibles en mensajes/asuntos: {empresa} {contacto} {etapa} {ejecutivo}
const actionSchema = new mongoose.Schema({
  kind: {
    type: String,
    enum: ['task', 'whatsapp', 'email', 'ai_email_draft', 'notify'],
    default: 'task',
  },
  title:     { type: String, required: true },  // nombre visible de la acción
  message:   { type: String },                   // cuerpo (WhatsApp / correo / tarea / aviso)
  // Si se llena, la IA redacta el contenido siguiendo estas instrucciones y el
  // contexto del lead, en lugar de usar `message` como plantilla fija.
  aiInstructions: { type: String },
  // Correo: plantilla de la sección Plantillas (asunto y cuerpo del doc).
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', default: null },
  // WhatsApp: plantilla APROBADA de Meta — es lo único que llega con seguridad
  // fuera de la ventana de 24 h. name/language tal como están en Meta.
  metaTemplate: {
    name:     { type: String, default: '' },
    language: { type: String, default: 'es_MX' },
    // Valores para las variables {{1}}, {{2}}… del cuerpo, en orden. Admiten
    // {empresa} {contacto} {etapa} {ejecutivo}: se renderizan al ejecutar.
    params:   { type: [String], default: [] },
  },
  subject:   { type: String },                   // asunto (correo)
  dueInDays: { type: Number, default: 2 },       // vencimiento si es tarea
  // 0 = al entrar a la etapa; >0 = días de espera antes de ejecutar.
  delayDays: { type: Number, default: 0 },
  // Condiciones: la acción solo corre si el lead las cumple en ese momento.
  // null = sin condición. Se evalúan también al vencer una acción diferida.
  onlyIf: {
    minScore: { type: Number, default: null },
    maxScore: { type: Number, default: null },
    minValue: { type: Number, default: null },   // valor estimado del deal en USD
  },
  order:     { type: Number, default: 0 },
}, { _id: false });

const playbookSchema = new mongoose.Schema({
  // Clave de la etapa (colección PipelineStage). Sin enum: las etapas son
  // configurables y un playbook puede apuntar a una recién creada.
  stage:    { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true },
  // true = si no hay acciones definidas, la IA genera tareas sugeridas.
  useAI:    { type: Boolean, default: true },
  actions:  [actionSchema],
  // Compatibilidad con documentos previos (solo tareas de texto). El GET los
  // migra a `actions` al vuelo; se conserva para no perder datos en rollback.
  tasks: [{ title: String, dueInDays: Number, order: Number }],
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.models.Playbook || mongoose.model('Playbook', playbookSchema);
