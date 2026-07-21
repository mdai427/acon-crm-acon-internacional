const mongoose = require('mongoose');

const stepSchema = new mongoose.Schema({
  order:      { type: Number, required: true },
  delayHours: { type: Number, default: 24 }, // horas después del paso anterior (o del enroll para paso 0)
  channel:    { type: String, enum: ['whatsapp', 'email', 'task'], default: 'whatsapp' },
  message:    { type: String },  // mensaje WA / cuerpo email / descripción tarea
  subject:    { type: String },  // asunto email
  taskTitle:  { type: String },  // título tarea
  // Condición de parada: si se cumple, no enviar este paso
  skipIf: {
    type: { type: String, enum: ['stage_is', 'stage_not', 'has_reply', 'none'], default: 'none' },
    stages: [String],
  },
}, { _id: true });

const sequenceSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: String,
  isActive:    { type: Boolean, default: true },
  steps:       [stepSchema],
  // Qué dispara el enroll automático (vacío = solo manual)
  autoEnrollTrigger: {
    type: { type: String, enum: ['stage_entered', 'score_below', 'none'], default: 'none' },
    stages:   [String],
    minScore: Number,
  },
  cooldownDays: { type: Number, default: 7 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Sequence', sequenceSchema);
