// ============================================
// Cliente de IA instrumentado
// ============================================
//
// Único punto por donde el CRM habla con OpenAI. Envuelve al SDK para que cada
// llamada quede contabilizada (tokens, costo real y precio con margen) sin que
// cada módulo tenga que acordarse de registrarlo.
//
// Uso:
//   const ai = require('./aiClient');
//   const r = await ai.chat({ feature: 'lead_scoring', user, lead, messages, ... });
//   r.content  → texto de la respuesta
//   r.raw      → respuesta completa del SDK, por si hace falta

const OpenAI = require('openai');
const aiBilling = require('./aiBilling');

let client = null;
let clientKey = null;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurada');
  // La key puede cambiar en caliente desde el panel de integraciones.
  if (!client || clientKey !== apiKey) {
    client = new OpenAI({ apiKey });
    clientKey = apiKey;
  }
  return client;
}

const isConfigured = () => !!process.env.OPENAI_API_KEY;
const defaultModel = () => process.env.OPENAI_MODEL || 'gpt-4o-mini';

/**
 * Chat completion contabilizado.
 *
 * @param {object} opts feature (obligatorio), user, lead, meta y cualquier
 *                      parámetro del SDK (model, messages, temperature…).
 */
async function chat({ feature, user, lead, meta, ...params }) {
  const model = params.model || defaultModel();
  const started = Date.now();

  try {
    const response = await getClient().chat.completions.create({ ...params, model });
    const usage = response.usage || {};

    await aiBilling.recordUsage({
      feature, model, kind: 'chat', user, lead,
      inputTokens:  usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      meta: { ...meta, ms: Date.now() - started },
    });

    return { content: response.choices?.[0]?.message?.content || '', raw: response };
  } catch (error) {
    // El intento fallido también se registra (sin costo) para poder investigar
    // errores de cuota o de modelo desde el panel.
    await aiBilling.recordUsage({
      feature, model, kind: 'chat', user, lead,
      status: 'error', error: error.message,
      meta: { ...meta, ms: Date.now() - started },
    });
    throw error;
  }
}

/**
 * Transcripción de audio contabilizada (Whisper).
 *
 * @param {Buffer} buffer audio
 * @param {object} opts feature, user, lead, filename, model, language, durationSeconds
 */
async function transcribe(buffer, { feature, user, lead, meta, filename = 'audio.mp3',
  model, language = 'es', durationSeconds = 0 } = {}) {
  const usedModel = model || process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';
  const started = Date.now();

  try {
    const { toFile } = require('openai');
    const file = await toFile(buffer, filename, { type: 'audio/mpeg' });
    const result = await getClient().audio.transcriptions.create({ file, model: usedModel, language });

    await aiBilling.recordUsage({
      feature, model: usedModel, kind: 'audio', user, lead,
      audioSeconds: durationSeconds,
      meta: { ...meta, ms: Date.now() - started },
    });

    return { text: result.text || '', language, provider: `openai-${usedModel}`, raw: result };
  } catch (error) {
    await aiBilling.recordUsage({
      feature, model: usedModel, kind: 'audio', user, lead,
      audioSeconds: durationSeconds, status: 'error', error: error.message,
      meta: { ...meta, ms: Date.now() - started },
    });
    throw error;
  }
}

module.exports = { chat, transcribe, isConfigured, defaultModel, getClient };
