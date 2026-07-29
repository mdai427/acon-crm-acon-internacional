// ============================================
// Cliente de IA instrumentado (multi-proveedor)
// ============================================
//
// Único punto por donde el CRM habla con la IA. Envuelve al SDK para que cada
// llamada quede contabilizada (tokens, costo real y precio con margen) sin que
// cada módulo tenga que acordarse de registrarlo.
//
// El proveedor y el modelo de cada agente los define el super admin desde el
// panel de plataforma (ver services/aiBilling y config/aiProviders): lo que el
// código pide es solo una preferencia por defecto.
//
// Uso:
//   const ai = require('./aiClient');
//   const r = await ai.chat({ feature: 'lead_scoring', user, lead, messages, ... });
//   r.content  → texto de la respuesta
//   r.raw      → respuesta completa del SDK, por si hace falta

const OpenAI = require('openai');
const aiBilling = require('./aiBilling');
const { getProvider, isProviderReady } = require('../config/aiProviders');

// Un cliente por proveedor. Se recrea si cambia la clave (el panel las aplica
// en caliente sobre process.env).
const clients = new Map();

function getClient(providerId = 'openai') {
  const provider = getProvider(providerId);
  const apiKey = process.env[provider.envKey];
  if (!apiKey) throw new Error(`${provider.name} sin configurar: falta ${provider.envKey}`);

  const cached = clients.get(provider.id);
  if (cached && cached.apiKey === apiKey) return cached.client;

  const client = new OpenAI({ apiKey, baseURL: provider.baseURL });
  clients.set(provider.id, { apiKey, client });
  return client;
}

// ¿Hay al menos un proveedor listo para usarse?
const isConfigured = () => ['openai', 'openrouter', 'deepseek'].some(isProviderReady);

const defaultModel = () => process.env.OPENAI_MODEL || 'gpt-4o-mini';

/**
 * Chat completion contabilizado.
 *
 * @param {object} opts feature (obligatorio), user, lead, meta y cualquier
 *                      parámetro del SDK (model, messages, temperature…).
 */
async function chat({ feature, user, lead, meta, ...params }) {
  const { provider, model } = await aiBilling.modelForAgent(feature, params.model);
  const started = Date.now();

  try {
    const response = await getClient(provider).chat.completions.create({ ...params, model });
    const usage = response.usage || {};

    await aiBilling.recordUsage({
      feature, model, provider, kind: 'chat', user, lead,
      inputTokens:  usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      meta: { ...meta, ms: Date.now() - started },
    });

    return { content: response.choices?.[0]?.message?.content || '', raw: response };
  } catch (error) {
    // El intento fallido también se registra (sin costo) para poder investigar
    // errores de cuota o de modelo desde el panel.
    await aiBilling.recordUsage({
      feature, model, provider, kind: 'chat', user, lead,
      status: 'error', error: error.message,
      meta: { ...meta, ms: Date.now() - started },
    });
    throw error;
  }
}

/**
 * Transcripción de audio contabilizada (Whisper, solo OpenAI).
 *
 * @param {Buffer} buffer audio
 * @param {object} opts feature, user, lead, filename, model, language, durationSeconds
 */
async function transcribe(buffer, { feature, user, lead, meta, filename = 'audio.mp3',
  model, language = 'es', durationSeconds = 0 } = {}) {
  const { provider, model: usedModel } = await aiBilling.modelForAgent(
    feature, model || process.env.OPENAI_TRANSCRIBE_MODEL
  );
  const started = Date.now();

  try {
    const { toFile } = require('openai');
    const file = await toFile(buffer, filename, { type: 'audio/mpeg' });
    const result = await getClient(provider).audio.transcriptions.create({ file, model: usedModel, language });

    await aiBilling.recordUsage({
      feature, model: usedModel, provider, kind: 'audio', user, lead,
      audioSeconds: durationSeconds,
      meta: { ...meta, ms: Date.now() - started },
    });

    return { text: result.text || '', language, provider: `${provider}-${usedModel}`, raw: result };
  } catch (error) {
    await aiBilling.recordUsage({
      feature, model: usedModel, provider, kind: 'audio', user, lead,
      audioSeconds: durationSeconds, status: 'error', error: error.message,
      meta: { ...meta, ms: Date.now() - started },
    });
    throw error;
  }
}

module.exports = { chat, transcribe, isConfigured, defaultModel, getClient };
