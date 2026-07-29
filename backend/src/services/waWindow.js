// ============================================
// Ventana de conversación de WhatsApp (24 h)
// ============================================
//
// Meta solo permite texto libre durante las 24 horas siguientes al último
// mensaje DEL CLIENTE; después, únicamente plantillas aprobadas. Este servicio
// es la única fuente de verdad sobre esa ventana: el chat, la bandeja y
// cualquier otro punto que quiera enviar texto libre preguntan aquí.

const Activity = require('../models/Activity');

const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Estado de la ventana para un lead.
 * @returns {Promise<{open: boolean, lastInboundAt: Date|null, expiresAt: Date|null, remainingMinutes: number}>}
 */
async function getWindow(leadId) {
  const lastIn = await Activity.findOne({ lead: leadId, type: 'whatsapp_in' })
    .sort({ createdAt: -1 })
    .select('createdAt')
    .lean();

  if (!lastIn) {
    return { open: false, lastInboundAt: null, expiresAt: null, remainingMinutes: 0 };
  }

  const expiresAt = new Date(lastIn.createdAt.getTime() + WINDOW_MS);
  const remainingMs = expiresAt - Date.now();
  return {
    open: remainingMs > 0,
    lastInboundAt: lastIn.createdAt,
    expiresAt,
    remainingMinutes: Math.max(0, Math.floor(remainingMs / 60000)),
  };
}

/**
 * Corta el envío de texto libre con ventana cerrada. El error lleva la marca
 * `windowClosed` para que el frontend cambie al modo plantillas.
 */
async function assertOpen(leadId) {
  const window = await getWindow(leadId);
  if (!window.open) {
    const error = new Error(window.lastInboundAt
      ? 'La ventana de 24 horas está cerrada: solo se pueden enviar plantillas aprobadas'
      : 'El cliente aún no ha escrito: el primer contacto debe ser una plantilla aprobada');
    error.windowClosed = true;
    error.status = 409;
    throw error;
  }
  return window;
}

// Vencimiento calculado desde una fecha ya conocida (para agregaciones que
// traen el último entrante de varios leads a la vez, sin N consultas).
function windowFrom(lastInboundAt) {
  if (!lastInboundAt) return { open: false, expiresAt: null };
  const expiresAt = new Date(new Date(lastInboundAt).getTime() + WINDOW_MS);
  return { open: expiresAt > Date.now(), expiresAt };
}

module.exports = { getWindow, assertOpen, windowFrom, WINDOW_MS };
