const express = require('express');
const router = express.Router();
const axios = require('axios');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const { auth, checkPerm } = require('../middleware/auth');
const { processInboundMessage } = require('../services/aiAgent');
const wa = require('../services/whatsappService');
const templateStore = require('../services/waTemplateStore');
const multer = require('multer');

// Encabezado con archivo: Meta acepta JPG, PNG, MP4 y PDF hasta 5 MB.
const HEADER_MIME = ['image/jpeg', 'image/png', 'video/mp4', 'application/pdf'];
const headerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(
    HEADER_MIME.includes(file.mimetype) ? null : new Error('Solo se permiten JPG, PNG, MP4 o PDF'),
    HEADER_MIME.includes(file.mimetype),
  ),
});

// ── Backward-compat wrapper uses new Meta service ─────────────────────────────
const sendWhatsApp = async ({ to, message, templateName, templateParams, mediaUrl, mediaType }) => {
  const phone = wa.normalizePhone(to) || to;
  if (templateName) {
    const components = templateParams ? [{ type: 'body', parameters: templateParams.map(p => ({ type: 'text', text: p })) }] : [];
    return wa.sendTemplate(phone, templateName, 'es_MX', components);
  }
  if (mediaUrl) return wa.sendMedia(phone, mediaType || 'image', mediaUrl);
  return wa.sendText(phone, message);
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

        // Meta avisa por aquí cuando aprueba o rechaza una plantilla. Es el
        // equivalente al evento `template.status` de Labia, así que se resuelve
        // con el mismo código y el aviso le llega igual a quien la creó.
        if (change.field === 'message_template_status_update') {
          const { handleTemplateStatus } = require('./webhooks');
          await handleTemplateStatus({
            name: val.message_template_name,
            language: val.message_template_language,
            templateId: val.message_template_id,
            event: val.event,
            reason: val.reason,
          }, req.io);
          continue;
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

// GET /api/whatsapp/meta/status — proveedor activo y si está listo para enviar
router.get('/meta/status', auth, checkPerm('whatsapp.view'), (req, res) => {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.META_WA_PHONE_ID;
  res.json({
    success: true,
    data: {
      ...wa.status(),
      phoneNumberId: phoneId ? '***' + phoneId.slice(-4) : null,
    },
  });
});

// POST /api/whatsapp/meta/templates/sync — trae de Meta las plantillas creadas
// fuera del CRM. Solo tiene sentido con Labia, que mantiene su propia copia.
router.post('/meta/templates/sync', auth, checkPerm('whatsapp.templates'), async (req, res) => {
  try {
    if (wa.activeProvider() !== 'labia') {
      return res.status(400).json({ success: false, message: 'Sincronizar solo aplica al proveedor Labia' });
    }
    const result = await wa.labia.syncTemplates();
    res.json({ success: true, data: result, message: 'Plantillas sincronizadas desde Meta' });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.message });
  }
});

// GET /api/whatsapp/meta/templates — plantillas del proveedor + las pendientes
// que el CRM envió a revisión y todavía no aparecen en su lista.
router.get('/meta/templates', auth, checkPerm('whatsapp.templates'), async (req, res) => {
  try {
    const provider = wa.activeProvider();
    const templates = await wa.listTemplates();
    // Listar es también el momento de refrescar el espejo: si un webhook se
    // perdió, el estado se corrige igual en cuanto alguien abre la pantalla.
    const merged = await templateStore.syncFromProvider(templates, provider);
    // El mapeo de variables solo lo sabe el CRM, no el proveedor: se adjunta
    // para que el asistente de envío pueda rellenar solo las del lead.
    res.json({ success: true, data: await templateStore.attachVariables(merged) });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.message });
  }
});

// POST /api/whatsapp/meta/send-text — send text via Meta Cloud API
router.post('/meta/send-text', auth, checkPerm('whatsapp.send'), async (req, res) => {
  try {
    const { to, message, leadId } = req.body;
    if (!to || !message) return res.status(400).json({ success: false, message: 'Falta teléfono o mensaje' });

    const result = await wa.sendText(to, message);

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

// POST /api/whatsapp/meta/templates/media — sube el archivo del encabezado y
// devuelve el identificador que hay que adjuntar al crear la plantilla.
router.post('/meta/templates/media', auth, checkPerm('whatsapp.templates'),
  headerUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'Falta el archivo' });
      if (wa.activeProvider() !== 'labia') {
        return res.status(400).json({
          success: false,
          message: 'El encabezado con archivo requiere el proveedor Labia: Meta exige una sesión de subida propia',
        });
      }
      const handle = await wa.labia.uploadTemplateHeader(
        req.file.buffer, req.file.originalname, req.file.mimetype
      );
      res.json({ success: true, data: { headerHandle: handle } });
    } catch (e) {
      res.status(e.status || 400).json({ success: false, message: e.message });
    }
  });

// POST /api/whatsapp/meta/templates — crear plantilla (queda a aprobación de Meta)
router.post('/meta/templates', auth, checkPerm('whatsapp.templates'), async (req, res) => {
  try {
    const body = req.body || {};
    // Los ejemplos que Meta exige salen del mapeo de variables, así el
    // ejecutivo no los escribe dos veces.
    const variables = templateStore.normalizeVariables(body.variables, body.bodyText);
    const payload = {
      ...body,
      variables,
      examples: variables.map((v, i) => v.sample || body.examples?.[i] || `Ejemplo ${i + 1}`),
      buttons: templateStore.normalizeButtons(body.buttons),
    };

    const result = await wa.createTemplate(payload);

    // Se guarda el espejo local aunque la respuesta del proveedor sea escueta:
    // es lo que permite avisar a quien la creó cuando Meta responda.
    const saved = await templateStore.recordSubmission({
      template: { ...payload, name: result.name, status: result.status, providerId: result.id },
      provider: wa.activeProvider(),
      userId: req.user._id,
    });

    res.json({
      success: true,
      data: { ...result, variables: saved.variables },
      message: `Plantilla "${result.name}" enviada a aprobación de Meta (estado: ${saved.status})`,
    });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.response?.data?.error?.message || e.message });
  }
});

// POST /api/whatsapp/meta/send-template — send approved template
router.post('/meta/send-template', auth, checkPerm('whatsapp.send'), async (req, res) => {
  try {
    const { to, templateName, languageCode, components, leadId } = req.body;
    if (!to || !templateName) return res.status(400).json({ success: false, message: 'Falta teléfono o template' });

    const result = await wa.sendTemplate(to, templateName, languageCode || 'es_MX', components || []);

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
// El webhook de Labia atiende los mismos mensajes entrantes por otra puerta
// (routes/webhooks.js), así que reutiliza esta función en lugar de duplicarla.
module.exports.handleIncomingMessage = handleIncomingMessage;
