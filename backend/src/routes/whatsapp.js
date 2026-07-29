const express = require('express');
const router = express.Router();
const axios = require('axios');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const { auth, checkPerm } = require('../middleware/auth');
const { processInboundMessage } = require('../services/aiAgent');
const metaWA = require('../services/whatsappMetaService');

// ── Backward-compat wrapper uses new Meta service ─────────────────────────────
const sendWhatsApp = async ({ to, message, templateName, templateParams, mediaUrl, mediaType }) => {
  const phone = metaWA.normalizePhone(to) || to;
  if (templateName) {
    const components = templateParams ? [{ type: 'body', parameters: templateParams.map(p => ({ type: 'text', text: p })) }] : [];
    return metaWA.sendTemplate(phone, templateName, 'es_MX', components);
  }
  if (mediaUrl) return metaWA.sendMedia(phone, mediaType || 'image', mediaUrl);
  return metaWA.sendText(phone, message);
};

// ============================================
// RUTAS API
// ============================================

// POST /api/whatsapp/send — envio manual desde el CRM
router.post('/send', auth, checkPerm('whatsapp.send'), async (req, res) => {
  try {
    const { leadId, message, mediaUrl, mediaType } = req.body;
    
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead no encontrado' });
    if (!lead.whatsapp && !lead.phone) {
      return res.status(400).json({ success: false, message: 'El lead no tiene número de WhatsApp' });
    }

    // Texto libre solo con la ventana de 24 h abierta (fuente única: waWindow).
    await require('../services/waWindow').assertOpen(leadId);

    const to = lead.whatsapp || lead.phone;
    const result = await sendWhatsApp({ to, message, mediaUrl, mediaType });

    // Guardar actividad
    const activity = await Activity.create({
      lead: leadId,
      user: req.user._id,
      type: 'whatsapp_out',
      direction: 'outbound',
      content: message || `[Media: ${mediaType}]`,
      waData: {
        messageId: result.messages?.[0]?.id,
        to,
        mediaUrl,
        mediaType,
        status: 'sent'
      }
    });

    // Actualizar fecha de ultimo contacto
    await Lead.findByIdAndUpdate(leadId, { lastContactDate: new Date() });

    req.io?.emit('activity_new', { leadId, activity });
    res.json({ success: true, messageId: result.messages?.[0]?.id, activity });
  } catch (error) {
    console.error('WhatsApp send error:', error.response?.data || error.message);
    res.status(error.status || 500).json({
      success: false,
      message: error.message,
      windowClosed: !!error.windowClosed,
    });
  }
});

