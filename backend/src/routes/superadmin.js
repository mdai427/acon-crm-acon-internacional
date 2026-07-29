// ============================================
// Panel de super admin — reventa de IA
// ============================================
// Solo el dueño de la plataforma: ve el costo real del proveedor, define el
// margen de reventa y cierra los periodos que se le facturan al CRM.
const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { superAdminOnly } = require('../services/superAdmin');
const AiUsage = require('../models/AiUsage');
const User = require('../models/User');
const aiBilling = require('../services/aiBilling');
const settings = require('../services/settingsService');
const openRouterPricing = require('../services/openRouterPricing');
const { AI_PROVIDERS, getProvider } = require('../config/aiProviders');
const { labelFor } = require('./aiUsage');

router.use(auth, superAdminOnly);

// ─────────────────────────────────────────
// GET /api/superadmin/overview — métricas del periodo y acumulado
// ─────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const period = req.query.period || aiBilling.periodOf();
    const [current, config, allTime, byModel, byUser] = await Promise.all([
      aiBilling.getPeriod(period),
      aiBilling.getConfig(),
      AiUsage.aggregate([
        { $match: { status: 'ok' } },
        { $group: { _id: null, calls: { $sum: 1 }, costUsd: { $sum: '$costUsd' }, priceUsd: { $sum: '$priceUsd' } } },
      ]),
      AiUsage.aggregate([
        { $match: { period, status: 'ok' } },
        { $group: { _id: '$model', calls: { $sum: 1 }, costUsd: { $sum: '$costUsd' }, priceUsd: { $sum: '$priceUsd' } } },
        { $sort: { costUsd: -1 } },
      ]),
      AiUsage.aggregate([
        { $match: { period, status: 'ok', user: { $ne: null } } },
        { $group: { _id: '$user', calls: { $sum: 1 }, costUsd: { $sum: '$costUsd' }, priceUsd: { $sum: '$priceUsd' } } },
        { $sort: { priceUsd: -1 } },
        { $limit: 20 },
      ]),
    ]);

    const users = await User.find({ _id: { $in: byUser.map(u => u._id) } }).select('name email').lean();
    const userById = Object.fromEntries(users.map(u => [String(u._id), u]));

    const total = allTime[0] || { calls: 0, costUsd: 0, priceUsd: 0 };
    const errors = await AiUsage.countDocuments({ period, status: 'error' });

    res.json({
      success: true,
      data: {
        period: current.period,
        status: current.status,
        closedAt: current.closedAt || null,
        defaultMarginPct: config.defaultMarginPct,
        totals: current.totals,
        byFeature: (current.byFeature || []).map(f => ({
          ...f,
          featureLabel: labelFor(f.feature),
          marginUsd: aiBilling.round6(f.priceUsd - f.costUsd),
        })),
        byModel: byModel.map(m => ({
          model: m._id,
          calls: m.calls,
          costUsd: aiBilling.round6(m.costUsd),
          priceUsd: aiBilling.round6(m.priceUsd),
          marginUsd: aiBilling.round6(m.priceUsd - m.costUsd),
        })),
        byUser: byUser.map(u => ({
          user: userById[String(u._id)] || { name: 'Usuario eliminado' },
          calls: u.calls,
          costUsd: aiBilling.round6(u.costUsd),
          priceUsd: aiBilling.round6(u.priceUsd),
        })),
        allTime: {
          calls: total.calls,
          costUsd: aiBilling.round6(total.costUsd),
          priceUsd: aiBilling.round6(total.priceUsd),
          marginUsd: aiBilling.round6(total.priceUsd - total.costUsd),
        },
        errors,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────
// GET /api/superadmin/usage — detalle con costo real
// ─────────────────────────────────────────
router.get('/usage', async (req, res) => {
  try {
    const period = req.query.period || aiBilling.periodOf();
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const filter = { period };
    if (req.query.feature) filter.feature = req.query.feature;
    if (req.query.status) filter.status = req.query.status;

    const [items, total] = await Promise.all([
      AiUsage.find(filter)
        .populate('user', 'name email')
        .populate('lead', 'company')
        .sort({ createdAt: -1 })
        .skip(skip).limit(limit).lean(),
      AiUsage.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items.map(u => ({ ...u, featureLabel: labelFor(u.feature) })),
      meta: { total, limit, skip },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────
// GET/PUT /api/superadmin/pricing — tarifas y margen de reventa
// ─────────────────────────────────────────
router.get('/pricing', async (req, res) => {
  try {
    const config = await aiBilling.getConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/pricing', async (req, res) => {
  try {
    const config = await aiBilling.updateConfig(req.body, req.user._id);
    res.json({ success: true, data: config, message: 'Tarifas actualizadas' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────
// GET /api/superadmin/ai — proveedor, modelos por defecto y agentes
// ─────────────────────────────────────────
const MASK = '••••••';
const mask = v => v ? (v.slice(0, 4) + MASK + v.slice(-3)) : '';

router.get('/ai', async (req, res) => {
  try {
    const [config, agents] = await Promise.all([
      aiBilling.getConfig(),
      aiBilling.agentsWithModels(),
    ]);

    res.json({
      success: true,
      data: {
        providers: AI_PROVIDERS.map(p => {
          const key = process.env[p.envKey];
          return {
            id: p.id,
            name: p.name,
            envKey: p.envKey,
            docs: p.docs,
            keyHint: p.keyHint,
            supportsAudio: p.supportsAudio,
            apiKeySet: !!key,
            apiKeyMask: key ? mask(key) : '',
          };
        }),
        defaultProvider: config.defaultProvider,
        defaultChatModel: config.defaultChatModel,
        defaultAudioModel: config.defaultAudioModel,
        pricesSyncedAt: config.pricesSyncedAt || null,
        agents,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────
// GET /api/superadmin/ai/models — catálogo de OpenRouter por proveedor
// ─────────────────────────────────────────
router.get('/ai/models', async (req, res) => {
  try {
    res.json({ success: true, data: await openRouterPricing.availableModels() });
  } catch (error) {
    res.status(502).json({
      success: false,
      message: `No se pudo leer el catálogo de OpenRouter: ${error.message}`,
    });
  }
});

// ─────────────────────────────────────────
// PUT /api/superadmin/ai — guarda clave, modelos por defecto y por agente
// ─────────────────────────────────────────
router.put('/ai', async (req, res) => {
  try {
    const { apiKeys, defaultProvider, defaultChatModel, defaultAudioModel, agents } = req.body || {};

    // Las claves viajan enmascaradas cuando el usuario no las tocó: esas se
    // ignoran para no destruir el valor real guardado.
    const keyUpdates = {};
    for (const provider of AI_PROVIDERS) {
      const value = apiKeys?.[provider.id];
      if (value && !value.includes(MASK)) keyUpdates[provider.envKey] = value;
    }
    if (Object.keys(keyUpdates).length) {
      await settings.setMany(keyUpdates, req.user._id, { includeSuperadminKeys: true });
    }

    await aiBilling.updateConfig(
      { defaultProvider, defaultChatModel, defaultAudioModel, agents },
      req.user._id
    );

    // OPENAI_MODEL sigue existiendo como respaldo para cualquier código que aún
    // lo lea; se mantiene alineado con el modelo de chat por defecto.
    if (defaultChatModel) {
      await settings.setMany({ OPENAI_MODEL: defaultChatModel }, req.user._id, { includeSuperadminKeys: true });
    }

    const [config, agentList] = await Promise.all([
      aiBilling.getConfig(),
      aiBilling.agentsWithModels(),
    ]);
    res.json({
      success: true,
      message: 'Configuración de IA guardada',
      data: {
        defaultProvider: config.defaultProvider,
        defaultChatModel: config.defaultChatModel,
        defaultAudioModel: config.defaultAudioModel,
        agents: agentList,
      },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────
// POST /api/superadmin/ai/test — llamada real mínima para validar la clave
// ─────────────────────────────────────────
router.post('/ai/test', async (req, res) => {
  const provider = getProvider(req.body?.provider || 'openai');
  if (!process.env[provider.envKey]) {
    return res.status(400).json({ success: false, message: `Configura primero la API Key de ${provider.name}` });
  }
  try {
    const aiClient = require('../services/aiClient');
    const config = await aiBilling.getConfig();
    const model = req.body?.model || config.defaultChatModel;

    // Llamada mínima real: es la única forma de saber si la clave sirve.
    const r = await aiClient.getClient(provider.id).chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'Responde solo "OK" en español' }],
      max_tokens: 5,
    });
    res.json({ success: true, message: `✅ ${provider.name} conectado — Modelo: ${r.model || model}` });
  } catch (e) {
    res.json({ success: false, message: `❌ ${provider.name}: ${e.message}` });
  }
});

// ─────────────────────────────────────────
// POST /api/superadmin/ai/prices/sync — precios desde el catálogo de OpenRouter
// ─────────────────────────────────────────
router.post('/ai/prices/sync', async (req, res) => {
  try {
    const result = await aiBilling.syncPrices(req.user._id);
    const detalle = result.missing.length
      ? ` (${result.missing.length} sin precio público: ${result.missing.join(', ')})`
      : '';
    res.json({
      success: true,
      message: `✅ ${result.updated.length} modelo(s) actualizados desde OpenRouter${detalle}`,
      data: result,
    });
  } catch (error) {
    res.status(502).json({ success: false, message: `No se pudo sincronizar: ${error.message}` });
  }
});

// ─────────────────────────────────────────
// Periodos de facturación
// ─────────────────────────────────────────
router.get('/periods', async (req, res) => {
  try {
    res.json({ success: true, data: await aiBilling.listPeriods() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/periods/:period/close', async (req, res) => {
  try {
    const closed = await aiBilling.closePeriod(req.params.period, req.user._id, req.body?.note);
    res.json({ success: true, data: closed, message: `Periodo ${req.params.period} cerrado` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/periods/:period/reopen', async (req, res) => {
  try {
    const reopened = await aiBilling.reopenPeriod(req.params.period);
    res.json({ success: true, data: reopened, message: `Periodo ${req.params.period} reabierto` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
