// ============================================
// Envío de campañas de email marketing
// ============================================
//
// A diferencia del correo uno a uno, aquí importa no quemar el dominio: se
// respeta la lista de supresión, se manda a ritmo controlado, cada destinatario
// queda registrado para poder atribuirle los eventos del proveedor, y todo
// correo lleva enlace de baja.

const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const Mailbox = require('../models/Mailbox');
const CampaignRecipient = require('../models/CampaignRecipient');
const mailer = require('./mailerService');
const mailboxService = require('./mailboxService');
const suppression = require('./suppressionService');
const derivedKeys = require('../utils/derivedKeys');
const { PUBLIC_BASE_URL } = require('../config/urls');

// Pausa entre envíos. Sin esto se dispara el límite de tasa del proveedor y
// medio envío termina en reintentos innecesarios. El ritmo lo marca el más
// lento de los dos canales, que no es el mismo:
//   · Resend admite 2 peticiones por segundo → 500 ms entre correos.
//   · WhatsApp por Labia admite 20 → 250 ms sobra y va cuatro veces más rápido.
const EMAIL_INTERVAL_MS = 500;
const WA_INTERVAL_MS = 250;
const MAX_RECIPIENTS = 5000;

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Baja ────────────────────────────────────────────────────────────
// El token va firmado para que nadie pueda dar de baja a un tercero
// adivinando la URL.

const UNSUB_PURPOSE = 'unsubscribe';
const UNSUB_TOKEN_LENGTH = 20;

function unsubscribeToken(email) {
  return derivedKeys.sign(UNSUB_PURPOSE, email.toLowerCase(), UNSUB_TOKEN_LENGTH);
}

function verifyUnsubscribeToken(email, token) {
  return derivedKeys.verify(UNSUB_PURPOSE, String(email).toLowerCase(), token, UNSUB_TOKEN_LENGTH);
}

// La baja se procesa en el backend (/api/email/unsubscribe), así que el enlace
// tiene que apuntar al dominio de la API. Antes usaba el del frontend: el
// contacto acababa en la pantalla de login del CRM en vez de darse de baja, y
// el enlace de baja de una campaña no es opcional.
function unsubscribeUrl(email) {
  const query = `email=${encodeURIComponent(email)}&token=${unsubscribeToken(email)}`;
  return `${PUBLIC_BASE_URL}/api/email/unsubscribe?${query}`;
}

// ── Composición ─────────────────────────────────────────────────────

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Un correo escrito "en blanco" (texto plano) igual se manda como HTML: los
// clientes de correo tratan mejor el HTML y así la firma y la baja se ven bien.
function wrapPlainText(body) {
  const paragraphs = String(body).trim().split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:600px;margin:0 auto;padding:24px">${paragraphs}</div>`;
}

// Variables disponibles en asunto y cuerpo: {{contact}}, {{company}}, etc.
//
// La lista de campos es la misma que usan las plantillas de WhatsApp
// (waTemplateStore.LEAD_FIELDS), para que un {{executive}} que se ofrece en el
// creador de plantillas signifique lo mismo aquí y no se quede sin resolver.
const { LEAD_FIELDS } = require('./waTemplateStore');

function renderVariables(template, lead) {
  return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) =>
    (LEAD_FIELDS[key] ? LEAD_FIELDS[key](lead) : match));
}

