// ============================================
// Reventa de IA: tarifas, margen y registro de consumo
// ============================================
//
// Cada llamada a la IA deja un AiUsage con dos importes: lo que cuesta al
// proveedor y lo que se le cobra al CRM (costo + margen). El panel de super
// admin ve ambos; el CRM solo ve el precio.
//
// Las tarifas se configuran desde el panel. Los valores por defecto son los
// precios de lista de OpenAI a la fecha de escritura y sirven para que el
// sistema mida algo razonable desde el primer día, pero conviene revisarlos.

const { AiBillingConfig, AiPeriod } = require('../models/AiBilling');
const AiUsage = require('../models/AiUsage');
const { AI_AGENTS, getAgent } = require('../config/aiAgents');
const { getProvider } = require('../config/aiProviders');
const openRouterPricing = require('./openRouterPricing');

const DEFAULT_MARGIN_PCT = 40;

// Semilla mínima; los precios reales se bajan del catálogo de OpenRouter con
// syncPrices(). El audio se queda en 'manual' porque OpenRouter no lo publica.
const DEFAULT_MODELS = [
  { provider: 'openai',   model: 'gpt-4o-mini',    kind: 'chat',  inputPer1M: 0.15, outputPer1M: 0.60 },
  { provider: 'openai',   model: 'gpt-4o',         kind: 'chat',  inputPer1M: 2.50, outputPer1M: 10.00 },
  { provider: 'openai',   model: 'whisper-1',      kind: 'audio', perMinute: 0.006, priceSource: 'manual' },
  { provider: 'deepseek', model: 'deepseek-chat',  kind: 'chat',  inputPer1M: 0.20, outputPer1M: 0.80 },
];

const round6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Periodo de facturación al que pertenece una fecha ('AAAA-MM').
function periodOf(date = new Date()) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Config única; se crea con los valores por defecto la primera vez.
async function getConfig() {
  let config = await AiBillingConfig.findOne({ singleton: 'config' });
  if (!config) {
    config = await AiBillingConfig.create({
      singleton: 'config',
      defaultMarginPct: DEFAULT_MARGIN_PCT,
      models: DEFAULT_MODELS,
    });
  }
  return config;
}

async function updateConfig({ defaultMarginPct, models, agents, defaultChatModel, defaultAudioModel, defaultProvider }, userId) {
  const config = await getConfig();
  if (defaultProvider !== undefined) config.defaultProvider = getProvider(defaultProvider).id;
  if (defaultChatModel !== undefined)  config.defaultChatModel = String(defaultChatModel || '').trim() || 'gpt-4o-mini';
  if (defaultAudioModel !== undefined) config.defaultAudioModel = String(defaultAudioModel || '').trim() || 'whisper-1';
  if (Array.isArray(agents)) {
    // Solo se guardan agentes registrados: un id inventado no debe crear
    // configuración huérfana que nadie pueda ver ni borrar desde el panel.
    config.agents = agents
      .filter(a => getAgent(a.agent))
      .map(a => ({
        agent: a.agent,
        provider: a.provider ? getProvider(a.provider).id : '',
        model: String(a.model || '').trim(),
      }));
  }
  if (defaultMarginPct !== undefined) {
    const pct = Number(defaultMarginPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 1000) {
      throw new Error('El margen debe ser un número entre 0 y 1000');
    }
    config.defaultMarginPct = pct;
  }
  if (Array.isArray(models)) {
    config.models = models.map(m => ({
      provider: getProvider(m.provider).id,
      model: String(m.model || '').trim(),
      kind: m.kind === 'audio' ? 'audio' : 'chat',
      priceSource: m.priceSource === 'manual' ? 'manual' : 'auto',
      priceUpdatedAt: m.priceUpdatedAt,
      inputPer1M:  Math.max(0, Number(m.inputPer1M) || 0),
      outputPer1M: Math.max(0, Number(m.outputPer1M) || 0),
      perMinute:   Math.max(0, Number(m.perMinute) || 0),
      marginPct: m.marginPct === null || m.marginPct === undefined || m.marginPct === ''
        ? null
        : Math.max(0, Number(m.marginPct)),
    })).filter(m => m.model);
  }
  config.updatedBy = userId;
  await config.save();
  return config;
}

