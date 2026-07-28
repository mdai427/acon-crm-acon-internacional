const mongoose = require('mongoose');

/**
 * ERP provider configuration.
 * Supports SAP B1, CONTPAQi, Aspel, and a generic webhook provider.
 */
const erpConfigSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    enum: ['sap_b1', 'contpaqui', 'aspel', 'odoo', 'webhook_generic'],
    unique: true,
  },
  isEnabled: { type: Boolean, default: false },
  displayName: { type: String },

  // Connection settings (provider-specific, stored encrypted in prod)
  settings: {
    // SAP B1 (Service Layer)
    serviceLayerUrl:  String, // e.g. https://sap-server:50000/b1s/v1
    companyDB:        String,
    userName:         String,
    password:         String, // Should be encrypted at rest in production

    // CONTPAQi / Aspel (ODBC / REST)
    host:             String,
    port:             Number,
    database:         String,
    username:         String,
    password2:        String, // separate field to avoid collision with SAP

    // Generic webhook
    webhookUrl:       String,
    webhookSecret:    String,
    webhookHeaders:   { type: mongoose.Schema.Types.Mixed },
  },

  // What data to sync
  syncOptions: {
    customers:  { type: Boolean, default: true },  // push clients to ERP
    invoices:   { type: Boolean, default: false }, // pull invoices
    products:   { type: Boolean, default: false }, // pull product catalog
  },

  lastSync:     Date,
  lastSyncStatus: { type: String, enum: ['success', 'error', 'pending'], default: 'pending' },
  lastSyncMessage: String,

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('ERPConfig', erpConfigSchema);