function unsubscribeFooter(email) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8a8a8a;text-align:center;padding:16px 24px;border-top:1px solid #eee;max-width:600px;margin:0 auto">
    Recibes este correo porque estás registrado como contacto comercial de ACON Worldwide.
    <br><a href="${unsubscribeUrl(email)}" style="color:#8a8a8a">Darme de baja</a>
  </div>`;
}

/** Arma el correo final de un destinatario. */
function composeFor(campaign, lead, mailbox) {
  const rawBody = renderVariables(campaign.body, lead);
  const body = campaign.bodyType === 'html' ? rawBody : wrapPlainText(rawBody);
  return {
    subject: renderVariables(campaign.subject || campaign.name, lead),
    html: `${body}${mailbox?.signature || ''}${unsubscribeFooter(lead.email)}`,
  };
}

// ── Segmento ────────────────────────────────────────────────────────

function segmentFilter(segment = {}) {
  const filter = {
    isActive: true,
    email: { $exists: true, $ne: '' },
    // Los bloqueados por rebote nunca entran a una campaña.
    'emailStatus.canReceive': { $ne: false },
  };
  if (segment.services?.length) filter.services = { $in: segment.services };
  if (segment.stages?.length) filter.stage = { $in: segment.stages };
  if (segment.countries?.length) filter.country = { $in: segment.countries };
  if (segment.tags?.length) filter.tags = { $in: segment.tags };
  if (segment.minScore) filter.score = { $gte: segment.minScore };
  return filter;
}

// ── Envío ───────────────────────────────────────────────────────────

/**
 * Envía una campaña completa.
 * @param {string} campaignId
 * @param {function} onProgress (percent, total) => Promise
 * @returns {Promise<{sent:number, failed:number, skipped:number, total:number}>}
 */
async function sendCampaign(campaignId, onProgress = async () => {}) {
  const Campaign = mongoose.models.Campaign;
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new Error('Campaña no encontrada');
  if (campaign.type === 'whatsapp') return sendWhatsAppCampaign(campaign, onProgress);
  if (!campaign.body) throw new Error('La campaña no tiene cuerpo');

  const mailbox = campaign.mailbox
    ? await Mailbox.findById(campaign.mailbox)
    : await Mailbox.findOne({ isActive: true, isDefault: true });

  const leads = await Lead.find(segmentFilter(campaign.segment))
    .select('_id company contact email country city stage services assignedTo')
    // El ejecutivo asignado es una variable disponible: sin poblarlo, {{executive}}
    // saldría vacío en todos los correos.
    .populate('assignedTo', 'name')
    .limit(MAX_RECIPIENTS)
    .lean();

  const total = leads.length;
  await Campaign.findByIdAndUpdate(campaignId, {
    status: 'running', totalRecipients: total, lastError: null,
  });

  const results = { sent: 0, failed: 0, skipped: 0, total };

  for (const [index, lead] of leads.entries()) {
    // Una fila por destinatario desde el inicio: si el proceso se cae a mitad,
    // se ve exactamente hasta dónde llegó.
    const recipient = await CampaignRecipient.findOneAndUpdate(
      { campaign: campaignId, lead: lead._id },
      { $setOnInsert: { email: lead.email, status: 'pending' } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    // Reanudar una campaña no reenvía a quien ya recibió.
    if (recipient.status !== 'pending') continue;

    try {
      if (await suppression.isSuppressed(lead.email)) {
        await CampaignRecipient.updateOne({ _id: recipient._id }, { status: 'skipped', reason: 'suppressed' });
        results.skipped++;
        continue;
      }

      const content = composeFor(campaign, lead, mailbox);
      const info = await mailer.sendMail({
        from: mailbox ? mailbox.fromHeader() : mailer.defaultFrom(),
        // Si contestan la campaña, la respuesta cae en el chat del lead.
        replyTo: mailbox ? mailboxService.buildReplyTo(mailbox, lead._id) : undefined,
        to: lead.email,
        subject: content.subject,
        html: content.html,
        headers: { 'List-Unsubscribe': `<${unsubscribeUrl(lead.email)}>` },
      });

      await CampaignRecipient.updateOne({ _id: recipient._id }, {
        status: 'sent', messageId: info.messageId, sentAt: new Date(), attempts: info.attempts || 1,
      });
      results.sent++;
    } catch (error) {
      await CampaignRecipient.updateOne({ _id: recipient._id }, {
        status: 'failed', reason: error.message,
      });
      results.failed++;
      console.error(`[campaña ${campaign.name}] ${lead.email}: ${error.message}`);
    }

    if ((index + 1) % 10 === 0) {
      await Campaign.findByIdAndUpdate(campaignId, {
        sentCount: results.sent, failedCount: results.failed, skippedCount: results.skipped,
      });
      await onProgress(Math.round(((index + 1) / total) * 100), total);
    }
    await wait(EMAIL_INTERVAL_MS);
  }

  await Campaign.findByIdAndUpdate(campaignId, {
    status: 'completed',
    sentCount: results.sent,
    failedCount: results.failed,
    skippedCount: results.skipped,
  });

  return results;
}

// ── Campañas de WhatsApp ────────────────────────────────────────────
// Envío masivo = fuera de la ventana de 24 h con seguridad, así que solo
// plantillas aprobadas de Meta. Cada variable admite {{contact}}, {{company}}…
// y se renderiza por destinatario.

async function sendWhatsAppCampaign(campaign, onProgress = async () => {}) {
  const Campaign = mongoose.models.Campaign;
  const wa = require('./whatsappService');
  const Activity = require('../models/Activity');

  if (!campaign.waTemplate?.name) {
    throw new Error('La campaña de WhatsApp necesita una plantilla aprobada de Meta');
  }

  const filter = {
    isActive: true,
    $or: [{ whatsapp: { $exists: true, $ne: '' } }, { phone: { $exists: true, $ne: '' } }],
  };
  const seg = campaign.segment || {};
  if (seg.services?.length) filter.services = { $in: seg.services };
  if (seg.stages?.length) filter.stage = { $in: seg.stages };
  if (seg.countries?.length) filter.country = { $in: seg.countries };
  if (seg.tags?.length) filter.tags = { $in: seg.tags };
  if (seg.minScore) filter.score = { $gte: seg.minScore };

  const leads = await Lead.find(filter)
    .select('_id company contact country city whatsapp phone email stage services assignedTo')
    .populate('assignedTo', 'name')
    .limit(MAX_RECIPIENTS)
    .lean();

  const total = leads.length;
  await Campaign.findByIdAndUpdate(campaign._id, {
    status: 'running', totalRecipients: total, lastError: null,
  });

  const results = { sent: 0, failed: 0, skipped: 0, total };

  for (const [index, lead] of leads.entries()) {
    const phone = lead.whatsapp || lead.phone;
    const recipient = await CampaignRecipient.findOneAndUpdate(
      { campaign: campaign._id, lead: lead._id },
      { $setOnInsert: { email: lead.email || `${phone}@wa`, status: 'pending' } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    if (recipient.status !== 'pending') continue; // reanudar no reenvía

    try {
      const params = (campaign.waTemplate.params || []).map(v => renderVariables(v, lead));
      const components = [];
      if (campaign.waTemplate.headerUrl) {
        components.push({ type: 'header', parameters: [{ type: 'image', image: { link: campaign.waTemplate.headerUrl } }] });
      }
      if (params.length) {
        components.push({ type: 'body', parameters: params.map(text => ({ type: 'text', text })) });
      }

      const r = await wa.sendTemplate(
        phone, campaign.waTemplate.name, campaign.waTemplate.language || 'es_MX', components
      );

      await CampaignRecipient.updateOne({ _id: recipient._id }, {
        status: 'sent', messageId: r.messages?.[0]?.id, sentAt: new Date(),
      });
      // Queda en el chat del lead como cualquier otro mensaje saliente.
      await Activity.create({
        lead: lead._id, type: 'whatsapp_out', direction: 'outbound', isAuto: true,
        content: `[Campaña: ${campaign.name}] plantilla ${campaign.waTemplate.name}`,
        metadata: { campaignId: campaign._id },
      });
      results.sent++;
    } catch (error) {
      await CampaignRecipient.updateOne({ _id: recipient._id }, {
        status: 'failed', reason: error.response?.data?.error?.message || error.message,
      });
      results.failed++;
    }

    if ((index + 1) % 10 === 0) {
      await Campaign.findByIdAndUpdate(campaign._id, {
        sentCount: results.sent, failedCount: results.failed,
      });
      await onProgress(Math.round(((index + 1) / total) * 100), total);
    }
    // El proveedor de WhatsApp también limita la tasa, pero más alto.
    await wait(WA_INTERVAL_MS);
  }

  await Campaign.findByIdAndUpdate(campaign._id, {
    status: 'completed',
    sentCount: results.sent,
    failedCount: results.failed,
    skippedCount: results.skipped,
  });

  return results;
}

module.exports = {
  sendCampaign,
  segmentFilter,
  composeFor,
  unsubscribeUrl,
  verifyUnsubscribeToken,
  renderVariables,
  wrapPlainText,
};