/**
 * Modelo que debe usar un agente: el asignado desde el panel, si no el que pide
 * el código, y si no el modelo por defecto del tipo (chat o audio).
 *
 * Se lee de la config en base de datos, así que un cambio en el panel aplica en
 * la siguiente llamada sin reiniciar nada.
 */
async function modelForAgent(agentId, requestedModel) {
  const config = await getConfig();
  const assignment = config.agents?.find(a => a.agent === agentId);
  const agent = getAgent(agentId);
  const isAudio = agent?.kind === 'audio';

  const model = assignment?.model
    || requestedModel
    || (isAudio
      ? (config.defaultAudioModel || 'whisper-1')
      : (config.defaultChatModel || process.env.OPENAI_MODEL || 'gpt-4o-mini'));

  // El audio solo lo sirve OpenAI (Whisper); el resto sigue al proveedor
  // asignado al agente o al global.
  const provider = isAudio
    ? 'openai'
    : (assignment?.provider || config.defaultProvider || 'openai');

  return { provider, model };
}

// Estado de todos los agentes para el panel: qué modelo usan y de dónde sale.
async function agentsWithModels() {
  const config = await getConfig();
  return AI_AGENTS.map(agent => {
    const assignment = config.agents?.find(a => a.agent === agent.id);
    const isAudio = agent.kind === 'audio';
    const fallbackModel = isAudio
      ? (config.defaultAudioModel || 'whisper-1')
      : (config.defaultChatModel || 'gpt-4o-mini');
    const fallbackProvider = isAudio ? 'openai' : (config.defaultProvider || 'openai');

    return {
      ...agent,
      // '' significa heredado del valor por defecto.
      model: assignment?.model || '',
      provider: assignment?.provider || '',
      effectiveModel: assignment?.model || fallbackModel,
      effectiveProvider: isAudio ? 'openai' : (assignment?.provider || fallbackProvider),
    };
  });
}

/**
 * Baja los precios del catálogo de OpenRouter y los aplica a la tabla de costos.
 * Es la referencia de costo para todos los proveedores.
 */
async function syncPrices(userId) {
  const config = await getConfig();
  const { models, updated, missing } = await openRouterPricing.applyCatalogPrices(config.models);
  config.models = models;
  config.pricesSyncedAt = new Date();
  config.updatedBy = userId;
  await config.save();
  return { updated, missing, syncedAt: config.pricesSyncedAt, models: config.models };
}

// Tarifa de un modelo. Si no está en la tabla se registra igual, con costo 0:
// mejor un registro visible con tarifa pendiente que perder el consumo.
function priceFor(config, model, provider) {
  const entry = config.models.find(m => m.model === model && (!provider || (m.provider || 'openai') === provider))
    || config.models.find(m => m.model === model);
  const marginPct = entry?.marginPct ?? config.defaultMarginPct ?? DEFAULT_MARGIN_PCT;
  return { entry, marginPct };
}

function computeCost(entry, { inputTokens = 0, outputTokens = 0, audioSeconds = 0 }) {
  if (!entry) return 0;
  if (entry.kind === 'audio') {
    return round6((audioSeconds / 60) * (entry.perMinute || 0));
  }
  return round6(
    (inputTokens / 1e6) * (entry.inputPer1M || 0) +
    (outputTokens / 1e6) * (entry.outputPer1M || 0)
  );
}

/**
 * Registra un consumo de IA. Nunca lanza: un fallo de contabilidad no debe
 * tumbar la función del CRM que estaba usando la IA.
 *
 * @param {object} data { feature, model, kind, inputTokens, outputTokens,
 *                        audioSeconds, user, lead, status, error, meta }
 * @returns {Promise<object|null>} el documento creado
 */
async function recordUsage(data) {
  try {
    const config = await getConfig();
    const { entry, marginPct } = priceFor(config, data.model, data.provider);

    const costUsd = computeCost(entry, data);
    const priceUsd = round6(costUsd * (1 + marginPct / 100));

    return await AiUsage.create({
      feature: data.feature || 'desconocido',
      provider: data.provider || 'openai',
      model: data.model,
      kind: data.kind || (entry?.kind ?? 'chat'),
      inputTokens: data.inputTokens || 0,
      outputTokens: data.outputTokens || 0,
      audioSeconds: data.audioSeconds || 0,
      costUsd,
      marginPct,
      priceUsd,
      user: data.user || undefined,
      lead: data.lead || undefined,
      period: periodOf(),
      status: data.status || 'ok',
      error: data.error,
      meta: data.meta,
    });
  } catch (err) {
    console.error('[aiBilling] no se pudo registrar el consumo:', err.message);
    return null;
  }
}

