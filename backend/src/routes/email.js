const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const { auth, adminOnly, checkPerm } = require('../middleware/auth');
// El proveedor de correo (Resend o SMTP) se elige en services/mailerService.
const mailer = require('../services/mailerService');
const Mailbox = require('../models/Mailbox');
const mailboxService = require('../services/mailboxService');
const suppression = require('../services/suppressionService');
const EmailSuppression = require('../models/EmailSuppression');
const campaignSender = require('../services/campaignSender');

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

/**
 * Resuelve con qué buzón se envía. Si el usuario eligió uno se valida que tenga
 * acceso; si no, se toma el suyo por defecto. Devuelve null cuando todavía no
 * hay buzones creados: en ese caso se sigue usando el remitente global de
 * siempre, así las instalaciones existentes no se rompen.
 */
async function resolveSender(user, mailboxId) {
  if (mailboxId) {
    const mailbox = await Mailbox.findById(mailboxId);
    if (!mailbox) throw new Error('El buzón indicado no existe');
    if (!mailboxService.canUse(user, mailbox)) throw new Error('Sin acceso a ese buzón');
    return mailbox;
  }
  return mailboxService.defaultFor(user);
}

/**
 * Encabezados de hilo para que la respuesta se agrupe con el correo original
 * en el cliente del contacto (Gmail, Outlook).
 */
function threadHeaders(previous) {
  const parentId = previous?.emailData?.messageId;
  if (!parentId) return {};
  const chain = [previous?.metadata?.references, parentId].filter(Boolean).join(' ');
  return { 'In-Reply-To': parentId, References: chain };
}

// POST /api/email/send
router.post('/send', auth, checkPerm('email.send'), async (req, res) => {
  try {
    const {
      leadId, subject, html, text, template, templateData, attachments,
      mailboxId, replyToActivityId,
    } = req.body;

    const lead = await Lead.findById(leadId).populate('assignedTo', 'name phone');
    if (!lead?.email) {
      return res.status(400).json({ success: false, message: 'Lead sin email registrado' });
    }
    // Bloqueado por rebotes: se corta antes de gastar la llamada al proveedor.
    await suppression.assertSendable(lead.email);

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

    const mailbox = await resolveSender(req.user, mailboxId);
    // La respuesta del contacto vuelve con el lead codificado en la dirección,
    // así el hilo entra al chat correcto aunque conteste desde otro correo.
    const replyTo = mailbox ? mailboxService.buildReplyTo(mailbox, leadId) : undefined;

    const previous = replyToActivityId ? await Activity.findById(replyToActivityId) : null;

    if (mailbox?.signature && emailContent.html) {
      emailContent = { ...emailContent, html: `${emailContent.html}${mailbox.signature}` };
    }

    const mailOptions = {
      from: mailbox ? mailbox.fromHeader() : mailer.defaultFrom(),
      to:   lead.email,
      replyTo,
      headers: threadHeaders(previous),
      ...emailContent,
      attachments: attachments || []
    };

    const info = await mailer.sendMail(mailOptions);

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
      },
      metadata: {
        mailboxId: mailbox?._id || null,
        mailboxAddress: mailbox?.address || null,
        references: mailOptions.headers?.References || null,
        deliveryStatus: 'queued',
        html: emailContent.html || null,
      }
    });

    await Lead.findByIdAndUpdate(leadId, { lastContactDate: new Date() });
    req.io?.emit('activity_new', { leadId, activity });

    res.json({ success: true, messageId: info.messageId, activity });
  } catch (error) {
    console.error('Email send error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message, code: error.code });
  }
});

// POST /api/email/bulk — envio masivo a multiples leads
router.post('/bulk', auth, checkPerm('marketing.launch'), async (req, res) => {
  try {
    const { leadIds, template, templateData, customSubject, customHtml, mailboxId } = req.body;

    const leads = await Lead.find({
      _id: { $in: leadIds },
      email: { $exists: true, $ne: '' },
      // Los bloqueados por rebote quedan fuera del envío masivo.
      'emailStatus.canReceive': { $ne: false },
    }).populate('assignedTo', 'name phone');

    const mailbox = await resolveSender(req.user, mailboxId);
    const results = { sent: 0, failed: 0, skipped: 0, errors: [] };

    for (const lead of leads) {
      try {
        if (await suppression.isSuppressed(lead.email)) { results.skipped++; continue; }
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

        await mailer.sendMail({
          from: mailbox ? mailbox.fromHeader() : mailer.defaultFrom(),
          replyTo: mailbox ? mailboxService.buildReplyTo(mailbox, lead._id) : undefined,
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

// GET /api/email/unsubscribe — baja desde el pie de una campaña.
// Es pública a propósito: el contacto no tiene cuenta en el CRM. El token
// firmado impide dar de baja a un tercero adivinando la URL.
router.get('/unsubscribe', async (req, res) => {
  const { email, token } = req.query;
  const page = (title, message) => `<!doctype html><html lang="es"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title>
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#222">
      <h1 style="font-size:20px;color:#0B2545">${title}</h1>
      <p style="color:#5A6472;line-height:1.6">${message}</p>
    </div>`;

  try {
    if (!email || !campaignSender.verifyUnsubscribeToken(String(email), String(token))) {
      return res.status(400).send(page('Enlace inválido', 'El enlace de baja no es válido o expiró.'));
    }
    await suppression.suppressManually(String(email), 'Baja solicitada por el contacto');
    res.send(page('Listo, te diste de baja', `No volveremos a enviar correos a <strong>${String(email)}</strong>.`));
  } catch (error) {
    console.error('[unsubscribe]', error);
    res.status(500).send(page('Algo salió mal', 'Intenta de nuevo en unos minutos.'));
  }
});

// ── Salud del correo: rebotes y bloqueos ─────────────────────────

// GET /api/email/suppressions — direcciones que dejaron de recibir
router.get('/suppressions', auth, checkPerm('email.blocklist_view'), async (req, res) => {
  try {
    const list = await EmailSuppression.find({ releasedAt: null }).sort({ lastBounceAt: -1 }).limit(500);
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/email/suppressions — bloqueo manual (el contacto pidió no recibir)
router.post('/suppressions', auth, checkPerm('email.blocklist_edit'), async (req, res) => {
  try {
    const { address, detail } = req.body;
    if (!address) return res.status(400).json({ success: false, message: 'Falta la dirección' });
    await suppression.suppressManually(address, detail);
    res.json({ success: true, message: `${address} bloqueado` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/email/suppressions/:address — reactivar. Solo admin: liberar una
// dirección muerta vuelve a subir la tasa de rebote del dominio.
router.delete('/suppressions/:address', auth, adminOnly, async (req, res) => {
  try {
    const record = await suppression.release(req.params.address, req.user._id);
    if (!record) return res.status(404).json({ success: false, message: 'No estaba bloqueada' });
    res.json({ success: true, message: `${req.params.address} reactivado` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/email/templates
router.get('/templates', auth, checkPerm('templates.view'), (req, res) => {
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
  return mailer.sendMail({
    from: mailer.defaultFrom(),
    to,
    ...content
  });
};
