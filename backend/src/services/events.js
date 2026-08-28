// ============================================
// Bus de eventos del CRM
// ============================================
//
// Un solo sitio por el que pasa "algo pasó con un lead": creado, cambió de
// etapa, respondió por WhatsApp… Quien lo provoca llama a emit(); quien
// reacciona (hoy, el motor de flujos) se suscribe con on(). Los oyentes corren
// en background y sus errores se registran, nunca rompen la petición que
// originó el evento.
//
// Eventos (payload siempre lleva leadId; el resto según el evento):
//   lead.created         { leadId, userId, source }
//   lead.stage_entered   { leadId, userId, stage, from }
//   lead.score_changed   { leadId, score, previous }
//   lead.assigned        { leadId, userId, assignedTo }
//   message.received     { leadId, channel: 'whatsapp'|'email', activityId, text }
//   message.status       { leadId, channel, status: 'delivered'|'read'|'failed', messageId }
//   quote.sent | quote.accepted | quote.rejected   { leadId, quoteId, userId }
//   call.ended           { leadId, outcome }

const crypto = require('crypto');

const listeners = new Map();

function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, []);
  listeners.get(name).push(fn);
  return () => {
    const list = listeners.get(name) || [];
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };
}

/**
 * Emite un evento. Devuelve el eventId por si quien emite quiere rastrearlo.
 * No espera a los oyentes: se ejecutan en el siguiente tick.
 */
function emit(name, payload = {}, { io } = {}) {
  const event = {
    name,
    eventId: payload.eventId || crypto.randomUUID(),
    at: new Date(),
    ...payload,
  };
  const fns = [...(listeners.get(name) || []), ...(listeners.get('*') || [])];
  setImmediate(async () => {
    for (const fn of fns) {
      try {
        await fn(event, { io });
      } catch (err) {
        console.error(`[events] oyente de ${name} falló:`, err.message);
      }
    }
  });
  return event.eventId;
}

/** Igual que emit pero espera a los oyentes (para pruebas y scripts). */
async function emitSync(name, payload = {}, { io } = {}) {
  const event = { name, eventId: payload.eventId || crypto.randomUUID(), at: new Date(), ...payload };
  const fns = [...(listeners.get(name) || []), ...(listeners.get('*') || [])];
  for (const fn of fns) await fn(event, { io });
  return event.eventId;
}

module.exports = { on, emit, emitSync };
