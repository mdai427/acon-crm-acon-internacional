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

const DEFAULT_MARGIN_PCT = 40;

// USD por millón de tokens (chat) o por minuto (audio).
const DEFAULT_MODELS = [
  { model: 'gpt-4o-mini', kind: 'chat',  inputPer1M: 0.15, outputPer1M: 0.60 },
  { model: 'gpt-4o',      kind: 'chat',  inputPer1M: 2.50, outputPer1M: 10.00 },
  { model: 'gpt-4.1-mini',kind: 'chat',  inputPer1M: 0.40, outputPer1M: 1.60 },
  { model: 'gpt-4.1',     kind: 'chat',  inputPer1M: 2.00, outputPer1M: 8.00 },
  { model: 'whisper-1',   kind: 'audio', perMinute: 0.006 },
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

async function updateConfig({ defaultMarginPct, models }, userId) {
  const config = await getConfig();
  if (defaultMarginPct !== undefined) {
    const pct = Number(defaultMarginPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 1000) {
      throw new Error('El margen debe ser un número entre 0 y 1000');
    }
    config.defaultMarginPct = pct;
  }
  if (Array.isArray(models)) {
    config.models = models.map(m => ({
      model: String(m.model || '').trim(),
      kind: m.kind === 'audio' ? 'audio' : 'chat',
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

// Tarifa de un modelo. Si no está en la tabla se registra igual, con costo 0:
// mejor un registro visible con tarifa pendiente que perder el consumo.
function priceFor(config, model) {
  const entry = config.models.find(m => m.model === model);
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
    const { entry, marginPct } = priceFor(config, data.model);

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
