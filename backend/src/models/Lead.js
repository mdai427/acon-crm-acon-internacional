const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  // ---- Datos del prospecto ----
  company:   { type: String, required: true, trim: true },
  contact:   { type: String, required: true, trim: true },
  email:     { type: String, trim: true, lowercase: true },
  phone:     { type: String, trim: true },
  whatsapp:  { type: String, trim: true }, // numero con codigo de pais: +521234567890
  position:  { type: String, trim: true }, // cargo del contacto
  website:   { type: String },
  country:   { type: String, default: 'México' },
  city:      { type: String },

  // ---- Pipeline ----
  stage: {
    type: String,
    enum: ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'],
    default: 'new'
  },
  score:     { type: Number, default: 0, min: 0, max: 100 }, // IA scoring
  priority:  { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  value:     { type: Number, default: 0 }, // valor estimado del deal en USD

  // ---- Servicios de interes ----
  services: [{
    type: String,
    enum: ['maritimo_import', 'maritimo_export', 'aereo_import', 'aereo_export',
           'terrestre_usa', 'terrestre_nacional', 'despacho_aduanal', 'almacenaje', 'seguro_carga']
  }],
  routes: [{ origin: String, destination: String }], // rutas de interes

  // ---- Origen del lead ----
  source: {
    type: String,
    enum: ['linkedin', 'facebook', 'instagram', 'whatsapp', 'email', 'web', 'referral', 'cold_call', 'event', 'other'],
    default: 'other'
  },
  sourceDetail: { type: String }, // campaña especifica, nombre del referido, etc.
  utmSource:    { type: String },
  utmMedium:    { type: String },
  utmCampaign:  { type: String },

  // ---- Asignacion ----
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedAt: { type: Date },

  // ---- Comunicacion ----
  lastContactDate: { type: Date },
  nextFollowUpDate: { type: Date },
  daysSinceLastContact: { type: Number, default: 0 },
  
  // ---- Agente IA ----
  aiNotes:         { type: String }, // analisis del agente
  aiQualification: { type: String }, // razon del score
  autoReplySent:   { type: Boolean, default: false },
  
  // ---- Metadata ----
  tags:     [{ type: String }],
  notes:    { type: String },
  isActive: { type: Boolean, default: true },
  
  // ---- Integraciones externas ----
  externalIds: {
    whatsappConversationId: String,
    facebookLeadId:         String,
    linkedinProfileId:      String,
  },

}, { timestamps: true, toJSON: { virtuals: true } });

// Virtual: dias sin contacto
leadSchema.virtual('inactiveDays').get(function() {
  if (!this.lastContactDate) {
    return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
  }
  return Math.floor((Date.now() - this.lastContactDate) / (1000 * 60 * 60 * 24));
});

// Indices para busquedas rapidas
leadSchema.index({ assignedTo: 1, stage: 1 });
leadSchema.index({ company: 'text', contact: 'text', email: 'text' });
leadSchema.index({ createdAt: -1 });
leadSchema.index({ score: -1 });
leadSchema.index({ nextFollowUpDate: 1 });

module.exports = mongoose.model('Lead', leadSchema);