// Totales de un periodo calculados en vivo desde los usos.
async function computePeriodTotals(period) {
  const [totals] = await AiUsage.aggregate([
    { $match: { period, status: 'ok' } },
    { $group: {
      _id: null,
      calls: { $sum: 1 },
      inputTokens: { $sum: '$inputTokens' },
      outputTokens: { $sum: '$outputTokens' },
      audioSeconds: { $sum: '$audioSeconds' },
      costUsd: { $sum: '$costUsd' },
      priceUsd: { $sum: '$priceUsd' },
    } },
  ]);

  const byFeature = await AiUsage.aggregate([
    { $match: { period, status: 'ok' } },
    { $group: {
      _id: '$feature',
      calls: { $sum: 1 },
      costUsd: { $sum: '$costUsd' },
      priceUsd: { $sum: '$priceUsd' },
    } },
    { $sort: { priceUsd: -1 } },
  ]);

  const base = totals || { calls: 0, inputTokens: 0, outputTokens: 0, audioSeconds: 0, costUsd: 0, priceUsd: 0 };
  return {
    totals: {
      calls: base.calls,
      inputTokens: base.inputTokens,
      outputTokens: base.outputTokens,
      audioSeconds: base.audioSeconds,
      costUsd: round6(base.costUsd),
      priceUsd: round6(base.priceUsd),
      marginUsd: round6(base.priceUsd - base.costUsd),
    },
    byFeature: byFeature.map(f => ({
      feature: f._id,
      calls: f.calls,
      costUsd: round6(f.costUsd),
      priceUsd: round6(f.priceUsd),
    })),
  };
}

/**
 * Estado de un periodo. Si está cerrado devuelve los totales congelados; si
 * está abierto los calcula al vuelo.
 */
async function getPeriod(period) {
  const stored = await AiPeriod.findOne({ period }).populate('closedBy', 'name email').lean();
  if (stored?.status === 'closed') return stored;

  const live = await computePeriodTotals(period);
  return {
    period,
    status: 'open',
    ...live,
    closedAt: null,
    note: stored?.note,
  };
}

/**
 * Cierra un periodo: congela totales y desglose. No se pueden cerrar periodos
 * futuros ni el mes en curso a medias — solo meses ya terminados o el actual a
 * propósito, que es lo que se factura.
 */
async function closePeriod(period, userId, note) {
  const existing = await AiPeriod.findOne({ period });
  if (existing?.status === 'closed') {
    throw new Error(`El periodo ${period} ya está cerrado`);
  }
  if (period > periodOf()) {
    throw new Error('No se puede cerrar un periodo futuro');
  }

  const { totals, byFeature } = await computePeriodTotals(period);
  return AiPeriod.findOneAndUpdate(
    { period },
    { period, status: 'closed', totals, byFeature, closedAt: new Date(), closedBy: userId, note },
    { upsert: true, new: true }
  );
}

async function reopenPeriod(period) {
  const stored = await AiPeriod.findOne({ period });
  if (!stored || stored.status !== 'closed') throw new Error('El periodo no está cerrado');
  stored.status = 'open';
  stored.closedAt = null;
  stored.closedBy = null;
  await stored.save();
  return stored;
}

// Lista de periodos con actividad, del más reciente al más antiguo.
async function listPeriods() {
  const [used, stored] = await Promise.all([
    AiUsage.distinct('period'),
    AiPeriod.find().lean(),
  ]);
  const names = [...new Set([...used, ...stored.map(p => p.period), periodOf()])].sort().reverse();
  return Promise.all(names.map(getPeriod));
}

module.exports = {
  DEFAULT_MODELS,
  modelForAgent,
  agentsWithModels,
  syncPrices,
  periodOf,
  getConfig,
  updateConfig,
  recordUsage,
  computePeriodTotals,
  getPeriod,
  closePeriod,
  reopenPeriod,
  listPeriods,
  round2,
  round6,
};