// POST /api/whatsapp/template — envio de plantilla aprobada
router.post('/template', auth, checkPerm('whatsapp.send'), async (req, res) => {
  try {
    const { leadId, templateName, templateParams } = req.body;
    
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead no encontrado' });

    const to = lead.whatsapp || lead.phone;
    const result = await sendWhatsApp({ to, templateName, templateParams });

    await Activity.create({
      lead: leadId,
      user: req.user._id,
      type: 'whatsapp_out',
      direction: 'outbound',
      content: `Plantilla enviada: ${templateName}`,
      isAuto: false,
      waData: { messageId: result.messages?.[0]?.id, to, status: 'sent' }
    });

    await Lead.findByIdAndUpdate(leadId, { lastContactDate: new Date() });
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/whatsapp/templates — lista de plantillas aprobadas
router.get('/templates', auth, checkPerm('whatsapp.view'), async (req, res) => {
  // Plantillas predefinidas para ACON
  const templates = [
    {
      id: 'acon_primer_contacto',
      name: 'Primer contacto',
      preview: 'Hola {{1}}, soy {{2}} de ACON Worldwide Logística. Vi que tienes necesidades de {{3}}...',
      params: ['nombre_contacto', 'nombre_ejecutivo', 'servicio']
    },
    {
      id: 'acon_cotizacion_lista',
      name: 'Cotización lista',
      preview: 'Hola {{1}}, tu cotización de flete {{2}} de {{3}} a {{4}} ya está lista...',
      params: ['contacto', 'tipo_flete', 'origen', 'destino']
    },
    {
      id: 'acon_seguimiento',
      name: 'Seguimiento general',
      preview: 'Hola {{1}}, quedé de darte seguimiento respecto a {{2}}. ¿Tienes un momento?',
      params: ['contacto', 'tema']
    },
    {
      id: 'acon_bienvenida_cliente',
      name: 'Bienvenida cliente nuevo',
      preview: 'Bienvenido a ACON {{1}}. Estamos listos para gestionar tu primer embarque...',
      params: ['empresa']
    }
  ];
  res.json({ success: true, data: templates });
});

// La bandeja mezcla los dos canales: la conversación con un cliente es una
// sola, aunque unos mensajes lleguen por WhatsApp y otros por correo.
const CHAT_TYPES = ['whatsapp_in', 'whatsapp_out', 'email_in', 'email_out'];
const INBOUND_TYPES = ['whatsapp_in', 'email_in'];

// GET /api/whatsapp/conversations — bandeja con último mensaje y no leídos
router.get('/conversations', auth, checkPerm('whatsapp.view'), async (req, res) => {
  try {
    const Lead = require('../models/Lead');

    // Un ejecutivo solo ve las conversaciones de sus leads.
    const leadFilter = { isActive: true };
    if (req.user.role === 'executive') leadFilter.assignedTo = req.user._id;
    const leadIds = await Lead.find(leadFilter).distinct('_id');

    const resumen = await Activity.aggregate([
      { $match: { lead: { $in: leadIds }, type: { $in: CHAT_TYPES } } },
      { $sort: { createdAt: -1 } },
      { $group: {
        _id: '$lead',
        lastAt: { $first: '$createdAt' },
        lastType: { $first: '$type' },
        lastContent: { $first: '$content' },
        lastSubject: { $first: '$subject' },
        // Último mensaje del cliente por WhatsApp: define la ventana de 24 h.
        lastWaIn: { $max: { $cond: [{ $eq: ['$type', 'whatsapp_in'] }, '$createdAt', null] } },
        // Entrante sin marcar como leído; los de WhatsApp antiguos no tienen
        // el campo, así que se cuenta también cuando falta.
        unread: { $sum: { $cond: [
          { $and: [
            { $in: ['$type', INBOUND_TYPES] },
            { $ne: ['$metadata.isRead', true] },
          ] }, 1, 0,
        ] } },
      } },
      { $sort: { lastAt: -1 } },
      { $limit: 100 },
    ]);

    const leads = await Lead.find({ _id: { $in: resumen.map(r => r._id) } })
      .select('company contact whatsapp email assignedTo')
      .lean();
    const leadById = Object.fromEntries(leads.map(l => [String(l._id), l]));

    const { windowFrom } = require('../services/waWindow');
    const data = resumen
      .filter(r => leadById[String(r._id)])
      .map(r => ({
        leadId: r._id,
        lead: leadById[String(r._id)],
        channel: r.lastType.startsWith('email') ? 'email' : 'whatsapp',
        direction: r.lastType.endsWith('_in') ? 'inbound' : 'outbound',
        preview: (r.lastSubject || r.lastContent || '').replace(/<[^>]*>/g, '').slice(0, 120),
        lastAt: r.lastAt,
        unread: r.unread,
        waWindow: windowFrom(r.lastWaIn),
      }));

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/whatsapp/conversations/:leadId — hilo completo (WhatsApp + correo)
router.get('/conversations/:leadId', auth, checkPerm('whatsapp.view'), async (req, res) => {
  try {
    const [activities, waWindow] = await Promise.all([
      Activity.find({ lead: req.params.leadId, type: { $in: CHAT_TYPES } })
        .populate('user', 'name avatar')
        .sort({ createdAt: 1 }),
      require('../services/waWindow').getWindow(req.params.leadId),
    ]);

    res.json({ success: true, data: activities, waWindow });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/whatsapp/conversations/:leadId/read — marcar la conversación leída
router.post('/conversations/:leadId/read', auth, checkPerm('whatsapp.view'), async (req, res) => {
  try {
    const r = await Activity.updateMany(
      { lead: req.params.leadId, type: { $in: INBOUND_TYPES }, 'metadata.isRead': { $ne: true } },
      { $set: { 'metadata.isRead': true } }
    );
    res.json({ success: true, updated: r.modifiedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// WEBHOOK DE META (recibir mensajes entrantes)
// ============================================

// GET /api/whatsapp/webhook — verificacion de Meta
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.META_WA_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === 'subscribe' && token === verifyToken) {
    console.log('✅ WhatsApp Webhook verificado');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// POST /api/whatsapp/webhook — mensajes entrantes
router.post('/webhook', express.json(), async (req, res) => {
  res.sendStatus(200); // Responder rapido a Meta

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const val = change.value;

        // Mensajes entrantes
        if (val.messages) {
          for (const msg of val.messages) {
            await handleIncomingMessage(msg, val.contacts?.[0], req.io);
          }
        }

        // Actualizaciones de estado (sent, delivered, read)
        if (val.statuses) {
          for (const status of val.statuses) {
            await Activity.findOneAndUpdate(
              { 'waData.messageId': status.id },
              { 'waData.status': status.status }
            );
          }
        }
      }
    }
  } catch (error) {
    console.error('Webhook WA error:', error);
  }
});

async function handleIncomingMessage(msg, contact, io) {
  const from = msg.from; // numero del remitente
  const text = msg.text?.body || msg.caption || '[media]';
  const contactName = contact?.profile?.name || from;

  // Buscar lead existente por numero de WA
  let lead = await Lead.findOne({
    $or: [{ whatsapp: from }, { phone: from }],
    isActive: true
  });

  // Si no existe, crear nuevo lead
  if (!lead) {
    lead = await Lead.create({
      company: contactName,
      contact: contactName,
      whatsapp: from,
      phone: from,
      source: 'whatsapp',
      stage: 'new',
      externalIds: { whatsappConversationId: msg.id }
    });
    console.log(`🆕 Nuevo lead WA creado: ${from}`);
  }

  // Guardar mensaje entrante
  const activity = await Activity.create({
    lead: lead._id,
    type: 'whatsapp_in',
    direction: 'inbound',
    content: text,
    waData: {
      messageId: msg.id,
      from,
      mediaUrl: msg.image?.id || msg.document?.id || null,
      mediaType: msg.type !== 'text' ? msg.type : null,
      status: 'received'
    }
  });

  await Lead.findByIdAndUpdate(lead._id, { lastContactDate: new Date() });

  // Notificar al ejecutivo asignado via socket
  const leadPopulated = await Lead.findById(lead._id).populate('assignedTo', 'name');
  if (leadPopulated?.assignedTo) {
    io?.to(`user_${leadPopulated.assignedTo._id}`).emit('whatsapp_message', {
      leadId: lead._id,
      activity,
      from: contactName
    });
  }
  // Tambien emitir a admin
  io?.to('role_admin').emit('whatsapp_message', { leadId: lead._id, activity, from: contactName });

  // Procesar con agente IA (respuesta automatica si aplica)
  await processInboundMessage({ lead, message: text, channel: 'whatsapp', io });
}

// GET /api/whatsapp/meta/status — check if Meta Cloud API is configured
router.get('/meta/status', auth, checkPerm('whatsapp.view'), (req, res) => {
  res.json({
    success: true,
    data: {
      configured: metaWA.isConfigured(),
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ? '***' + process.env.WHATSAPP_PHONE_NUMBER_ID.slice(-4) : null,
    },
  });
});

// GET /api/whatsapp/meta/templates — list approved templates from Meta
router.get('/meta/templates', auth, checkPerm('whatsapp.templates'), async (req, res) => {
  try {
    const templates = await metaWA.listTemplates();
    res.json({ success: true, data: templates });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/whatsapp/meta/send-text — send text via Meta Cloud API
router.post('/meta/send-text', auth, checkPerm('whatsapp.send'), async (req, res) => {
  try {
    const { to, message, leadId } = req.body;
    if (!to || !message) return res.status(400).json({ success: false, message: 'Falta teléfono o mensaje' });

    const result = await metaWA.sendText(to, message);

    // Log activity if leadId provided
    if (leadId) {
      await Activity.create({
        lead: leadId, user: req.user._id,
        type: 'whatsapp_out', direction: 'outbound',
        content: message,
        waData: { messageId: result.messages?.[0]?.id, to, status: 'sent' },
      });
      await Lead.findByIdAndUpdate(leadId, { lastContactDate: new Date() });
    }

    res.json({ success: true, data: result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// POST /api/whatsapp/meta/templates — crear plantilla (queda a aprobación de Meta)
router.post('/meta/templates', auth, checkPerm('whatsapp.templates'), async (req, res) => {
  try {
    const result = await metaWA.createTemplate(req.body || {});
    res.json({
      success: true,
      data: result,
      message: `Plantilla "${result.name}" enviada a aprobación de Meta (estado: ${result.status || 'PENDING'})`,
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.response?.data?.error?.message || e.message });
  }
});

// POST /api/whatsapp/meta/send-template — send approved template
router.post('/meta/send-template', auth, checkPerm('whatsapp.send'), async (req, res) => {
  try {
    const { to, templateName, languageCode, components, leadId } = req.body;
    if (!to || !templateName) return res.status(400).json({ success: false, message: 'Falta teléfono o template' });

    const result = await metaWA.sendTemplate(to, templateName, languageCode || 'es_MX', components || []);

    if (leadId) {
      await Activity.create({
        lead: leadId, user: req.user._id,
        type: 'whatsapp_out', direction: 'outbound',
        content: `[Plantilla: ${templateName}]`,
        waData: { template: templateName, messageId: result.messages?.[0]?.id, status: 'sent' },
      });
    }

    res.json({ success: true, data: result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

module.exports = router;
module.exports.sendWhatsApp = sendWhatsApp;
