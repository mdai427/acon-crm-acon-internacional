// ============================================
// Twilio Voice — llamadas desde el navegador
// ============================================
//
// Flujo completo de una llamada saliente:
//
//   1. El navegador pide un token corto a GET /api/calls/token (accessToken).
//   2. El SDK de Twilio abre la llamada; Twilio pega a POST /api/calls/voice
//      (nuestro TwiML App) y le devolvemos un <Dial> hacia el cliente con
//      grabación activada.
//   3. Twilio avisa el fin de la llamada en POST /api/calls/status → duración.
//   4. Al quedar lista la grabación pega en POST /api/calls/recording →
//      descargamos el audio y lo transcribimos con Whisper (OpenAI).
//
// Todas las credenciales se leen de process.env, que settingsService hidrata
// desde la base de datos: se configuran desde el panel de Integraciones.

const twilio = require('twilio');
const { PUBLIC_BASE_URL } = require('../config/urls');

const TOKEN_TTL_SECONDS = 3600; // 1 hora: el SDK renueva antes de expirar

function config() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken:  process.env.TWILIO_AUTH_TOKEN,
    apiKeySid:    process.env.TWILIO_API_KEY_SID,
    apiKeySecret: process.env.TWILIO_API_KEY_SECRET,
    twimlAppSid:  process.env.TWILIO_TWIML_APP_SID,
    callerId:     process.env.TWILIO_CALLER_ID,
  };
}

function isConfigured() {
  const c = config();
  return !!(c.accountSid && c.authToken && c.apiKeySid && c.apiKeySecret && c.twimlAppSid && c.callerId);
}

function client() {
  const c = config();
  if (!c.accountSid || !c.authToken) throw new Error('Twilio sin configurar: faltan ACCOUNT_SID y AUTH_TOKEN');
  return twilio(c.accountSid, c.authToken);
}

// La identidad del cliente del navegador es el id del usuario del CRM. Así el
// webhook sabe quién llamó sin confiar en nada que venga del navegador.
function identityForUser(userId) {
  return `crm_${userId}`;
}

function userIdFromIdentity(identity) {
  const match = /^client:crm_([a-f0-9]{24})$/i.exec(String(identity || ''))
    || /^crm_([a-f0-9]{24})$/i.exec(String(identity || ''));
  return match ? match[1] : null;
}

/**
 * Token de acceso para el SDK del navegador. Corto y por usuario.
 */
function createVoiceToken(userId) {
  const c = config();
  if (!c.apiKeySid || !c.apiKeySecret || !c.twimlAppSid) {
    throw new Error('Twilio sin configurar: faltan API Key, API Secret o TwiML App SID');
  }

  const { AccessToken } = twilio.jwt;
  const identity = identityForUser(userId);
  const token = new AccessToken(c.accountSid, c.apiKeySid, c.apiKeySecret, {
    identity,
    ttl: TOKEN_TTL_SECONDS,
  });
  token.addGrant(new AccessToken.VoiceGrant({
    outgoingApplicationSid: c.twimlAppSid,
    incomingAllow: false, // por ahora solo llamadas salientes desde el CRM
  }));

  return { token: token.toJwt(), identity, expiresIn: TOKEN_TTL_SECONDS };
}

// Normaliza a E.164. Sin código de país se asume México (+52), que es el caso
// habitual de la operación.
function normalizePhone(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value.startsWith('+')) return '+' + value.slice(1).replace(/\D/g, '');
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `+52${digits}`;
  if (digits.startsWith('52') && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  return `+${digits}`;
}

/**
 * TwiML que conecta la llamada del navegador con el número del cliente y la graba.
 * `record-from-answer-dual` graba desde que contestan, en dos canales
 * (ejecutivo y cliente por separado), lo que mejora la transcripción.
 */
function buildDialTwiml({ to, callerId }) {
  const response = new twilio.twiml.VoiceResponse();
  const dial = response.dial({
    callerId: callerId || config().callerId,
    answerOnBridge: true,
    record: 'record-from-answer-dual',
    recordingStatusCallback: `${PUBLIC_BASE_URL}/api/calls/recording`,
    recordingStatusCallbackEvent: 'completed',
    recordingStatusCallbackMethod: 'POST',
    timeout: 30,
  });
  dial.number({
    statusCallback: `${PUBLIC_BASE_URL}/api/calls/status`,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST',
  }, to);
  return response.toString();
}

function sayErrorTwiml(message) {
  const response = new twilio.twiml.VoiceResponse();
  response.say({ language: 'es-MX' }, message);
  response.hangup();
  return response.toString();
}

/**
 * Valida que la petición venga realmente de Twilio (firma X-Twilio-Signature).
 * En desarrollo sin AUTH_TOKEN no se puede validar: se rechaza igualmente para
 * no dejar un webhook abierto.
 */
function validateWebhook(req) {
  const { authToken } = config();
  if (!authToken) return false;
  const signature = req.headers['x-twilio-signature'];
  if (!signature) return false;
  const url = `${PUBLIC_BASE_URL}${req.originalUrl}`;
  return twilio.validateRequest(authToken, signature, url, req.body || {});
}

/**
 * Descarga el audio de una grabación (la URL de Twilio requiere Basic Auth).
 * @returns {Promise<Buffer>}
 */
async function downloadRecording(recordingUrl) {
  const c = config();
  const axios = require('axios');
  const url = recordingUrl.endsWith('.mp3') ? recordingUrl : `${recordingUrl}.mp3`;
  const r = await axios.get(url, {
    responseType: 'arraybuffer',
    auth: { username: c.accountSid, password: c.authToken },
    timeout: 60000,
  });
  return Buffer.from(r.data);
}

/**
 * Transcribe un audio con Whisper. Usa la misma OPENAI_API_KEY del CRM.
 * @returns {Promise<{text: string, language: string, provider: string}>}
 */
async function transcribeAudio(buffer, filename = 'llamada.mp3') {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Falta OPENAI_API_KEY: la transcripción usa Whisper de OpenAI');
  }
  const { default: OpenAI, toFile } = await import('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const file = await toFile(buffer, filename, { type: 'audio/mpeg' });
  const result = await openai.audio.transcriptions.create({
    file,
    model: process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1',
    language: 'es',
  });

  return { text: result.text || '', language: 'es', provider: 'openai-whisper' };
}

module.exports = {
  isConfigured,
  config,
  client,
  createVoiceToken,
  identityForUser,
  userIdFromIdentity,
  normalizePhone,
  buildDialTwiml,
  sayErrorTwiml,
  validateWebhook,
  downloadRecording,
  transcribeAudio,
};
