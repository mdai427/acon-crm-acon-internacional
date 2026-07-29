const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  role: {
    type: String,
    // 'superadmin' es el dueño de la plataforma (panel de costos de IA), no un
    // rol del CRM: se crea solo desde el entorno (ver services/superAdmin).
    enum: ['superadmin', 'admin', 'direccion', 'gerencia', 'executive', 'operaciones', 'marketing', 'finanzas', 'viewer'],
    default: 'executive'
  },
  phone:    { type: String },
  avatar:   { type: String },
  isActive: { type: Boolean, default: true },
  // Stats del ejecutivo
  stats: {
    totalLeads:    { type: Number, default: 0 },
    closedDeals:   { type: Number, default: 0 },
    revenue:       { type: Number, default: 0 },
    conversionRate:{ type: Number, default: 0 }
  },
  // Configuracion de notificaciones
  notifications: {
    whatsapp:    { type: Boolean, default: true },
    email:       { type: Boolean, default: true },
    inactivity:  { type: Number, default: 3 }, // dias
  },

  // Reglas de comisión personalizadas por tipo de lead y servicio
  // leadType: 'campaign' = lead de campaña pagada, 'direct' = prospectado por el ejecutivo, 'referral' = recomendación
  commissionRules: {
    campaign: {
      maritimo_import:    { type: Number, default: null },
      maritimo_export:    { type: Number, default: null },
      aereo_import:       { type: Number, default: null },
      aereo_export:       { type: Number, default: null },
      terrestre_usa:      { type: Number, default: null },
      terrestre_nacional: { type: Number, default: null },
      despacho_aduanal:   { type: Number, default: null },
      almacenaje:         { type: Number, default: null },
      seguro_carga:       { type: Number, default: null },
      otro:               { type: Number, default: null },
    },
    direct: {
      maritimo_import:    { type: Number, default: null },
      maritimo_export:    { type: Number, default: null },
      aereo_import:       { type: Number, default: null },
      aereo_export:       { type: Number, default: null },
      terrestre_usa:      { type: Number, default: null },
      terrestre_nacional: { type: Number, default: null },
      despacho_aduanal:   { type: Number, default: null },
      almacenaje:         { type: Number, default: null },
      seguro_carga:       { type: Number, default: null },
      otro:               { type: Number, default: null },
    },
    referral: {
      maritimo_import:    { type: Number, default: null },
      maritimo_export:    { type: Number, default: null },
      aereo_import:       { type: Number, default: null },
      aereo_export:       { type: Number, default: null },
      terrestre_usa:      { type: Number, default: null },
      terrestre_nacional: { type: Number, default: null },
      despacho_aduanal:   { type: Number, default: null },
      almacenaje:         { type: Number, default: null },
      seguro_carga:       { type: Number, default: null },
      otro:               { type: Number, default: null },
    },
  },
  lastLogin: { type: Date },
}, { timestamps: true });

// Hash password antes de guardar
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

userSchema.index({ isActive: 1, role: 1 }); // team reports filter

module.exports = mongoose.model('User', userSchema);
