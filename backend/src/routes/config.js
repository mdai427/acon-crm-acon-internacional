// ============================================
// ACON CRM — Configuración de integraciones en vivo
// Permite leer, actualizar y probar credenciales sin reiniciar
// ============================================
const express = require('express');
const router = express.Router();
const { auth, adminOnly } = require('../middleware/auth');
const axios = require('axios');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.resolve(__dirname, '../../.env');

// Lee el .env actual como objeto clave/valor
function readEnv() {
  try {
    const lines = fs.readFileSync(ENV_PATH, 'utf-8').split('\n');
    const env = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      env[key] = val;
    }
    return env;
  } catch { return {}; }
}

// Escribe claves en el .env sin borrar comentarios
function writeEnv(updates) {
  let content = '';
  try { content = fs.readFileSync(ENV_PATH, 'utf-8'); } catch {}

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    const line = `${key}=${value}`;
    if (regex.test(content)) {
      content = content.replace(regex, line);
    } else {
      content += `\n${line}`;
    }
    // Actualizar también en process.env para efecto inmediato
    process.env[key] = value;
  }

  fs.writeFileSync(ENV_PATH, content);
}

// ─────────────────────────────────────────
// GET /api/config — lee estado actual (oculta secretos)
// ─────────────────────────────────────────
router.get('/', auth, adminOnly, (req, res) => {
  const e = readEnv();
  const mask = v => v ? (v.slice(0, 4) + '••••••' + v.slice(-3)) : '';

  res.json({
    success: true,
    data: {
      whatsapp: {
        META_WA_TOKEN:        e.META_WA_TOKEN        ? mask(e.META_WA_TOKEN)        : '',
        META_WA_PHONE_ID:     e.META_WA_PHONE_ID     || '',
        META_WA_VERIFY_TOKEN: e.META_WA_VERIFY_TOKEN || '',
        META_APP_SECRET:      e.META_APP_SECRET      ? mask(e.META_APP_SECRET)      : '',
        // "saved" = credenciales guardadas / "verified" = prueba real exitosa
        saved: !!(e.META_WA_TOKEN && e.META_WA_PHONE_ID),
        connected: e.WA_VERIFIED === 'true',
      },
      email: {
        SMTP_HOST:   e.SMTP_HOST   || '',
        SMTP_PORT:   e.SMTP_PORT   || '587',
        SMTP_SECURE: e.SMTP_SECURE || 'false',
        SMTP_USER:   e.SMTP_USER   || '',
        SMTP_PASS:   e.SMTP_PASS   ? mask(e.SMTP_PASS) : '',
        EMAIL_FROM:  e.EMAIL_FROM  || '',
        connected: !!(e.SMTP_USER && e.SMTP_PASS),
      },
      openai: {
        OPENAI_API_KEY: e.OPENAI_API_KEY ? mask(e.OPENAI_API_KEY) : '',
        OPENAI_MODEL:   e.OPENAI_MODEL   || 'gpt-4o-mini',
        connected: !!e.OPENAI_API_KEY,
      },
      facebook: {
        META_ACCESS_TOKEN:       e.META_ACCESS_TOKEN       ? mask(e.META_ACCESS_TOKEN)       : '',
        META_PAGE_ID:            e.META_PAGE_ID            || '',
        META_WEBHOOK_VERIFY_TOKEN: e.META_WEBHOOK_VERIFY_TOKEN || '',
        connected: !!(e.META_ACCESS_TOKEN && e.META_PAGE_ID),
      },
      webhooks: {
        base: process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 5001}`,
        whatsapp:  `/api/whatsapp/webhook`,
        meta:      `/api/webhooks/meta`,
        generic:   `/api/webhooks/generic`,
        linkedin:  `/api/webhooks/linkedin`,
        apiKeyHint: process.env.JWT_SECRET?.slice(0, 20) || '',
        publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
        isLocalhost: !process.env.PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL.includes('localhost'),
      }
    }
  });
});

// ─────────────────────────────────────────
// POST /api/config/whatsapp — guarda credenciales WA
// ─────────────────────────────────────────
router.post('/whatsapp', auth, adminOnly, (req, res) => {
  const { META_WA_TOKEN, META_WA_PHONE_ID, META_WA_VERIFY_TOKEN, META_APP_SECRET } = req.body;
  const updates = {};
  if (META_WA_TOKEN)        updates.META_WA_TOKEN        = META_WA_TOKEN;
  if (META_WA_PHONE_ID)     updates.META_WA_PHONE_ID     = META_WA_PHONE_ID;
  if (META_WA_VERIFY_TOKEN) updates.META_WA_VERIFY_TOKEN = META_WA_VERIFY_TOKEN;
  if (META_APP_SECRET)      updates.META_APP_SECRET      = META_APP_SECRET;
  writeEnv(updates);
  res.json({ success: true, message: 'Credenciales WhatsApp guardadas' });
});

// ─────────────────────────────────────────
// POST /api/config/whatsapp/test — prueba llamada real a Meta API
// ─────────────────────────────────────────
router.post('/whatsapp/test', auth, adminOnly, async (req, res) => {
  const token   = process.env.META_WA_TOKEN;
  const phoneId = process.env.META_WA_PHONE_ID;
  if (!token || !phoneId) {
    return res.status(400).json({ success: false, message: 'Configura META_WA_TOKEN y META_WA_PHONE_ID primero' });
  }
  try {
    const r = await axios.get(
      `https://graph.facebook.com/v18.0/${phoneId}`,
      { params: { access_token: token } }
    );
    // Marcar como verificado en .env para que el badge sea real
    writeEnv({ WA_VERIFIED: 'true' });
    res.json({
      success: true,
      message: '✅ Conexión exitosa con WhatsApp Business API',
      data: { displayName: r.data.display_phone_number, verifiedName: r.data.verified_name }
    });
  } catch (e) {
    // Si falló, limpiar bandera de verificación
    writeEnv({ WA_VERIFIED: 'false' });
    res.json({ success: false, message: e.response?.data?.error?.message || e.message });
  }
});

// ─────────────────────────────────────────
// POST /api/config/email — guarda credenciales SMTP
// ─────────────────────────────────────────
router.post('/email', auth, adminOnly, (req, res) => {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM } = req.body;
  const updates = {};
  if (SMTP_HOST)   updates.SMTP_HOST   = SMTP_HOST;
  if (SMTP_PORT)   updates.SMTP_PORT   = SMTP_PORT;
  if (SMTP_SECURE !== undefined) updates.SMTP_SECURE = SMTP_SECURE;
  if (SMTP_USER)   updates.SMTP_USER   = SMTP_USER;
  if (SMTP_PASS)   updates.SMTP_PASS   = SMTP_PASS;
  if (EMAIL_FROM)  updates.EMAIL_FROM  = EMAIL_FROM;
  writeEnv(updates);
  res.json({ success: true, message: 'Credenciales Email guardadas' });
});

