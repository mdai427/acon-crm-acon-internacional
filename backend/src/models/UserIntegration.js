const mongoose = require('mongoose');

const userIntegrationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  provider: { type: String, enum: ['google', 'outlook'], required: true },
  providerEmail: { type: String },
  accessToken: { type: String },
  refreshToken: { type: String },
  expiresAt: { type: Date },
  scopes: [String],
}, { timestamps: true });

userIntegrationSchema.index({ userId: 1, provider: 1 }, { unique: true });

module.exports = mongoose.model('UserIntegration', userIntegrationSchema);
