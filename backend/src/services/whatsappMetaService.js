/**
 * WhatsApp Meta Cloud API Service — ACON CRM
 *
 * Required env vars:
 *   WHATSAPP_TOKEN          — Permanent system user token from Meta Business Manager
 *   WHATSAPP_PHONE_NUMBER_ID — Phone number ID from Meta Business Manager
 *   WHATSAPP_VERIFY_TOKEN   — Any string, used to verify webhook
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
const axios = require('axios');

const BASE_URL = 'https://graph.facebook.com/v19.0';

function getPhoneId() {
  return process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.META_WA_PHONE_ID;
}

function getToken() {
  return process.env.WHATSAPP_TOKEN || process.env.META_WA_TOKEN;
}

function isConfigured() {
  return !!(getToken() && getPhoneId());
}

function headers() {
  return {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  };
}

/** Normalize phone: ensure international format, strip non-digits */
function normalizePhone(phone) {
  if (!phone) return null;
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('0')) p = p.slice(1);
  if (p.length === 10) p = `52${p}`; // default MX
  return p.length >= 10 ? p : null;
}

/**
 * Send a plain text message.
 * @param {string} to   — phone number (will be normalized)
 * @param {string} body — message text (max 4096 chars)
 */
async function sendText(to, body) {
  const phone = normalizePhone(to);
  if (!phone) throw new Error('Número de teléfono inválido');
  if (!isConfigured()) throw new Error('WhatsApp no configurado — falta WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID');

  const r = await axios.post(
    `${BASE_URL}/${getPhoneId()}/messages`,
    {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { preview_url: false, body },
    },
    { headers: headers(), timeout: 10000 }
  );
  return r.data;
}

/**
 * Send an approved template message.
 * @param {string} to           — phone number
 * @param {string} templateName — approved template name
 * @param {string} languageCode — 'es_MX' | 'en_US'
 * @param {Array}  components   — template components (header/body params)
 */
async function sendTemplate(to, templateName, languageCode = 'es_MX', components = []) {
  const phone = normalizePhone(to);
  if (!phone) throw new Error('Número de teléfono inválido');
  if (!isConfigured()) throw new Error('WhatsApp no configurado');

  const r = await axios.post(
    `${BASE_URL}/${getPhoneId()}/messages`,
    {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: { name: templateName, language: { code: languageCode }, components },
    },
    { headers: headers(), timeout: 10000 }
  );
  return r.data;
}

/**
 * Send a media message (image, document, audio, video).
 * @param {string} to
 * @param {'image'|'document'|'audio'|'video'} type
 * @param {string} url           — public URL to the media
 * @param {string} [caption]
 * @param {string} [filename]    — for documents
 */
async function sendMedia(to, type, url, caption, filename) {
  const phone = normalizePhone(to);
  if (!phone) throw new Error('Número de teléfono inválido');
  if (!isConfigured()) throw new Error('WhatsApp no configurado');

  const media = { link: url };
  if (caption) media.caption = caption;
  if (filename && type === 'document') media.filename = filename;

  const r = await axios.post(
    `${BASE_URL}/${getPhoneId()}/messages`,
    { messaging_product: 'whatsapp', to: phone, type, [type]: media },
    { headers: headers(), timeout: 10000 }
  );
  return r.data;
}

/**
 * Mark a message as read.
 * @param {string} messageId — wa_id from the incoming webhook
 */
async function markRead(messageId) {
  if (!isConfigured()) return;
  await axios.post(
    `${BASE_URL}/${getPhoneId()}/messages`,
    { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
    { headers: headers(), timeout: 5000 }
  );
}

/**
 * List approved message templates.
 */
async function listTemplates() {
  if (!isConfigured()) return [];
  const wabaId = process.env.WHATSAPP_WABA_ID;
  if (!wabaId) return [];
  const r = await axios.get(
    `${BASE_URL}/${wabaId}/message_templates`,
    { headers: headers(), timeout: 10000 }
  );
  return r.data.data || [];
}

/**
 * Crea una plantilla en Meta (queda PENDING hasta que la aprueben).
 * @param {object} data { name, language, category, bodyText, headerText, footerText }
 */
async function createTemplate({ name, language = 'es_MX', category = 'UTILITY', bodyText, headerText, footerText, examples }) {
  if (!isConfigured()) throw new Error('WhatsApp no configurado');
  const wabaId = process.env.WHATSAPP_WABA_ID;
  if (!wabaId) throw new Error('Falta WHATSAPP_WABA_ID para administrar plantillas');
  if (!bodyText?.trim()) throw new Error('La plantilla necesita cuerpo');

  // Meta exige nombre en minúsculas con guiones bajos.
  const cleanName = String(name || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 512);
  if (!cleanName) throw new Error('La plantilla necesita nombre');

  const components = [];
  if (headerText?.trim()) components.push({ type: 'HEADER', format: 'TEXT', text: headerText.trim() });
  // Meta exige valores de ejemplo cuando el cuerpo lleva variables {{n}}.
  const bodyComponent = { type: 'BODY', text: bodyText.trim() };
  const nVars = new Set([...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1])).size;
  if (nVars > 0) {
    const sample = Array.from({ length: nVars }, (_, i) => String(examples?.[i] || `Ejemplo ${i + 1}`));
    bodyComponent.example = { body_text: [sample] };
  }
  components.push(bodyComponent);
  if (footerText?.trim()) components.push({ type: 'FOOTER', text: footerText.trim() });

  const r = await axios.post(
    `${BASE_URL}/${wabaId}/message_templates`,
    { name: cleanName, language, category, components },
    { headers: headers(), timeout: 15000 }
  );
  return { ...r.data, name: cleanName };
}

/**
 * Parse an incoming Meta webhook payload.
 * Returns an array of normalized message objects.
 */
function parseWebhookPayload(body) {
  const messages = [];
  try {
    const entries = body.entry || [];
    for (const entry of entries) {
      for (const change of (entry.changes || [])) {
        const value = change.value || {};
        const contactsMap = {};
        for (const c of (value.contacts || [])) {
          contactsMap[c.wa_id] = c.profile?.name;
        }
        for (const msg of (value.messages || [])) {
          messages.push({
            messageId:  msg.id,
            from:       msg.from,
            fromName:   contactsMap[msg.from] || msg.from,
            timestamp:  new Date(Number(msg.timestamp) * 1000),
            type:       msg.type,
            text:       msg.text?.body || null,
            media:      msg.image || msg.document || msg.audio || msg.video || null,
            location:   msg.location || null,
            context:    msg.context || null, // reply context
          });
        }
      }
    }
  } catch (_) {}
  return messages;
}

module.exports = {
  createTemplate,
  isConfigured,
  normalizePhone,
  sendText,
  sendTemplate,
  sendMedia,
  markRead,
  listTemplates,
  parseWebhookPayload,
};