// ─────────────────────────────────────────
// POST /api/config/email/test — envía correo de prueba
// ─────────────────────────────────────────
router.post('/email/test', auth, adminOnly, async (req, res) => {
  const { testTo } = req.body;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return res.status(400).json({ success: false, message: 'Configura SMTP_USER y SMTP_PASS primero' });
  }
  try {
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
      port:   Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    await transporter.verify();
    if (testTo) {
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.SMTP_USER,
        to: testTo,
        subject: '✅ ACON CRM — Prueba de Email',
        html: '<h2>Conexión SMTP exitosa</h2><p>Este es un correo de prueba del CRM de ACON Worldwide Logística.</p>'
      });
    }
    res.json({ success: true, message: testTo ? `✅ Email enviado a ${testTo}` : '✅ Conexión SMTP verificada' });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────
// POST /api/config/openai — guarda API key de OpenAI
// ─────────────────────────────────────────
router.post('/openai', auth, adminOnly, (req, res) => {
  const { OPENAI_API_KEY, OPENAI_MODEL } = req.body;
  const updates = {};
  if (OPENAI_API_KEY) updates.OPENAI_API_KEY = OPENAI_API_KEY;
  if (OPENAI_MODEL)   updates.OPENAI_MODEL   = OPENAI_MODEL;
  writeEnv(updates);
  res.json({ success: true, message: 'OpenAI API Key guardada' });
});

// ─────────────────────────────────────────
// POST /api/config/openai/test
// ─────────────────────────────────────────
router.post('/openai/test', auth, adminOnly, async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(400).json({ success: false, message: 'Configura OPENAI_API_KEY primero' });
  }
  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const r = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Responde solo "OK" en español' }],
      max_tokens: 5
    });
    res.json({ success: true, message: `✅ OpenAI conectado — Modelo: ${r.model}` });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────
// POST /api/config/facebook — guarda credenciales Meta/Facebook
// ─────────────────────────────────────────
router.post('/facebook', auth, adminOnly, (req, res) => {
  const { META_ACCESS_TOKEN, META_PAGE_ID, META_WEBHOOK_VERIFY_TOKEN, META_APP_SECRET } = req.body;
  const updates = {};
  if (META_ACCESS_TOKEN)         updates.META_ACCESS_TOKEN         = META_ACCESS_TOKEN;
  if (META_PAGE_ID)              updates.META_PAGE_ID              = META_PAGE_ID;
  if (META_WEBHOOK_VERIFY_TOKEN) updates.META_WEBHOOK_VERIFY_TOKEN = META_WEBHOOK_VERIFY_TOKEN;
  if (META_APP_SECRET)           updates.META_APP_SECRET           = META_APP_SECRET;
  writeEnv(updates);
  res.json({ success: true, message: 'Credenciales Facebook/Meta guardadas' });
});

// ─────────────────────────────────────────
// POST /api/config/facebook/test
// ─────────────────────────────────────────
router.post('/facebook/test', auth, adminOnly, async (req, res) => {
  if (!process.env.META_ACCESS_TOKEN) {
    return res.status(400).json({ success: false, message: 'Configura META_ACCESS_TOKEN primero' });
  }
  try {
    const r = await axios.get('https://graph.facebook.com/v18.0/me', {
      params: { access_token: process.env.META_ACCESS_TOKEN, fields: 'name,id' }
    });
    res.json({ success: true, message: `✅ Facebook API conectada — Página: ${r.data.name}` });
  } catch (e) {
    res.json({ success: false, message: e.response?.data?.error?.message || e.message });
  }
});

module.exports = router;
