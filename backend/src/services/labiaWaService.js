// ============================================
// WhatsApp vía Labia — adaptador del proveedor
// ============================================
//
// Labia (https://api.labiabot.com/v1) expone WhatsApp por encima de la Cloud API
// de Meta, más un canal no oficial por sesión QR. Este archivo implementa la
// MISMA superficie que whatsappMetaService, para que el CRM pueda cambiar de
// proveedor sin tocar ninguna pantalla ni ningún servicio: quien envía sigue
// llamando a sendText / sendTemplate / sendMedia (ver whatsappService.js).
//
// Lo que Labia resuelve respecto a hablar directo con Meta:
//   · Las plantillas no necesitan el WABA ID: se administran con la propia key.
//   · El límite de tasa es de 20 req/s en lugar del de Meta.
//   · Un mismo endpoint sirve al canal oficial y al no oficial (sesión QR).
//
// Variables de entorno (configurables desde el panel de Integraciones):
//   LABIA_API_KEY          — key `lb_live_…` del panel de Labia
//   LABIA_WEBHOOK_SECRET   — secreto `whsec_…` para validar los entrantes
//   LABIA_BASE_URL         — opcional, para apuntar a otra instancia
//   LABIA_PHONE_NUMBER_ID  — opcional, solo si la cuenta tiene varios números
//   LABIA_SESSION_ID       — opcional, fuerza el canal no oficial (solo texto)

const crypto = require('crypto');
const axios = require('axios');
const { secureCompare } = require('../utils/secureCompare');

const DEFAULT_BASE_URL = 'https://api.labiabot.com/v1';
// Meta expira los adjuntos entrantes, y la subida de salientes va por multipart:
// 16 MB es el tope que documenta Labia para POST /media.
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
// El encabezado de una plantilla va por otro endpoint y tiene su propio tope.
const MAX_TEMPLATE_HEADER_BYTES = 5 * 1024 * 1024;
// El reloj del emisor y el nuestro pueden ir desfasados; más de 5 minutos ya es
// un intento de repetición, no un desfase.
const WEBHOOK_TOLERANCE_S = 300;

