// ============================================
// WhatsApp — proveedor único para todo el CRM
// ============================================
//
// El CRM puede hablar con WhatsApp de dos maneras:
//
//   WA_PROVIDER=meta   → directo contra la Cloud API de Meta (whatsappMetaService)
//   WA_PROVIDER=labia  → a través de la API de Labia (labiaWaService)
//
// Si no se define WA_PROVIDER se elige solo: Labia cuando hay LABIA_API_KEY,
// Meta en cualquier otro caso. Así las instalaciones que ya funcionaban contra
// Meta siguen igual sin tocar nada.
//
// Todo el resto del sistema —chat, campañas, playbooks, webhooks— llama a este
// archivo y nunca a un proveedor concreto. Los dos adaptadores exponen la misma
// superficie y devuelven la misma forma de respuesta (la de Meta), así que
// cambiar de proveedor es cambiar una variable, no tocar código.

const meta = require('./whatsappMetaService');
const labia = require('./labiaWaService');

function activeProvider() {
  const configured = String(process.env.WA_PROVIDER || '').trim().toLowerCase();
  if (configured === 'labia' || configured === 'meta') return configured;
  return process.env.LABIA_API_KEY ? 'labia' : 'meta';
}

function impl() {
  return activeProvider() === 'labia' ? labia : meta;
}

// Las firmas se mantienen idénticas a las del servicio de Meta, que es contra
// las que ya está escrito el CRM.
const sendText      = (to, body) => impl().sendText(to, body);
const sendTemplate  = (to, name, lang = 'es_MX', components = []) => impl().sendTemplate(to, name, lang, components);
const sendMedia     = (to, type, url, caption, filename) => impl().sendMedia(to, type, url, caption, filename);
const markRead      = (messageId) => impl().markRead(messageId);
const listTemplates = () => impl().listTemplates();
const createTemplate = (data) => impl().createTemplate(data);
const isConfigured  = () => impl().isConfigured();

// La normalización de teléfonos y el parseo del webhook de Meta son comunes:
// Labia entrega los mensajes del canal oficial en el mismo formato.
const normalizePhone = meta.normalizePhone;
const parseWebhookPayload = meta.parseWebhookPayload;

/** Estado para el panel: qué proveedor manda y si está listo para enviar. */
function status() {
  const provider = activeProvider();
  if (provider === 'labia') {
    return {
      provider,
      configured: labia.isConfigured(),
      unofficial: labia.isUnofficial(),
      webhookReady: !!process.env.LABIA_WEBHOOK_SECRET,
      // Sin WABA ID Labia igual administra plantillas: es su propia key.
      templatesReady: labia.isConfigured(),
    };
  }
  return {
    provider,
    configured: meta.isConfigured(),
    unofficial: false,
    webhookReady: !!(process.env.META_WA_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN),
    // Contra Meta directo, las plantillas necesitan además el WABA ID.
    templatesReady: meta.isConfigured() && !!process.env.WHATSAPP_WABA_ID,
  };
}

module.exports = {
  activeProvider,
  status,
  isConfigured,
  normalizePhone,
  sendText,
  sendTemplate,
  sendMedia,
  markRead,
  listTemplates,
  createTemplate,
  parseWebhookPayload,
  // Acceso directo a los adaptadores para lo que es específico de cada uno
  // (verificación de firma del webhook, sincronización de plantillas…).
  meta,
  labia,
};
