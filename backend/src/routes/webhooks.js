const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Lead = require('../models/Lead');
const { scoreLeadWithAI } = require('../services/aiAgent');
const { secureCompare } = require('../utils/secureCompare');
const { processInbound } = require('../services/inboundEmail');
const suppression = require('../services/suppressionService');
const mongoose = require('mongoose');
const CampaignRecipient = require('../models/CampaignRecipient');

// ============================================
// WEBHOOK META (Facebook Lead Ads + Instagram)
// ============================================

// GET /api/webhooks/meta — verificacion
router.get('/meta', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Meta Webhook verificado');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// POST /api/webhooks/meta — leads entrantes de Facebook/Instagram Ads
router.post('/meta', (req, res) => {
  res.sendStatus(200);

  try {
    // Verificar firma HMAC-SHA256 de Meta (obligatorio si META_APP_SECRET está configurado)
    const signature = req.headers['x-hub-signature-256'];
    const rawBody = req.body; // raw buffer

    if (process.env.META_APP_SECRET) {
      if (!signature) {
        console.warn('⚠️ Meta webhook sin firma — rechazado (META_APP_SECRET configurado)');
        return;
      }
      const expectedSig = 'sha256=' + crypto
        .createHmac('sha256', process.env.META_APP_SECRET)
        .update(rawBody)
        .digest('hex');
      if (!secureCompare(signature, expectedSig)) {
        console.warn('⚠️ Meta webhook firma invalida — rechazado');
        return;
      }
    }

    const body = JSON.parse(rawBody.toString());
    
    if (body.object !== 'page') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === 'leadgen') {
          processFacebookLead(change.value, req.io).catch(console.error);
        }
      }
    }
  } catch (error) {
    console.error('Meta webhook error:', error);
  }
});

