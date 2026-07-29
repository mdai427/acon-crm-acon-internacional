// ============================================
// Correo entrante: del webhook al chat del lead
// ============================================
//
// Resend entrega los correos del dominio de buzones (INBOUND_EMAIL_DOMAIN) por
// webhook. Aquí se resuelve a quién pertenece y se guarda como Activity, que es
// lo que el chat del lead ya pinta junto a WhatsApp y llamadas.
//
// Orden de resolución del lead:
//   1. Token del Reply-To (ventas+l<leadId>.<firma>@…) — es el confiable.
//   2. Email del remitente contra Lead.email.
//   3. Nada: queda sin lead, visible en la bandeja "sin asignar".

const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const CampaignRecipient = require('../models/CampaignRecipient');
const mailboxService = require('./mailboxService');
const mailer = require('./mailerService');

// El HTML del correo no se guarda como texto plano del chat: se recorta para la
// vista previa y el cuerpo completo queda en emailData.
const PREVIEW_LENGTH = 2000;

function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// "Sarahi Noriega <sarahi@acme.com>" → "sarahi@acme.com"
function extractAddress(raw) {
  const value = String(raw || '').trim();
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

function toArray(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map(extractAddress).filter(Boolean);
}

/**
 * Normaliza el payload de Resend a la forma que usa el resto del servicio.
 * Se aísla aquí para que cambiar de proveedor (Cloudflare, Mailgun) sea tocar
 * solo esta función.
 */
function normalize(data) {
  const headers = {};
  for (const h of data.headers || []) {
    if (h?.name) headers[h.name.toLowerCase()] = h.value;
  }
  return {
    from: extractAddress(data.from),
    fromName: String(data.from || '').replace(/<[^>]*>/, '').trim() || null,
    to: toArray(data.to),
    cc: toArray(data.cc),
    subject: data.subject || '(sin asunto)',
    html: data.html || '',
    text: data.text || '',
    messageId: headers['message-id'] || data.email_id || data.id || null,
    inReplyTo: headers['in-reply-to'] || null,
    references: headers.references || null,
    attachments: (data.attachments || []).map(a => ({
      filename: a.filename,
      size: a.content_size || a.size,
      contentType: a.content_type,
    })),
  };
}

async function resolveLead(mail, tokenLeadId) {
  if (tokenLeadId) {
    const lead = await Lead.findById(tokenLeadId);
    if (lead) return lead;
  }
  return Lead.findOne({ email: mail.from, isActive: true });
}

// Una respuesta que llega poco después de una campaña se le atribuye a esa
// campaña: es la métrica que de verdad importa para decidir si repetirla.
const REPLY_ATTRIBUTION_DAYS = 30;

async function creditCampaignReply(leadId) {
  const since = new Date(Date.now() - REPLY_ATTRIBUTION_DAYS * 24 * 60 * 60 * 1000);
  const recipient = await CampaignRecipient.findOne({
    lead: leadId,
    sentAt: { $gte: since },
    // Una sola respuesta por envío: si el contacto escribe cinco veces, sigue
    // siendo un interesado, no cinco.
    repliedAt: null,
  }).sort({ sentAt: -1 });
  if (!recipient) return;

  await CampaignRecipient.updateOne({ _id: recipient._id }, { repliedAt: new Date() });
  await mongoose.models.Campaign?.findByIdAndUpdate(recipient.campaign, { $inc: { replyCount: 1 } });
}

/**
 * Procesa un correo entrante y lo deja en el chat.
 * @returns {Promise<{activity: object, leadId: string|null, mailbox: string}|null>}
 *          null si el destinatario no corresponde a ningún buzón activo.
 */
async function processInbound(rawData, io) {
  const mail = normalize(rawData);
  const { mailbox, leadId: tokenLeadId } = await mailboxService.resolveInbound([...mail.to, ...mail.cc]);

  if (!mailbox) {
    console.warn(`[inbound] Sin buzón para ${mail.to.join(', ')} — descartado`);
    return null;
  }

  const lead = await resolveLead(mail, tokenLeadId);
  const body = mail.text || htmlToText(mail.html);

  const activity = await Activity.create({
    lead: lead?._id || null,
    // El correo entrante no lo genera un usuario; el dueño del buzón es a quien
    // se le notifica, no el autor.
    user: null,
    type: 'email_in',
    direction: 'inbound',
    subject: mail.subject,
    content: body.slice(0, PREVIEW_LENGTH),
    emailData: {
      messageId: mail.messageId,
      from: mail.from,
      to: mail.to,
      cc: mail.cc,
      attachments: mail.attachments,
    },
    metadata: {
      mailboxId: mailbox._id,
      mailboxAddress: mailbox.address,
      fromName: mail.fromName,
      inReplyTo: mail.inReplyTo,
      references: mail.references,
      html: mail.html || null,
      matchedBy: tokenLeadId ? 'token' : (lead ? 'email' : 'none'),
      isRead: false,
    },
  });

  if (lead) {
    await Lead.findByIdAndUpdate(lead._id, { lastContactDate: new Date() });
    io?.to(`lead_${lead._id}`).emit('activity_new', { leadId: lead._id, activity });
    await creditCampaignReply(lead._id);
  }

  // Avisar al dueño del buzón y a quienes lo comparten.
  const watchers = [mailbox.assignedTo, ...(mailbox.sharedWith || [])].filter(Boolean);
  for (const userId of watchers) {
    io?.to(`user_${userId}`).emit('email_inbound', {
      activity, leadId: lead?._id || null, mailbox: mailbox.address,
    });
  }
  if (!watchers.length) io?.to('role_admin').emit('email_inbound', { activity, leadId: lead?._id || null, mailbox: mailbox.address });

  // Copia a la casilla externa del asesor, si la configuró.
  if (mailbox.forwardTo) {
    mailer.sendMail({
      from: mailbox.fromHeader(),
      to: mailbox.forwardTo,
      subject: `[CRM ${mailbox.address}] ${mail.subject}`,
      html: mail.html || `<pre>${body}</pre>`,
      replyTo: mail.from,
    }).catch(err => console.error('[inbound] reenvío falló:', err.message));
  }

  return { activity, leadId: lead?._id || null, mailbox: mailbox.address };
}

module.exports = { processInbound, normalize, htmlToText, extractAddress };
