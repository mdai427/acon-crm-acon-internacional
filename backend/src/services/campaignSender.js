// ============================================
// Envío de campañas de email marketing
// ============================================
//
// A diferencia del correo uno a uno, aquí importa no quemar el dominio: se
// respeta la lista de supresión, se manda a ritmo controlado, cada destinatario
// queda registrado para poder atribuirle los eventos del proveedor, y todo
// correo lleva enlace de baja.

const crypto = require('crypto');
const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const Mailbox = require('../models/Mailbox');
const CampaignRecipient = require('../models/CampaignRecipient');
const mailer = require('./mailerService');
const mailboxService = require('./mailboxService');
const suppression = require('./suppressionService');

// Pausa entre envíos. Sin esto se dispara el límite de tasa del proveedor y
// medio envío termina en reintentos innecesarios.
const SEND_INTERVAL_MS = 250;
const MAX_RECIPIENTS = 5000;

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Baja ────────────────────────────────────────────────────────────
// El token va firmado para que nadie pueda dar de baja a un tercero
// adivinando la URL.

function unsubscribeToken(email) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || '')
    .update(`unsub:${email.toLowerCase()}`)
    .digest('hex')
    .slice(0, 20);
}

function verifyUnsubscribeToken(email, token) {
  const expected = unsubscribeToken(email);
  return token?.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

function unsubscribeUrl(email) {
  const base = (process.env.PUBLIC_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const query = `email=${encodeURIComponent(email)}&token=${unsubscribeToken(email)}`;
  return `${base}/api/email/unsubscribe?${query}`;
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
function renderVariables(template, lead) {
  const values = {
    contact: lead.contact || '',
    company: lead.company || '',
    country: lead.country || '',
    city: lead.city || '',
    email: lead.email || '',
  };
  return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) =>
    (key in values ? values[key] : match));
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
  if (!campaign.body) throw new Error('La campaña no tiene cuerpo');

  const mailbox = campaign.mailbox
    ? await Mailbox.findById(campaign.mailbox)
    : await Mailbox.findOne({ isActive: true, isDefault: true });

  const leads = await Lead.find(segmentFilter(campaign.segment))
    .select('_id company contact email country city')
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
    await wait(SEND_INTERVAL_MS);
  }

  await Campaign.findByIdAndUpdate(campaignId, {
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