const getKey = () => process.env.LABIA_API_KEY;
const getBaseUrl = () => (process.env.LABIA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

function isConfigured() {
  return !!getKey();
}

// El canal se elige una sola vez y se aplica a todos los envíos: si hay
// LABIA_SESSION_ID se usa la sesión QR (no oficial, solo texto), si no el
// número oficial indicado, y si no hay ninguno Labia resuelve el único que haya.
function channelOptions() {
  const sessionId = process.env.LABIA_SESSION_ID?.trim();
  if (sessionId) return { sessionId };
  const phoneNumberId = process.env.LABIA_PHONE_NUMBER_ID?.trim();
  return phoneNumberId ? { phoneNumberId } : {};
}

const isUnofficial = () => !!process.env.LABIA_SESSION_ID?.trim();

// ── Errores ─────────────────────────────────────────────────────────
//
// Labia devuelve códigos estables (`code`) además del texto. Se programa contra
// el código y se traduce a un mensaje que el ejecutivo pueda entender, marcando
// además los que el CRM ya sabe manejar: `windowClosed` hace que el chat cambie
// solo al modo plantillas.

const ERROR_MESSAGES = {
  invalid_request:       'Labia rechazó la petición: revisa el número y el contenido',
  AUTH_INVALID:          'La API Key de Labia es inválida o fue revocada',
  FORBIDDEN:             'La API Key de Labia no tiene permiso para esta operación',
  subscription_paused:   'La suscripción de Labia está pausada: regulariza el pago en su panel',
  number_not_allowed:    'La API Key de Labia no tiene acceso a ese número',
  no_channel:            'No hay ningún número de WhatsApp conectado en Labia',
  session_disconnected:  'La sesión de WhatsApp de Labia se desconectó: vuelve a escanear el QR',
  outside_24h_window:    'La ventana de 24 horas está cerrada: solo se pueden enviar plantillas aprobadas',
  template_rejected:     'Meta rechazó la plantilla; revisa su contenido',
  RATE_LIMIT_EXCEEDED:   'Se alcanzó el límite de envíos de Labia, reintenta en unos segundos',
  send_failed:           'Labia no pudo entregar el mensaje a Meta; se puede reintentar',
};

function toError(err) {
  const data = err.response?.data || {};
  const code = data.code;
  const error = new Error(ERROR_MESSAGES[code] || data.error || err.message);
  error.code = code;
  error.status = err.response?.status;
  // El CRM ya distingue estos dos casos: la ventana cerrada cambia la UI del
  // chat, y los pasajeros los reintenta quien llama.
  if (code === 'outside_24h_window') {
    error.windowClosed = true;
    error.status = 409; // mismo contrato que waWindow.assertOpen
  }
  error.retryable = ['RATE_LIMIT_EXCEEDED', 'send_failed'].includes(code)
    || error.status >= 500;
  if (err.response?.headers?.['retry-after']) {
    error.retryAfter = Number(err.response.headers['retry-after']) || null;
  }
  return error;
}

async function request(method, path, body, config = {}) {
  if (!isConfigured()) throw new Error('WhatsApp no configurado — falta LABIA_API_KEY');
  try {
    const r = await axios({
      method,
      url: getBaseUrl() + path,
      data: body,
      headers: { Authorization: `Bearer ${getKey()}`, ...(config.headers || {}) },
      timeout: config.timeout || 15000,
      responseType: config.responseType,
    });
    // Envelope { success, data }. Las descargas de media no lo usan.
    return config.responseType === 'arraybuffer' ? r : (r.data?.data ?? r.data);
  } catch (err) {
    throw toError(err);
  }
}

/** Normaliza el teléfono al formato que pide Labia: solo dígitos con país. */
function normalizePhone(phone) {
  // Idéntica regla que el proveedor de Meta: una sola forma de escribir un
  // número en todo el CRM, sin importar por dónde salga el mensaje.
  return require('./whatsappMetaService').normalizePhone(phone);
}

function requirePhone(to) {
  const phone = normalizePhone(to);
  if (!phone) throw new Error('Número de teléfono inválido');
  return phone;
}

// ── Envío ───────────────────────────────────────────────────────────

/**
 * Respuesta con la misma forma que la Cloud API de Meta ({ messages: [{ id }] }),
 * porque es lo que leen las rutas y el envío de campañas para guardar el id.
 */
function asMetaResponse(data, phone) {
  return { messages: [{ id: data?.wamid }], contacts: [{ wa_id: phone }] };
}

async function sendText(to, body) {
  const phone = requirePhone(to);
  const data = await request('POST', '/messages', {
    to: phone, type: 'text', text: body, ...channelOptions(),
  });
  return asMetaResponse(data, phone);
}

async function sendTemplate(to, templateName, languageCode = 'es_MX', components = []) {
  const phone = requirePhone(to);
  if (isUnofficial()) {
    throw new Error('La sesión QR de Labia no admite plantillas: usa el canal oficial');
  }
  const data = await request('POST', '/messages', {
    to: phone,
    type: 'template',
    template: { name: templateName, language: languageCode, components },
    ...channelOptions(),
  });
  return asMetaResponse(data, phone);
}

// Labia envía adjuntos por mediaId, no por URL pública. Para que el resto del
// CRM siga trabajando con URLs (que es como las guarda), aquí se descarga el
// archivo y se sube antes de enviarlo.
async function uploadFromUrl(url, filename) {
  const r = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    maxContentLength: MAX_MEDIA_BYTES,
  });
  const buffer = Buffer.from(r.data);
  if (buffer.length > MAX_MEDIA_BYTES) {
    throw new Error('El archivo supera los 16 MB que admite WhatsApp');
  }
  const mimeType = r.headers['content-type'] || 'application/octet-stream';
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename || 'archivo');

  const res = await fetch(`${getBaseUrl()}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getKey()}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `No se pudo subir el archivo a Labia (HTTP ${res.status})`);
  return json.data?.mediaId;
}

async function sendMedia(to, type, url, caption, filename) {
  const phone = requirePhone(to);
  if (isUnofficial()) {
    throw new Error('La sesión QR de Labia solo admite texto');
  }
  const mediaId = await uploadFromUrl(url, filename);
  if (!mediaId) throw new Error('Labia no devolvió el identificador del archivo');

  const data = await request('POST', '/messages', {
    to: phone,
    type: 'media',
    media: { mediaId, mediaType: type, caption, filename },
    ...channelOptions(),
  });
  return asMetaResponse(data, phone);
}

/**
 * Sube el archivo del encabezado de una plantilla y devuelve su `headerHandle`,
 * que es lo que hay que adjuntar al crearla. Va por su propio endpoint: no es
 * un adjunto de mensaje, es una muestra para que Meta apruebe el diseño.
 * @param {Buffer} buffer
 * @param {string} filename
 * @param {string} mimeType
 * @returns {Promise<string>}
 */
async function uploadTemplateHeader(buffer, filename, mimeType) {
  if (!isConfigured()) throw new Error('WhatsApp no configurado — falta LABIA_API_KEY');
  if (buffer.length > MAX_TEMPLATE_HEADER_BYTES) {
    throw new Error('El archivo del encabezado supera los 5 MB');
  }
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename || 'encabezado');

  const res = await fetch(`${getBaseUrl()}/templates/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getKey()}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `No se pudo subir el encabezado (HTTP ${res.status})`);
  const handle = json.data?.headerHandle;
  if (!handle) throw new Error('Labia no devolvió el identificador del encabezado');
  return handle;
}