async function processFacebookLead(leadData, io) {
  try {
    // Obtener datos del lead de Meta API
    const axios = require('axios');
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${leadData.leadgen_id}`,
      {
        params: {
          access_token: process.env.META_ACCESS_TOKEN,
          fields: 'field_data,created_time,campaign_name,ad_name'
        }
      }
    );

    const fbLead = response.data;
    const fields = {};
    (fbLead.field_data || []).forEach(f => {
      fields[f.name] = f.values?.[0];
    });

    const newLead = await Lead.create({
      company:     fields['company_name'] || fields['empresa'] || 'Sin empresa',
      contact:     `${fields['first_name'] || ''} ${fields['last_name'] || ''}`.trim() || fields['full_name'] || 'Contacto Facebook',
      email:       fields['email'],
      phone:       fields['phone_number'] || fields['telefono'],
      whatsapp:    fields['whatsapp'] || fields['phone_number'],
      source:      leadData.page_id ? 'facebook' : 'instagram',
      sourceDetail: fbLead.campaign_name || fbLead.ad_name,
      stage:       'new',
      tags:        ['facebook-lead-ad'],
      externalIds: { facebookLeadId: leadData.leadgen_id }
    });

    await scoreLeadWithAI(newLead._id);
    
    // Notificar a admins
    io?.to('role_admin').emit('new_lead', {
      lead: newLead,
      source: 'Facebook Lead Ad',
      campaign: fbLead.campaign_name
    });

    console.log(`📘 Nuevo lead de Facebook Ads: ${newLead.contact} (${newLead.email})`);
  } catch (error) {
    console.error('Facebook lead processing error:', error.message);
  }
}

// ============================================
// WEBHOOK GENERICO (Zapier / Make / n8n)
// ============================================

// Los webhooks de ingesta crean leads y disparan scoring con IA (que cuesta
// dinero por llamada), así que ninguno puede quedar abierto.
function requireWebhookKey(req, res, next) {
  if (!process.env.WEBHOOK_API_KEY) {
    console.warn('⚠️ Webhook de ingesta deshabilitado: falta WEBHOOK_API_KEY');
    return res.status(503).json({ success: false, message: 'Webhook no configurado' });
  }
  if (!secureCompare(req.headers['x-api-key'], process.env.WEBHOOK_API_KEY)) {
    return res.status(401).json({ success: false, message: 'API key invalida' });
  }
  next();
}

// POST /api/webhooks/generic — recibir leads de cualquier fuente via HTTP
// WEBHOOK_API_KEY es independiente a propósito. Antes se aceptaba como
// alternativa un trozo del JWT_SECRET: eso convertía una clave de webhook
// filtrada en material del secreto que firma las sesiones.
router.post('/generic', express.json(), requireWebhookKey, async (req, res) => {
  try {
    const {
      company, contact, email, phone, whatsapp,
      source = 'other', sourceDetail, services,
      country, city, notes, value, assignedTo
    } = req.body;

    if (!company && !contact) {
      return res.status(400).json({ success: false, message: 'company o contact requerido' });
    }

    const lead = await Lead.create({
      company: company || contact,
      contact: contact || company,
      email, phone, whatsapp,
      source, sourceDetail, services, country, city, notes,
      value: value || 0,
      assignedTo,
      stage: 'new'
    });

    await scoreLeadWithAI(lead._id);
    req.io?.to('role_admin').emit('new_lead', { lead, source: 'webhook' });

    res.status(201).json({ success: true, leadId: lead._id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// WEBHOOK LINKEDIN (via Zapier/Make)
// LinkedIn no tiene webhook nativo, se usa via automatizacion
// ============================================
router.post('/linkedin', express.json(), requireWebhookKey, async (req, res) => {
  try {
    const { contact, company, position, linkedinUrl, email, phone, message } = req.body;

    const lead = await Lead.create({
      company: company || 'Sin empresa',
      contact: contact || 'Contacto LinkedIn',
      email, phone,
      position,
      source: 'linkedin',
      sourceDetail: linkedinUrl,
      notes: message,
      stage: 'new',
      tags: ['linkedin'],
      externalIds: { linkedinProfileId: linkedinUrl }
    });

    await scoreLeadWithAI(lead._id);
    req.io?.to('role_admin').emit('new_lead', { lead, source: 'LinkedIn' });

    res.status(201).json({ success: true, leadId: lead._id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// WHATSAPP META CLOUD API WEBHOOK
// ============================================
const { parseWebhookPayload, markRead } = require('../services/whatsappMetaService');
const Activity = require('../models/Activity');

// GET /api/webhooks/whatsapp — Meta webhook verification
router.get('/whatsapp', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('✅ WhatsApp Cloud API Webhook verificado');
    return res.status(200).send(challenge);
  }
  res.status(403).json({ error: 'Token de verificación inválido' });
});

// POST /api/webhooks/whatsapp — receive incoming WhatsApp messages
router.post('/whatsapp', async (req, res) => {
  try {
    // Verify X-Hub-Signature-256 if APP_SECRET is set
    const appSecret = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET;
    if (appSecret) {
      const sig  = req.headers['x-hub-signature-256'];
      const body = req.body; // raw buffer (set in index.js)
      const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(body).digest('hex')}`;
      if (sig !== expected) {
        console.warn('⚠️ WhatsApp webhook firma inválida');
        return res.status(403).send('Invalid signature');
      }
    }

    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const messages = parseWebhookPayload(payload);

    for (const msg of messages) {
      // Try to find lead by phone
      const normalizedPhone = msg.from;
      const lead = await Lead.findOne({
        $or: [
          { phone: { $regex: normalizedPhone.slice(-10), $options: 'i' } },
          { whatsapp: { $regex: normalizedPhone.slice(-10), $options: 'i' } },
        ],
        isActive: true,
      }).lean();

      // Log as activity (even if no lead found — store as generic)
      if (lead) {
        await Activity.create({
          lead:      lead._id,
          type:      'whatsapp',
          direction: 'inbound',
          content:   msg.text || `[Mensaje ${msg.type}]`,
          metadata:  { messageId: msg.messageId, from: msg.from, fromName: msg.fromName, type: msg.type },
        });
        // Update last contact date
        await Lead.findByIdAndUpdate(lead._id, { lastContactDate: new Date() });
      }

      // Mark as read
      markRead(msg.messageId).catch(() => {});

      // Emit to connected clients
      req.io?.emit('whatsapp_inbound', { ...msg, leadId: lead?._id });
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('[webhook/whatsapp]', error);
    res.status(200).json({ status: 'ok' }); // always 200 to Meta
  }
});

// ============================================
// WEBHOOK RESEND (correo entrante + eventos de entrega)
// ============================================
//
// Resend firma con Svix: los headers svix-id/svix-timestamp/svix-signature y
// un secreto whsec_<base64>. La firma se calcula sobre "id.timestamp.body",
// por eso este router recibe el body crudo (ver express.raw en index.js).

const SVIX_TOLERANCE_SECONDS = 5 * 60;

function verifySvix(req) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  // Sin secreto configurado no se acepta nada: un webhook de correo abierto
  // deja que cualquiera inyecte conversaciones falsas en el CRM.
  if (!secret) return { ok: false, reason: 'RESEND_WEBHOOK_SECRET sin configurar' };

  const id = req.headers['svix-id'];
  const timestamp = req.headers['svix-timestamp'];
  const signatureHeader = req.headers['svix-signature'];
  if (!id || !timestamp || !signatureHeader) return { ok: false, reason: 'faltan headers svix' };

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > SVIX_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'timestamp fuera de tolerancia' };
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const body = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', key)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');

  // El header trae una o más firmas ("v1,<sig> v1,<sig>"): basta que una calce.
  const provided = String(signatureHeader).split(' ')
    .map(part => part.split(',')[1])
    .filter(Boolean);

  const expectedBuf = Buffer.from(expected);
  const ok = provided.some(sig => {
    const buf = Buffer.from(sig);
    return buf.length === expectedBuf.length && crypto.timingSafeEqual(buf, expectedBuf);
  });

  return ok ? { ok: true, body } : { ok: false, reason: 'firma inválida' };
}

