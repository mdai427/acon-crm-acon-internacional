const express = require('express');
const router = express.Router();
const ERPConfig = require('../models/ERPConfig');
const { auth } = require('../middleware/auth');
const { checkPerm } = require('../middleware/auth');

const ERP_PROVIDERS = [
  {
    id: 'sap_b1',
    name: 'SAP Business One',
    logo: '🔵',
    description: 'Integración vía Service Layer REST API. Sincroniza clientes, facturas y pedidos.',
    docUrl: 'https://help.sap.com/docs/SAP_BUSINESS_ONE',
    fields: [
      { key: 'settings.serviceLayerUrl', label: 'Service Layer URL', placeholder: 'https://sap-server:50000/b1s/v1', type: 'url' },
      { key: 'settings.companyDB', label: 'Base de datos', placeholder: 'SBODEMOUS', type: 'text' },
      { key: 'settings.userName', label: 'Usuario SAP', placeholder: 'manager', type: 'text' },
      { key: 'settings.password', label: 'Contraseña', type: 'password' },
    ],
  },
  {
    id: 'contpaqui',
    name: 'CONTPAQi Comercial',
    logo: '🟠',
    description: 'Conexión ODBC/REST para sincronizar clientes y facturas CONTPAQi.',
    fields: [
      { key: 'settings.host', label: 'Servidor', placeholder: '192.168.1.100', type: 'text' },
      { key: 'settings.port', label: 'Puerto', placeholder: '3306', type: 'number' },
      { key: 'settings.database', label: 'Base de datos', placeholder: 'ContaEmpresa', type: 'text' },
      { key: 'settings.username', label: 'Usuario', type: 'text' },
      { key: 'settings.password2', label: 'Contraseña', type: 'password' },
    ],
  },
  {
    id: 'aspel',
    name: 'Aspel SAE / COI',
    logo: '🟢',
    description: 'Integración con Aspel SAE para clientes y COI para contabilidad.',
    fields: [
      { key: 'settings.host', label: 'Servidor', placeholder: '192.168.1.100', type: 'text' },
      { key: 'settings.port', label: 'Puerto', placeholder: '3306', type: 'number' },
      { key: 'settings.database', label: 'Base de datos', placeholder: 'SAE_EMPRESA', type: 'text' },
      { key: 'settings.username', label: 'Usuario', type: 'text' },
      { key: 'settings.password2', label: 'Contraseña', type: 'password' },
    ],
  },
  {
    id: 'odoo',
    name: 'Odoo',
    logo: '🟣',
    description: 'Integración con Odoo via XML-RPC / REST. Sincroniza clientes y órdenes.',
    fields: [
      { key: 'settings.serviceLayerUrl', label: 'URL de Odoo', placeholder: 'https://miempresa.odoo.com', type: 'url' },
      { key: 'settings.companyDB', label: 'Base de datos', type: 'text' },
      { key: 'settings.userName', label: 'Email de usuario', type: 'email' },
      { key: 'settings.password', label: 'API Key / Contraseña', type: 'password' },
    ],
  },
  {
    id: 'webhook_generic',
    name: 'Webhook Genérico',
    logo: '🔗',
    description: 'Envía datos de clientes/operaciones a cualquier endpoint HTTP.',
    fields: [
      { key: 'settings.webhookUrl', label: 'URL del webhook', placeholder: 'https://mi-erp.com/api/webhook', type: 'url' },
      { key: 'settings.webhookSecret', label: 'Secret (X-Webhook-Secret)', type: 'password' },
    ],
  },
];

// GET /api/erp/providers — list of available providers + their config status
router.get('/providers', auth, async (req, res) => {
  try {
    const configs = await ERPConfig.find().lean();
    const configMap = Object.fromEntries(configs.map(c => [c.provider, c]));
    const result = ERP_PROVIDERS.map(p => ({
      ...p,
      config: configMap[p.id] || null,
    }));
    res.json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PUT /api/erp/providers/:providerId — save/update config (admin/gerencia)
router.put('/providers/:providerId', auth, checkPerm('integrations.manage'), async (req, res) => {
  try {
    const { providerId } = req.params;
    const validIds = ERP_PROVIDERS.map(p => p.id);
    if (!validIds.includes(providerId)) {
      return res.status(400).json({ success: false, message: 'Provider inválido' });
    }

    const { isEnabled, settings, syncOptions, displayName } = req.body;
    const config = await ERPConfig.findOneAndUpdate(
      { provider: providerId },
      { isEnabled, settings, syncOptions, displayName, createdBy: req.user._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, data: config });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// POST /api/erp/providers/:providerId/test — test connection
router.post('/providers/:providerId/test', auth, checkPerm('integrations.manage'), async (req, res) => {
  try {
    const config = await ERPConfig.findOne({ provider: req.params.providerId }).lean();
    if (!config) return res.status(404).json({ success: false, message: 'No hay configuración para este provider' });

    let testResult = { ok: false, message: 'Conexión no implementada para este provider en este entorno.' };

    // For webhook_generic, test with a GET to the URL
    if (config.provider === 'webhook_generic' && config.settings?.webhookUrl) {
      try {
        const axios = require('axios');
        await axios.get(config.settings.webhookUrl, { timeout: 5000 });
        testResult = { ok: true, message: 'Endpoint responde correctamente' };
      } catch (err) {
        testResult = { ok: false, message: `Error al conectar: ${err.message}` };
      }
    }

    // Update last sync status
    await ERPConfig.findOneAndUpdate(
      { provider: req.params.providerId },
      { lastSync: new Date(), lastSyncStatus: testResult.ok ? 'success' : 'error', lastSyncMessage: testResult.message }
    );

    res.json({ success: true, data: testResult });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
