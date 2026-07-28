// ============================================
// Envío de correo — proveedor único para todo el CRM
// ============================================
//
// Antes cada módulo creaba su propio transporte de nodemailer leyendo SMTP_*.
// Aquí se centraliza para poder elegir proveedor desde el panel:
//
//   EMAIL_PROVIDER=resend → API HTTP de Resend (no necesita puertos SMTP abiertos)
//   EMAIL_PROVIDER=smtp   → nodemailer contra el servidor configurado
//
// Si no se define EMAIL_PROVIDER se elige automáticamente: Resend cuando hay
// RESEND_API_KEY, SMTP en cualquier otro caso. Así las instalaciones existentes
// siguen funcionando sin tocar nada.

const nodemailer = require('nodemailer');
const axios = require('axios');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function activeProvider() {
  const configured = String(process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  if (configured === 'resend' || configured === 'smtp') return configured;
  return process.env.RESEND_API_KEY ? 'resend' : 'smtp';
}

function defaultFrom() {
  return process.env.RESEND_FROM
    || process.env.EMAIL_FROM
    || process.env.SMTP_FROM
    || process.env.SMTP_USER
    || 'ACON CRM <noreply@acon.mx>';
}

// El transporte de SMTP se cachea, pero la caché se invalida cuando cambian las
// credenciales desde el panel (se aplican en caliente a process.env).
let smtpTransporter = null;
let smtpSignature = '';

function getSmtpTransporter() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  const signature = [host, process.env.SMTP_PORT, process.env.SMTP_SECURE,
    process.env.SMTP_USER, process.env.SMTP_PASS].join('|');
  if (smtpTransporter && signature === smtpSignature) return smtpTransporter;

  smtpSignature = signature;
  smtpTransporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      // Las contraseñas de aplicación de Gmail se copian con espacios.
      pass: (process.env.SMTP_PASS || '').replace(/\s/g, ''),
    },
    tls: { rejectUnauthorized: false },
  });
  return smtpTransporter;
}

// Resend acepta adjuntos como { filename, content } en base64.
function toResendAttachments(attachments) {
  return (attachments || []).map(a => ({
    filename: a.filename,
    content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
    path: a.path,
  }));
}

async function sendWithResend({ from, to, subject, html, text, cc, bcc, replyTo, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Falta RESEND_API_KEY: configura la integración de Resend');

  const payload = {
    from: from || defaultFrom(),
    to: Array.isArray(to) ? to : [to],
    subject,
  };
  if (html) payload.html = html;
  if (text) payload.text = text;
  if (cc) payload.cc = Array.isArray(cc) ? cc : [cc];
  if (bcc) payload.bcc = Array.isArray(bcc) ? bcc : [bcc];
  if (replyTo) payload.reply_to = replyTo;
  if (attachments?.length) payload.attachments = toResendAttachments(attachments);

  try {
    const r = await axios.post(RESEND_ENDPOINT, payload, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    return { messageId: r.data?.id, provider: 'resend' };
  } catch (err) {
    const detail = err.response?.data?.message || err.response?.data?.error || err.message;
    throw new Error(`Resend: ${detail}`);
  }
}

async function sendWithSmtp(message) {
  const transporter = getSmtpTransporter();
  if (!transporter) throw new Error('SMTP sin configurar: falta SMTP_HOST');
  const info = await transporter.sendMail({ ...message, from: message.from || defaultFrom() });
  return { messageId: info.messageId, provider: 'smtp' };
}

/**
 * Envía un correo por el proveedor activo.
 * @param {object} message { from, to, subject, html, text, cc, bcc, replyTo, attachments }
 * @returns {Promise<{messageId: string, provider: string}>}
 */
async function sendMail(message) {
  if (!message?.to) throw new Error('Falta el destinatario del correo');
  return activeProvider() === 'resend' ? sendWithResend(message) : sendWithSmtp(message);
}

// ¿Hay algún proveedor listo para enviar? Lo usan las notificaciones para no
// intentar el envío cuando el correo todavía no está configurado.
function isConfigured() {
  return activeProvider() === 'resend'
    ? !!process.env.RESEND_API_KEY
    : !!process.env.SMTP_HOST;
}

// Comprueba credenciales sin enviar nada (para el botón "Probar conexión").
async function verify() {
  if (activeProvider() === 'resend') {
    if (!process.env.RESEND_API_KEY) throw new Error('Falta RESEND_API_KEY');
    try {
      await axios.get('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        timeout: 10000,
      });
    } catch (err) {
      if (err.response?.status === 401) throw new Error('API Key de Resend inválida');
      throw new Error(err.response?.data?.message || err.message);
    }
    return true;
  }
  const transporter = getSmtpTransporter();
  if (!transporter) throw new Error('SMTP sin configurar: falta SMTP_HOST');
  await transporter.verify();
  return true;
}

module.exports = { sendMail, verify, isConfigured, activeProvider, defaultFrom };
