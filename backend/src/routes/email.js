const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const { auth } = require('../middleware/auth');

// ============================================
// CONFIGURACION SMTP
// ============================================
let transporter;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransporter({
      host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
      port:   Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return transporter;
};

// ============================================
// PLANTILLAS DE EMAIL PARA LOGISTICA
// ============================================
const emailTemplates = {
  primer_contacto: (data) => ({
    subject: `ACON Worldwide – Soluciones logísticas para ${data.company}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#F07B1A;padding:20px;text-align:center">
          <h1 style="color:white;margin:0">ACON WORLDWIDE LOGÍSTICA</h1>
        </div>
        <div style="padding:30px;background:#fff">
          <p>Estimado/a <strong>${data.contact}</strong>,</p>
          <p>Me comunico de parte de <strong>ACON Worldwide Logística</strong>, empresa mexicana con más de 12 años de experiencia en soluciones logísticas internacionales.</p>
          <p>Entendemos que empresas como <strong>${data.company}</strong> requieren un socio logístico confiable que maneje sus importaciones y exportaciones con eficiencia.</p>
          <p>Ofrecemos:</p>
          <ul>
            <li>🚢 Flete marítimo FCL/LCL (importación y exportación)</li>
            <li>✈️ Flete aéreo internacional</li>
            <li>🚛 Transporte terrestre USA, Canadá y nacional</li>
            <li>📋 Despacho aduanal y asesoría en NOMS</li>
            <li>🔒 Seguro de carga</li>
          </ul>
          <p>¿Podríamos agendar una llamada de 15 minutos esta semana?</p>
          <p>Atentamente,<br><strong>${data.executiveName}</strong><br>ACON Worldwide Logística<br>${data.executivePhone || ''}</p>
        </div>
        <div style="background:#222;padding:15px;text-align:center">
          <p style="color:#999;font-size:12px;margin:0">aconinternacional.com | sarahi.noriega@aconinternacional.com</p>
        </div>
      </div>
    `
  }),

  cotizacion: (data) => ({
    subject: `Cotización de flete ${data.serviceType} – ACON Worldwide`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#F07B1A;padding:20px;text-align:center">
          <h1 style="color:white;margin:0">Cotización Logística</h1>
          <p style="color:white;margin:5px 0">Folio: ${data.folio || 'COT-' + Date.now()}</p>
        </div>
        <div style="padding:30px;background:#fff">
          <p>Estimado/a <strong>${data.contact}</strong>,</p>
          <p>Adjunto encontrará la cotización para el servicio de <strong>${data.serviceType}</strong>:</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0">
            <tr style="background:#f5f5f5"><th style="padding:10px;text-align:left">Concepto</th><th style="padding:10px;text-align:right">Tarifa</th></tr>
            ${(data.items || []).map(item => `
              <tr style="border-bottom:1px solid #eee">
                <td style="padding:10px">${item.concept}</td>
                <td style="padding:10px;text-align:right">${item.price}</td>
              </tr>
            `).join('')}
          </table>
          <p><strong>Vigencia:</strong> ${data.validity || '15 días'}</p>
          <p>Quedamos a sus órdenes para cualquier aclaración.</p>
        </div>
      </div>
    `
  }),

  seguimiento: (data) => ({
    subject: `Seguimiento – ${data.topic} | ACON Worldwide`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#F07B1A;padding:20px;text-align:center">
          <h1 style="color:white;margin:0">ACON WORLDWIDE</h1>
        </div>
        <div style="padding:30px;background:#fff">
          <p>Estimado/a <strong>${data.contact}</strong>,</p>
          <p>Me comunico para dar seguimiento a ${data.topic}.</p>
          <p>${data.message}</p>
          <p>¿Podemos coordinar una llamada esta semana para avanzar?</p>
          <p>Atentamente,<br><strong>${data.executiveName}</strong></p>
        </div>
      </div>
    `
  })
};

// ============================================
// RUTAS
// ============================================

// POST /api/email/send
router.post('/send', auth, async (req, res) => {
  try {
    const { leadId, subject, html, text, template, templateData, attachments } = req.body;

    const lead = await Lead.findById(leadId).populate('assignedTo', 'name phone');
    if (!lead?.email) {
      return res.status(400).json({ success: false, message: 'Lead sin email registrado' });
    }

    let emailContent = { subject, html, text };

    // Usar plantilla si se especifica
    if (template && emailTemplates[template]) {
      const tmplData = {
        ...templateData,
        contact: lead.contact,
        company: lead.company,
        executiveName: lead.assignedTo?.name || 'Equipo ACON',
        executivePhone: lead.assignedTo?.phone
      };
      emailContent = emailTemplates[template](tmplData);
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || '"ACON CRM" <crm@aconinternacional.com>',
      to:   lead.email,
      ...emailContent,
      attachments: attachments || []
    };

    const info = await getTransporter().sendMail(mailOptions);

    const activity = await Activity.create({
      lead: leadId,
      user: req.user._id,
      type: 'email_out',
      direction: 'outbound',
      subject: emailContent.subject,
      content: emailContent.text || emailContent.html?.replace(/<[^>]*>/g, '').slice(0, 500),
      emailData: {
        messageId: info.messageId,
        from: mailOptions.from,
        to: [lead.email]
      }
    });

    await Lead.findByIdAndUpdate(leadId, { lastContactDate: new Date() });
    req.io?.emit('activity_new', { leadId, activity });

    res.json({ success: true, messageId: info.messageId, activity });
  } catch (error) {
    console.error('Email send error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/email/bulk — envio masivo a multiples leads
router.post('/bulk', auth, async (req, res) => {
  try {
    const { leadIds, template, templateData, customSubject, customHtml } = req.body;

    const leads = await Lead.find({
      _id: { $in: leadIds },
      email: { $exists: true, $ne: '' }
    }).populate('assignedTo', 'name phone');

    const results = { sent: 0, failed: 0, errors: [] };

    for (const lead of leads) {
      try {
        let emailContent;
        if (template && emailTemplates[template]) {
          emailContent = emailTemplates[template]({
            ...templateData,
            contact: lead.contact,
            company: lead.company,
            executiveName: lead.assignedTo?.name || 'Equipo ACON',
            executivePhone: lead.assignedTo?.phone
          });
        } else {
          emailContent = { subject: customSubject, html: customHtml };
        }

        await getTransporter().sendMail({
          from: process.env.EMAIL_FROM,
          to: lead.email,
          ...emailContent
        });

        await Activity.create({
          lead: lead._id,
          user: req.user._id,
          type: 'email_out',
          direction: 'outbound',
          subject: emailContent.subject,
          content: `Email masivo: ${template || 'personalizado'}`,
          isAuto: false
        });

        await Lead.findByIdAndUpdate(lead._id, { lastContactDate: new Date() });
        results.sent++;
        
        // Pequena pausa para no saturar SMTP
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        results.failed++;
        results.errors.push({ leadId: lead._id, error: err.message });
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/email/templates
router.get('/templates', auth, (req, res) => {
  const list = Object.keys(emailTemplates).map(key => ({
    id: key,
    name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    preview: emailTemplates[key]({ contact: '[Contacto]', company: '[Empresa]', executiveName: '[Ejecutivo]', topic: '[Tema]', message: '[Mensaje]', serviceType: '[Servicio]', items: [] }).subject
  }));
  res.json({ success: true, data: list });
});

module.exports = router;
module.exports.sendEmail = async (to, template, data) => {
  if (!emailTemplates[template]) throw new Error(`Template ${template} no existe`);
  const content = emailTemplates[template](data);
  return getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to,
    ...content
  });
};