/** Descarga un adjunto ENTRANTE por su id. Meta los expira, así que conviene pronto. */
async function downloadMedia(mediaId) {
  const r = await request('GET', `/media/${mediaId}`, undefined, {
    responseType: 'arraybuffer', timeout: 30000,
  });
  return {
    data: Buffer.from(r.data),
    mimeType: r.headers['content-type'] || 'application/octet-stream',
  };
}

// Labia no expone "marcar como leído": los entrantes se acusan al recibirlos.
// Se deja como no-op para no romper a quien lo llame con el otro proveedor.
async function markRead() {}

// ── Plantillas ──────────────────────────────────────────────────────

// El frontend (WaTemplateWizard, MarketingPage, TemplatesPage) lee las plantillas
// en el formato de Meta: components[] con BODY/HEADER/FOOTER. Labia puede
// devolverlas ya así o en su forma plana, así que se normaliza aquí y no en cada
// pantalla.
function toMetaTemplate(tpl) {
  if (Array.isArray(tpl.components)) return tpl;
  const components = [];
  if (tpl.headerFormat || tpl.headerText) {
    components.push({
      type: 'HEADER',
      format: (tpl.headerFormat || 'TEXT').toUpperCase(),
      ...(tpl.headerText ? { text: tpl.headerText } : {}),
    });
  }
  if (tpl.bodyText) components.push({ type: 'BODY', text: tpl.bodyText });
  if (tpl.footerText) components.push({ type: 'FOOTER', text: tpl.footerText });
  if (tpl.buttons?.length) components.push({ type: 'BUTTONS', buttons: tpl.buttons });
  return {
    id: tpl.id || tpl.templateId,
    name: tpl.name,
    language: tpl.language,
    category: tpl.category,
    status: (tpl.status || '').toUpperCase(),
    components,
  };
}

async function listTemplates() {
  const data = await request('GET', '/templates', undefined, { timeout: 10000 });
  const list = Array.isArray(data) ? data : (data?.templates || []);
  return list.map(toMetaTemplate);
}

