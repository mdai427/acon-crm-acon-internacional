// ============================================
// ACON CRM — Endpoints dedicados para n8n
// Todos los flujos de automatización pasan por aquí
// ============================================
const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const User = require('../models/User');
const { auth, adminOnly } = require('../middleware/auth');
const { scoreLeadWithAI } = require('../services/aiAgent');

// ── Autenticación por API Key (para n8n) ──────────────────
// n8n envía Header: x-n8n-key: <valor de N8N_API_KEY en .env>
const n8nAuth = (req, res, next) => {
  const key = req.headers['x-n8n-key'];
  if (!process.env.N8N_API_KEY) {
    return res.status(500).json({ success: false, message: 'N8N_API_KEY no configurada en .env' });
  }
  if (key !== process.env.N8N_API_KEY) {
    return res.status(401).json({ success: false, message: 'API key inválida' });
  }
  next();
};

// ════════════════════════════════════════════
// 1. CREAR LEAD DESDE CUALQUIER FUENTE
//    n8n → POST /api/n8n/lead
//    Úsalo para: formularios web, LinkedIn, Typeform, HubSpot, Pipedrive, etc.
// ════════════════════════════════════════════
router.post('/lead', n8nAuth, async (req, res) => {
  try {
    const {
      company, contact, email, phone, whatsapp,
      source = 'other', sourceDetail, services = [],
      country = 'México', city, notes, value = 0,
      stage = 'new', priority = 'medium',
      assignedToEmail, tags = [],
      // Campos extra que n8n puede enviar (se guardan en notas)
      formData, utmSource, utmMedium, utmCampaign
    } = req.body;

    if (!company && !contact && !email) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere al menos uno: company, contact o email'
      });
    }

    // Buscar si ya existe (evitar duplicados por email o WhatsApp)
    if (email) {
      const existing = await Lead.findOne({ email, isActive: true });
      if (existing) {
        // Actualizar en vez de duplicar
        await Lead.findByIdAndUpdate(existing._id, {
          $set: { lastContactDate: new Date() },
          $push: { tags: 'n8n-update' }
        });
        return res.json({
          success: true,
          action: 'updated',
          leadId: existing._id,
          message: 'Lead existente actualizado'
        });
      }
    }

    // Asignar ejecutivo por email si se envía
    let assignedTo;
    if (assignedToEmail) {
      const user = await User.findOne({ email: assignedToEmail, isActive: true });
      if (user) assignedTo = user._id;
    }

    // Construir notas con formData extra si viene
    let fullNotes = notes || '';
    if (formData) {
      fullNotes += '\n\n[Datos del formulario]\n' +
        Object.entries(formData).map(([k, v]) => `${k}: ${v}`).join('\n');
    }

    const lead = await Lead.create({
      company:      company || contact || email,
      contact:      contact || company,
      email, phone, whatsapp,
      source, sourceDetail,
      services: (services || []).filter(s =>
        ['maritimo_import','maritimo_export','aereo_import','aereo_export',
         'terrestre_usa','terrestre_nacional','despacho_aduanal','almacenaje','seguro_carga'].includes(s)
      ),
      country, city, notes: fullNotes, value,
      stage, priority, assignedTo,
      tags: [...tags, 'n8n'],
      utmSource, utmMedium, utmCampaign,
      lastContactDate: new Date()
    });

    // Score automático con IA
    await scoreLeadWithAI(lead._id);
    const scored = await Lead.findById(lead._id);

    // Emitir a admins en tiempo real
    req.io?.to('role_admin').emit('new_lead', {
      lead: scored,
      source: `n8n → ${source}`
    });

    res.status(201).json({
      success: true,
      action: 'created',
      leadId: lead._id,
      score: scored.score,
      data: scored
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════
// 2. REGISTRAR ACTIVIDAD / MENSAJE EN UN LEAD
//    n8n → POST /api/n8n/activity
//    Úsalo para: mensajes de WA recibidos, emails, llamadas, etc.
// ════════════════════════════════════════════
router.post('/activity', n8nAuth, async (req, res) => {
  try {
    const {
      leadId, leadEmail, leadWhatsapp,
      type = 'note', direction = 'inbound',
      content, channel
    } = req.body;

    if (!content) return res.status(400).json({ success: false, message: 'content requerido' });

    // Encontrar el lead por ID, email o WhatsApp
    let lead;
    if (leadId) {
      lead = await Lead.findById(leadId);
    } else if (leadEmail) {
      lead = await Lead.findOne({ email: leadEmail, isActive: true });
    } else if (leadWhatsapp) {
      lead = await Lead.findOne({ whatsapp: leadWhatsapp, isActive: true });
    }

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead no encontrado' });
    }

    const activity = await Activity.create({
      lead: lead._id,
      type,
      direction,
      content,
      channel: channel || type
    });

    await Lead.findByIdAndUpdate(lead._id, { lastContactDate: new Date() });

    req.io?.emit('activity_new', { leadId: lead._id, activity });

    res.json({ success: true, activityId: activity._id, leadId: lead._id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════
// 3. ACTUALIZAR ETAPA DEL PIPELINE
//    n8n → POST /api/n8n/stage
//    Úsalo para: mover leads según respuestas de formularios, pagos, etc.
// ════════════════════════════════════════════
router.post('/stage', n8nAuth, async (req, res) => {
  try {
    const { leadId, leadEmail, newStage, reason } = req.body;
    const VALID_STAGES = ['new','contacted','qualified','proposal','negotiation','closed_won','closed_lost'];

    if (!VALID_STAGES.includes(newStage)) {
      return res.status(400).json({ success: false, message: `Etapa inválida. Usa: ${VALID_STAGES.join(', ')}` });
    }

    let lead;
    if (leadId) lead = await Lead.findById(leadId);
    else if (leadEmail) lead = await Lead.findOne({ email: leadEmail, isActive: true });

    if (!lead) return res.status(404).json({ success: false, message: 'Lead no encontrado' });

    const prevStage = lead.stage;
    await Lead.findByIdAndUpdate(lead._id, { stage: newStage });

    await Activity.create({
      lead: lead._id,
      type: 'stage_change',
      direction: 'internal',
      content: `n8n: Etapa ${prevStage} → ${newStage}${reason ? '. Razón: ' + reason : ''}`
    });

    req.io?.emit('pipeline_updated', { leadId: lead._id, stage: newStage });

    res.json({ success: true, leadId: lead._id, from: prevStage, to: newStage });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════
// 4. BUSCAR LEADS (para n8n IF/router nodes)
//    n8n → GET /api/n8n/leads?email=x&stage=y&source=z
// ════════════════════════════════════════════
router.get('/leads', n8nAuth, async (req, res) => {
  try {
    const { email, whatsapp, company, stage, source, limit = 10 } = req.query;
    const filter = { isActive: true };

    if (email)    filter.email    = email;
    if (whatsapp) filter.whatsapp = whatsapp;
    if (stage)    filter.stage    = stage;
    if (source)   filter.source   = source;
    if (company)  filter.company  = new RegExp(company, 'i');

    const leads = await Lead.find(filter)
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.json({ success: true, count: leads.length, data: leads });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════
// 5. ASIGNAR LEAD A EJECUTIVO
//    n8n → POST /api/n8n/assign
// ════════════════════════════════════════════
router.post('/assign', n8nAuth, async (req, res) => {
  try {
    const { leadId, leadEmail, executiveEmail, reason } = req.body;

    let lead;
    if (leadId) lead = await Lead.findById(leadId);
    else if (leadEmail) lead = await Lead.findOne({ email: leadEmail, isActive: true });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead no encontrado' });

    const executive = await User.findOne({ email: executiveEmail, isActive: true });
    if (!executive) return res.status(404).json({ success: false, message: 'Ejecutivo no encontrado' });

    await Lead.findByIdAndUpdate(lead._id, {
      assignedTo: executive._id,
      assignedAt: new Date()
    });

    await Activity.create({
      lead: lead._id,
      type: 'note',
      direction: 'internal',
      content: `n8n: Lead asignado a ${executive.name}${reason ? '. ' + reason : ''}`
    });

    req.io?.to(`user_${executive._id}`).emit('lead_assigned', { lead, executive });

    res.json({ success: true, leadId: lead._id, assignedTo: executive.name });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════
// 6. WEBHOOK GENÉRICO ENRIQUECIDO PARA n8n
//    n8n → POST /api/n8n/webhook
//    Recibe cualquier payload, lo mapea inteligentemente
// ════════════════════════════════════════════
router.post('/webhook', n8nAuth, async (req, res) => {
  try {
    const body = req.body;

    // Detección automática de tipo de payload
    // Typeform
    if (body.form_response) {
      const answers = body.form_response.answers || [];
      const fields = body.form_response.definition?.fields || [];
      const data = {};
      answers.forEach((a, i) => {
        const label = fields[i]?.title?.toLowerCase() || `field_${i}`;
        data[label] = a.text || a.email || a.phone_number || a.choice?.label || '';
      });
      body._mapped = {
        company:  data.empresa || data.company || data.razon_social || '',
        contact:  data.nombre  || data.name    || data.contacto     || '',
        email:    data.email   || data.correo  || '',
        phone:    data.telefono || data.phone  || '',
        whatsapp: data.whatsapp || data.telefono || '',
        source:   'web',
        notes:    JSON.stringify(data)
      };
    }

    // Facebook Lead Ads (via n8n Facebook node)
    if (body.field_data) {
      const fields = {};
      (body.field_data || []).forEach(f => { fields[f.name] = f.values?.[0]; });
      body._mapped = {
        company:  fields.company_name || fields.empresa || '',
        contact:  `${fields.first_name||''} ${fields.last_name||''}`.trim() || fields.full_name || '',
        email:    fields.email || '',
        phone:    fields.phone_number || fields.telefono || '',
        whatsapp: fields.whatsapp || fields.phone_number || '',
        source:   'facebook'
      };
    }

    // Google Sheets row
    if (body.values && Array.isArray(body.values)) {
      const [company, contact, email, phone, whatsapp, source, notes] = body.values;
      body._mapped = { company, contact, email, phone, whatsapp, source: source || 'other', notes };
    }

    const mapped = body._mapped || body;

    if (!mapped.company && !mapped.contact && !mapped.email) {
      return res.status(400).json({ success: false, message: 'No se pudo mapear el payload. Envía al menos: company, contact o email' });
    }

    // Crear lead con los datos mapeados
    const lead = await Lead.create({
      company:      mapped.company || mapped.contact || mapped.email,
      contact:      mapped.contact || mapped.company,
      email:        mapped.email,
      phone:        mapped.phone,
      whatsapp:     mapped.whatsapp || mapped.phone,
      source:       mapped.source || 'other',
      notes:        mapped.notes || '',
      country:      mapped.country || 'México',
      stage:        'new',
      tags:         ['n8n-webhook', mapped.source || 'other'],
      lastContactDate: new Date()
    });

    await scoreLeadWithAI(lead._id);
    const scored = await Lead.findById(lead._id);

    req.io?.to('role_admin').emit('new_lead', { lead: scored, source: 'n8n webhook' });

    res.status(201).json({
      success: true,
      leadId: lead._id,
      score: scored.score,
      mapped: mapped
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════
// 7. ESTADÍSTICAS PARA n8n DASHBOARDS
//    n8n → GET /api/n8n/stats
// ════════════════════════════════════════════
router.get('/stats', n8nAuth, async (req, res) => {
  try {
    const [total, byStage, bySource, recent] = await Promise.all([
      Lead.countDocuments({ isActive: true }),
      Lead.aggregate([{ $match: { isActive: true } }, { $group: { _id: '$stage', count: { $sum: 1 }, value: { $sum: '$value' } } }]),
      Lead.aggregate([{ $match: { isActive: true } }, { $group: { _id: '$source', count: { $sum: 1 } } }]),
      Lead.find({ isActive: true }).sort({ createdAt: -1 }).limit(5).select('company contact stage score source createdAt')
    ]);

    res.json({
      success: true,
      data: {
        total,
        byStage,
        bySource,
        recentLeads: recent,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════
// 8. PING / HEALTH CHECK para n8n
//    n8n → GET /api/n8n/ping
// ════════════════════════════════════════════
router.get('/ping', n8nAuth, (req, res) => {
  res.json({
    success: true,
    message: 'ACON CRM conectado',
    version: '1.0',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /api/n8n/lead       — Crear lead',
      'POST /api/n8n/activity   — Registrar actividad',
      'POST /api/n8n/stage      — Cambiar etapa',
      'POST /api/n8n/assign     — Asignar ejecutivo',
      'POST /api/n8n/webhook    — Webhook genérico (Typeform, FB, etc)',
      'GET  /api/n8n/leads      — Buscar leads',
      'GET  /api/n8n/stats      — Estadísticas',
      'GET  /api/n8n/ping       — Health check',
    ]
  });
});

module.exports = router;
