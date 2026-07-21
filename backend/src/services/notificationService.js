/**
 * Notification Service — ACON CRM
 *
 * Sends notifications via:
 *   1. Email (Nodemailer / SMTP)
 *   2. WhatsApp (Meta Cloud API — if configured)
 *   3. Socket.io (in-app, always)
 *
 * All functions are fire-and-forget: they catch their own errors
 * so callers never need to worry about notification failures blocking
 * the main request lifecycle.
 */
const nodemailer = require('nodemailer');
const axios = require('axios');

// ── Email transporter ────────────────────────────────────────────────────────
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth:   {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

// ── WhatsApp Meta Cloud API ──────────────────────────────────────────────────
async function sendWhatsAppText(to, message) {
  const token   = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId || !to) return;

  // Normalize phone: strip non-digits, ensure country code
  const phone = to.replace(/\D/g, '').replace(/^0+/, '');
  if (phone.length < 10) return;

  await axios.post(
    `https://graph.facebook.com/v19.0/${phoneId}/messages`,
    {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: message },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 8000,
    }
  );
}

// ── Public notification functions ────────────────────────────────────────────

/**
 * Notify an executive when a lead is assigned to them.
 *
 * @param {object} opts
 * @param {object} opts.lead     — Mongoose lead document (or POJO)
 * @param {object} opts.assignee — { name, email, phone }
 * @param {object} opts.io       — Socket.io server instance (req.io)
 */
async function notifyLeadAssigned({ lead, assignee, io }) {
  const leadName = lead.name || lead.clientName || 'Lead sin nombre';
  const company  = lead.company ? ` (${lead.company})` : '';
  const url      = process.env.FRONTEND_URL || 'http://localhost:3000';

  // 1. Socket in-app (real-time)
  try {
    if (io) {
      io.to(`user_${assignee._id}`).emit('notification', {
        type:    'lead_assigned',
        title:   'Nuevo lead asignado',
        body:    `${leadName}${company} fue asignado a ti`,
        leadId:  lead._id,
        url:     `${url}/leads/${lead._id}`,
      });
    }
  } catch (_) {}

  // 2. Email
  try {
    const t = getTransporter();
    if (t && assignee.email) {
      await t.sendMail({
        from:    process.env.SMTP_FROM || `ACON CRM <noreply@acon.mx>`,
        to:      assignee.email,
        subject: `📋 Nuevo lead asignado: ${leadName}${company}`,
        html: `
          <div style="font-family:sans-serif;max-width:540px;margin:auto">
            <h2 style="color:#1E40AF">Nuevo lead asignado</h2>
            <p>Hola <strong>${assignee.name}</strong>,</p>
            <p>Se te ha asignado el siguiente lead:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr><td style="padding:8px;background:#F8FAFC;font-weight:600">Nombre</td><td style="padding:8px">${leadName}</td></tr>
              <tr><td style="padding:8px;background:#F8FAFC;font-weight:600">Empresa</td><td style="padding:8px">${lead.company || '—'}</td></tr>
              <tr><td style="padding:8px;background:#F8FAFC;font-weight:600">Servicio</td><td style="padding:8px">${(lead.services || []).join(', ') || '—'}</td></tr>
              <tr><td style="padding:8px;background:#F8FAFC;font-weight:600">Etapa</td><td style="padding:8px">${lead.stage || '—'}</td></tr>
              <tr><td style="padding:8px;background:#F8FAFC;font-weight:600">Prioridad</td><td style="padding:8px">${lead.priority || '—'}</td></tr>
            </table>
            <a href="${url}" style="background:#2563EB;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">
              Ver en CRM
            </a>
            <p style="color:#6B7280;font-size:12px;margin-top:24px">ACON CRM — Notificación automática</p>
          </div>
        `,
      });
    }
  } catch (err) {
    console.error('[notify:email] lead_assigned:', err.message);
  }

  // 3. WhatsApp
  try {
    if (assignee.phone) {
      await sendWhatsAppText(
        assignee.phone,
        `🚀 *ACON CRM* — Nuevo lead asignado\n\n*${leadName}*${company}\nEtapa: ${lead.stage || '—'}\nPrioridad: ${lead.priority || '—'}\n\nRevísalo en ${url}`
      );
    }
  } catch (err) {
    console.error('[notify:whatsapp] lead_assigned:', err.message);
  }
}

/**
 * Notify when a quote is approved or rejected.
 */
async function notifyQuoteReviewed({ quote, decision, comments, reviewerName, assignee, io }) {
  const emoji  = decision === 'approved' ? '✅' : '❌';
  const status = decision === 'approved' ? 'aprobada' : 'rechazada';
  const url    = process.env.FRONTEND_URL || 'http://localhost:3000';

  try {
    if (io && assignee?._id) {
      io.to(`user_${assignee._id}`).emit('notification', {
        type:    'quote_reviewed',
        title:   `Cotización ${status}`,
        body:    `${emoji} ${quote.folio} fue ${status} por ${reviewerName}`,
        quoteId: quote._id,
      });
    }
  } catch (_) {}

  try {
    const t = getTransporter();
    if (t && assignee?.email) {
      await t.sendMail({
        from:    process.env.SMTP_FROM || `ACON CRM <noreply@acon.mx>`,
        to:      assignee.email,
        subject: `${emoji} Cotización ${quote.folio} ${status}`,
        html: `
          <div style="font-family:sans-serif;max-width:540px;margin:auto">
            <h2 style="color:${decision === 'approved' ? '#16A34A' : '#DC2626'}">${emoji} Cotización ${status}</h2>
            <p><strong>${quote.folio}</strong> — ${quote.clientName || ''}</p>
            <p>Revisada por: <strong>${reviewerName}</strong></p>
            ${comments ? `<p>Comentarios: ${comments}</p>` : ''}
            <a href="${url}" style="background:#2563EB;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Ver en CRM</a>
          </div>
        `,
      });
    }
  } catch (err) {
    console.error('[notify:email] quote_reviewed:', err.message);
  }
}

/**
 * Generic push notification (in-app only via socket).
 */
async function notifyUser({ io, userId, type, title, body, meta = {} }) {
  try {
    if (io) io.to(`user_${userId}`).emit('notification', { type, title, body, ...meta });
  } catch (_) {}
}

module.exports = { notifyLeadAssigned, notifyQuoteReviewed, notifyUser, sendWhatsAppText };