/** Trae de Meta las plantillas creadas o aprobadas fuera del CRM. */
async function syncTemplates() {
  return request('POST', '/templates/sync', {});
}

/**
 * Crea una plantilla. Recibe los mismos campos que el creador del CRM manda al
 * proveedor de Meta, así que las pantallas no cambian.
 */
async function createTemplate({ name, language = 'es_MX', category = 'UTILITY',
  bodyText, headerText, headerFormat, headerHandle, footerText, examples, buttons }) {
  if (!bodyText?.trim()) throw new Error('La plantilla necesita cuerpo');

  // Meta exige el nombre en minúsculas con guiones bajos, lo pida Labia o no.
  const cleanName = String(name || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 512);
  if (!cleanName) throw new Error('La plantilla necesita nombre');

  const payload = { name: cleanName, category, language, bodyText: bodyText.trim() };
  if (headerText?.trim()) {
    payload.headerFormat = headerFormat || 'TEXT';
    payload.headerText = headerText.trim();
  } else if (headerHandle) {
    payload.headerFormat = headerFormat || 'IMAGE';
    payload.headerHandle = headerHandle;
  }
  if (footerText?.trim()) payload.footerText = footerText.trim();
  if (buttons?.length) payload.buttons = buttons;

  // Los ejemplos son obligatorios cuando el cuerpo lleva variables {{n}}.
  const nVars = new Set([...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1])).size;
  if (nVars > 0) {
    payload.examples = Array.from({ length: nVars },
      (_, i) => String(examples?.[i] || `Ejemplo ${i + 1}`));
  }

  const data = await request('POST', '/templates', payload);
  return { ...data, name: cleanName, status: data?.status || 'PENDING' };
}

// ── Cuenta ──────────────────────────────────────────────────────────

const numbers = () => request('GET', '/numbers', undefined, { timeout: 10000 });
const account = () => request('GET', '/account', undefined, { timeout: 10000 });

// ── Webhooks ────────────────────────────────────────────────────────

/**
 * Valida la firma de una entrega. Necesita el cuerpo CRUDO: el JSON
 * re-serializado cambia bytes y la firma deja de coincidir.
 * @param {Buffer|string} rawBody
 * @param {object} headers
 * @returns {boolean}
 */
function verifyWebhook(rawBody, headers) {
  const secret = process.env.LABIA_WEBHOOK_SECRET;
  if (!secret) return false;

  const timestamp = headers['x-labia-timestamp'];
  const signature = headers['x-labia-signature'] || '';
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > WEBHOOK_TOLERANCE_S) return false;

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  const expected = 'sha256=' + crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${body}`).digest('hex');
  return secureCompare(signature, expected);
}

/**
 * Normaliza un evento `message.received` a la forma de Meta que ya consume el
 * CRM: pares { msg, contact } listos para la misma función que atiende el
 * webhook de Meta. Cubre los dos canales, oficial y sesión QR.
 */
function parseInbound(data = {}) {
  const contactsById = {};
  for (const c of (data.contacts || [])) contactsById[c.wa_id] = c;

  return (data.messages || []).map((m) => {
    if (data.unofficial) {
      return {
        msg: {
          id: m.waId || m.id,
          from: m.from,
          type: m.type || 'text',
          text: typeof m.text === 'string' ? { body: m.text } : m.text,
          timestamp: m.timestamp,
        },
        contact: { wa_id: m.from, profile: { name: m.pushName || m.from } },
      };
    }
    // Canal oficial: ya viene en formato Meta.
    return { msg: m, contact: contactsById[m.from] };
  });
}

module.exports = {
  provider: 'labia',
  isConfigured,
  normalizePhone,
  sendText,
  sendTemplate,
  sendMedia,
  markRead,
  listTemplates,
  syncTemplates,
  createTemplate,
  uploadTemplateHeader,
  downloadMedia,
  numbers,
  account,
  verifyWebhook,
  parseInbound,
  isUnofficial,
};
