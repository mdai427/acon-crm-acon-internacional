const mongoose = require('mongoose');

const exchangeRateSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // YYYY-MM-DD
  rate: { type: Number, required: true },               // MXN por 1 USD (DOF)
  source: { type: String, enum: ['dof', 'manual'], default: 'dof' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // solo si manual
}, { timestamps: true });

exchangeRateSchema.index({ date: -1 });

module.exports = mongoose.model('ExchangeRate', exchangeRateSchema);
