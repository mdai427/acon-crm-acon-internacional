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

async function sendWithResend({ from, to, subject, html, text, cc, bcc, replyTo, attachments, headers }) {
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
  // In-Reply-To / References mantienen el hilo agrupado en Gmail y Outlook.
  if (headers && Object.keys(headers).length) payload.headers = headers;

  try {
    const r = await axios.post(RESEND_ENDPOINT, payload, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    return { messageId: r.data?.id, provider: 'resend' };
  } catch (err) {
    const detail = err.response?.data?.message || err.response?.data?.error || err.message;
    const error = new Error(`Resend: ${detail}`);
    error.status = err.response?.status;
    error.code = err.code;
    throw error;
  }
}

async function sendWithSmtp(message) {
  const transporter = getSmtpTransporter();
  if (!transporter) throw new Error('SMTP sin configurar: falta SMTP_HOST');
  const info = await transporter.sendMail({ ...message, from: message.from || defaultFrom() });
  return { messageId: info.messageId, provider: 'smtp' };
}

// ── Reintentos ──────────────────────────────────────────────────────
//
// Un envío puede fallar por causas pasajeras (límite de tasa, 5xx del
// proveedor, corte de red) o definitivas (API key inválida, dirección mal
// formada). Reintentar las primeras salva el correo; reintentar las segundas
// solo repite el mismo error, así que se distinguen.

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ENOTFOUND', 'EAI_AGAIN', 'ESOCKET', 'ECONNECTION',
]);

function isTransient(error) {
  const status = error.status || error.responseCode;
  if (status === 429 || (status >= 500 && status < 600)) return true;
  if (status >= 400 && status < 500) return false; // 401, 422… no se arreglan solas
  return TRANSIENT_NETWORK_CODES.has(error.code);
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Envía un correo por el proveedor activo, reintentando los fallos pasajeros
 * con backoff exponencial.
 * @param {object} message { from, to, subject, html, text, cc, bcc, replyTo, attachments, headers }
 * @returns {Promise<{messageId: string, provider: string, attempts: number}>}
 */
async function sendMail(message) {
  if (!message?.to) throw new Error('Falta el destinatario del correo');
  const send = activeProvider() === 'resend' ? sendWithResend : sendWithSmtp;

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const info = await send(message);
      return { ...info, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS || !isTransient(error)) break;
      const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(`[mailer] intento ${attempt}/${MAX_ATTEMPTS} falló (${error.message}), reintento en ${delay}ms`);
      await wait(delay);
    }
  }
  throw lastError;
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

module.exports = { sendMail, verify, isConfigured, activeProvider, defaultFrom, isTransient };
