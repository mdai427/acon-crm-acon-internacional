const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Lead = require('../models/Lead');
const { scoreLeadWithAI } = require('../services/aiAgent');

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
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
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

// POST /api/webhooks/generic — recibir leads de cualquier fuente via HTTP
router.post('/generic', express.json(), async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    // WEBHOOK_API_KEY independiente; el slice del JWT_SECRET queda solo como
    // compatibilidad con integraciones ya configuradas.
    const validKey = process.env.WEBHOOK_API_KEY || process.env.JWT_SECRET?.slice(0, 20);
    if (!apiKey || apiKey !== validKey) {
      return res.status(401).json({ success: false, message: 'API key invalida' });
    }

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
router.post('/linkedin', express.json(), async (req, res) => {
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

module.exports = router;