// Los eventos de entrega actualizan el correo saliente ya guardado, para poder
// mostrar "entregado / rebotado / abierto" en el chat y medir las campañas.
const DELIVERY_STATUS = {
  'email.sent':            'sent',
  'email.delivered':       'delivered',
  'email.delivery_delayed':'delayed',
  'email.bounced':         'bounced',
  'email.complained':      'complained',
  'email.opened':          'opened',
  'email.clicked':         'clicked',
};

// Campos que cada evento actualiza en el destinatario de campaña y el contador
// que incrementa en la campaña.
const RECIPIENT_EVENTS = {
  'email.delivered':  { status: 'delivered',   stamp: 'deliveredAt',  counter: 'deliveredCount' },
  'email.opened':     { status: 'opened',      stamp: 'firstOpenAt',  counter: 'openCount',  count: 'openCount' },
  'email.clicked':    { status: 'clicked',     stamp: 'firstClickAt', counter: 'clickCount', count: 'clickCount' },
  'email.bounced':    { status: 'bounced',     counter: 'bouncedCount' },
  'email.complained': { status: 'complained',  counter: 'complainedCount' },
};

// Un correo se abre varias veces; el estado no debe retroceder de 'clicked' a
// 'opened' ni de 'bounced' a 'delivered'.
const STATUS_RANK = { pending: 0, sent: 1, delivered: 2, opened: 3, clicked: 4, bounced: 5, complained: 6 };

async function applyCampaignEvent(type, messageId) {
  const event = RECIPIENT_EVENTS[type];
  if (!event) return;

  const recipient = await CampaignRecipient.findOne({ messageId });
  if (!recipient) return;

  const update = { $inc: {} };
  if ((STATUS_RANK[event.status] ?? 0) > (STATUS_RANK[recipient.status] ?? 0)) {
    update.$set = { status: event.status };
    if (event.stamp && !recipient[event.stamp]) {
      update.$set[event.stamp] = new Date();
    }
  }
  if (event.count) update.$inc[event.count] = 1;
  if (!Object.keys(update.$inc).length) delete update.$inc;

  await CampaignRecipient.updateOne({ _id: recipient._id }, update);

  // La métrica de la campaña cuenta eventos únicos por destinatario: 40
  // aperturas de la misma persona no son 40 personas interesadas.
  const isFirst = !event.stamp || !recipient[event.stamp];
  if (isFirst) {
    await mongoose.models.Campaign?.findByIdAndUpdate(recipient.campaign, { $inc: { [event.counter]: 1 } });
  }
}

async function applyDeliveryEvent(type, data, io) {
  const messageId = data?.email_id || data?.id;
  if (!messageId) return;

  const status = DELIVERY_STATUS[type];
  await applyCampaignEvent(type, messageId);
  const activity = await Activity.findOneAndUpdate(
    { 'emailData.messageId': messageId },
    {
      $set: { 'metadata.deliveryStatus': status, [`metadata.deliveryTimes.${status}`]: new Date() },
      // Un contacto puede abrir el mismo correo varias veces: interesa el conteo.
      $inc: { [`metadata.deliveryCounts.${status}`]: 1 },
    },
    { new: true },
  );
  // Un rebote duro o una queja de spam bloquean la dirección para todo el CRM.
  if (type === 'email.bounced' || type === 'email.complained') {
    const recipients = Array.isArray(data.to) ? data.to : [data.to].filter(Boolean);
    const { hard, detail } = suppression.classifyBounce(data);
    for (const address of recipients) {
      await suppression.recordBounce(address, {
        hard, complaint: type === 'email.complained', detail,
      });
    }
    io?.emit('email_suppressed', { addresses: recipients, reason: type, detail });
  }

  if (activity?.lead) {
    io?.to(`lead_${activity.lead}`).emit('email_status', { leadId: activity.lead, activityId: activity._id, status });
  }
}

// POST /api/webhooks/resend
router.post('/resend', async (req, res) => {
  const verification = verifySvix(req);
  if (!verification.ok) {
    console.warn(`⚠️ Resend webhook rechazado: ${verification.reason}`);
    return res.status(401).json({ error: 'Firma inválida' });
  }

  // Responder rápido: Resend reintenta si el handler tarda, y el procesamiento
  // (buscar lead, reenviar copia) no debe bloquear la confirmación.
  res.status(200).json({ status: 'ok' });

  try {
    const event = JSON.parse(verification.body);
    if (event.type === 'email.received' || event.type === 'inbound.email.created') {
      await processInbound(event.data, req.io);
    } else if (DELIVERY_STATUS[event.type]) {
      await applyDeliveryEvent(event.type, event.data, req.io);
    }
  } catch (error) {
    console.error('[webhook/resend]', error);
  }
});

module.exports = router;
