const express = require('express');
const router = express.Router();
const axios = require('axios');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const { auth } = require('../middleware/auth');
const { processInboundMessage } = require('../services/aiAgent');

// ============================================
// SERVICIO WHATSAPP (Meta Cloud API)
// ============================================
const WA_API_URL = 'https://graph.facebook.com/v18.0';

const sendWhatsApp = async ({ to, message, templateName, templateParams, mediaUrl, mediaType }) => {
  const phoneId = process.env.META_WA_PHONE_ID;
  const token = process.env.META_WA_TOKEN;

  let payload;

  if (templateName) {
    // Mensaje por plantilla (para iniciar conversación)
    payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'es_MX' },
        components: templateParams ? [{
          type: 'body',
          parameters: templateParams.map(p => ({ type: 'text', text: p }))
        }] : []
      }
    };
  } else if (mediaUrl) {
    // Mensaje con medio (imagen, PDF, etc.)
    payload = {
      messaging_product: 'whatsapp',
      to,
      type: mediaType || 'image',
      [mediaType || 'image']: { link: mediaUrl }
    };
  } else {
    // Mensaje de texto simple
    payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message, preview_url: false }
    };
  }

  const response = await axios.post(
    `${WA_API_URL}/${phoneId}/messages`,
    payload,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  return response.data;
};

// ============================================
// RUTAS API
// ============================================

// POST /api/whatsapp/send — envio manual desde el CRM
router.post('/send', auth, async (req, res) => {
  try {
    const { leadId, message, mediaUrl, mediaType } = req.body;
    
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead no encontrado' });
    if (!lead.whatsapp && !lead.phone) {
      return res.status(400).json({ success: false, message: 'El lead no tiene número de WhatsApp' });
    }

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
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/whatsapp/template — envio de plantilla aprobada
router.post('/template', auth, async (req, res) => {
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
router.get('/templates', auth, async (req, res) => {
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

// GET /api/whatsapp/conversations/:leadId
router.get('/conversations/:leadId', auth, async (req, res) => {
  try {
    const activities = await Activity.find({
      lead: req.params.leadId,
      type: { $in: ['whatsapp_in', 'whatsapp_out'] }
    })
    .populate('user', 'name avatar')
    .sort({ createdAt: 1 });

    res.json({ success: true, data: activities });
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

  if (mode === 'subscribe' && token === process.env.META_WA_VERIFY_TOKEN) {
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

module.exports = router;
module.exports.sendWhatsApp = sendWhatsApp;
