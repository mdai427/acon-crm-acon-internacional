// ============================================
// Precios de referencia desde OpenRouter
// ============================================
//
// OpenRouter publica el precio de casi todos los modelos del mercado en una
// sola API abierta (no requiere clave para leerla). Se usa como fuente única de
// costos: da igual por qué proveedor se llame al modelo, el costo de referencia
// sale de aquí. Así no hay que mantener a mano una tabla de precios que cambia
// cada pocas semanas.
//
// La API devuelve el precio en USD **por token** como texto:
//   { id: 'openai/gpt-4o-mini', pricing: { prompt: '0.00000015', completion: '0.0000006' } }
// El sistema trabaja en USD por millón de tokens, así que se multiplica por 1e6.

const axios = require('axios');
const { AI_PROVIDERS, openRouterIdFor } = require('../config/aiProviders');

const CATALOG_URL = 'https://openrouter.ai/api/v1/models';
const CACHE_TTL_MS = 10 * 60 * 1000; // el catálogo cambia poco; 10 min basta

let cache = { at: 0, models: [] };

const perMillion = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 1e6 * 1e6) / 1e6 : 0;
};

/**
 * Catálogo completo de OpenRouter, normalizado.
 * @returns {Promise<Array<{id, name, provider, inputPer1M, outputPer1M, contextLength}>>}
 */
async function fetchCatalog({ force = false } = {}) {
  if (!force && cache.models.length && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.models;
  }

  const headers = {};
  // La clave es opcional para leer el catálogo, pero si está configurada se
  // envía: da límites de tasa más holgados.
  if (process.env.OPENROUTER_API_KEY) {
    headers.Authorization = `Bearer ${process.env.OPENROUTER_API_KEY}`;
  }

  const r = await axios.get(CATALOG_URL, { headers, timeout: 20000 });
  const models = (r.data?.data || []).map(m => ({
    id: m.id,
    name: m.name || m.id,
    provider: String(m.id).split('/')[0],
    inputPer1M: perMillion(m.pricing?.prompt),
    outputPer1M: perMillion(m.pricing?.completion),
    contextLength: m.context_length || null,
  }));

  cache = { at: Date.now(), models };
  return models;
}

/**
 * Precio de referencia de un modelo concreto.
 * @param {string} providerId proveedor por el que se llamará al modelo
 * @param {string} model      nombre del modelo tal y como lo usa ese proveedor
 */
async function priceFor(providerId, model) {
  const catalog = await fetchCatalog();
  const wanted = openRouterIdFor(providerId, model);
  return catalog.find(m => m.id === wanted) || null;
}

/**
 * Actualiza los precios de la tabla con los del catálogo.
 *
 * Respeta las entradas marcadas como `manual`, que son las que el super admin
 * fijó a mano — típicamente los modelos de audio, que OpenRouter no lista.
 *
 * @param {Array} models entradas actuales de la config
 * @returns {Promise<{models: Array, updated: Array, missing: Array}>}
 */
async function applyCatalogPrices(models) {
  const catalog = await fetchCatalog({ force: true });
  const byId = Object.fromEntries(catalog.map(m => [m.id, m]));

  const updated = [];
  const missing = [];

  const next = models.map(entry => {
    // Un precio fijado a mano por el super admin manda sobre el catálogo.
    if (entry.priceSource === 'manual') return entry;
    if (entry.kind === 'audio') {
      // OpenRouter no publica precios de transcripción: se dejan como están.
      if (!missing.includes(entry.model)) missing.push(entry.model);
      return entry;
    }

    const match = byId[openRouterIdFor(entry.provider || 'openai', entry.model)];
    if (!match) {
      missing.push(entry.model);
      return entry;
    }

    updated.push({
      model: entry.model,
      inputPer1M: match.inputPer1M,
      outputPer1M: match.outputPer1M,
    });
    return {
      ...(entry.toObject ? entry.toObject() : entry),
      inputPer1M: match.inputPer1M,
      outputPer1M: match.outputPer1M,
      priceSource: 'auto',
      priceUpdatedAt: new Date(),
    };
  });

  return { models: next, updated, missing };
}

/**
 * Modelos disponibles para elegir en el panel, agrupados por proveedor.
 * Para OpenAI y DeepSeek se filtran los del catálogo que pertenecen a ese
 * proveedor; para OpenRouter se ofrece el catálogo completo.
 */
async function availableModels() {
  const catalog = await fetchCatalog();
  return AI_PROVIDERS.map(provider => {
    const models = provider.id === 'openrouter'
      ? catalog
      : catalog.filter(m => m.provider === provider.id);

    return {
      provider: provider.id,
      providerName: provider.name,
      models: models
        .map(m => ({
          // Para OpenAI/DeepSeek el nombre real no lleva el prefijo del catálogo.
          model: provider.id === 'openrouter' ? m.id : m.id.split('/').slice(1).join('/'),
          label: m.name,
          inputPer1M: m.inputPer1M,
          outputPer1M: m.outputPer1M,
        }))
        .sort((a, b) => a.model.localeCompare(b.model)),
    };
  });
}

module.exports = { fetchCatalog, priceFor, applyCatalogPrices, availableModels, CATALOG_URL };
