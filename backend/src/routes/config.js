// ============================================
// ACON CRM — Configuración de integraciones en vivo
// Permite leer, actualizar y probar credenciales sin reiniciar
// ============================================
const express = require('express');
const { PUBLIC_BASE_URL, isLocalhost } = require('../config/urls');
const router = express.Router();
const { auth, checkPerm } = require('../middleware/auth');
const settings = require('../services/settingsService');
const axios = require('axios');
const nodemailer = require('nodemailer');

// La configuración vive en MongoDB, cifrada (ver services/settingsService).
// Antes se escribía en un archivo .env dentro del contenedor, que se perdía en
// cada despliegue y ni siquiera existía en la imagen de Docker.
function readEnv() {
  return settings.currentEnv();
}

async function writeEnv(updates, userId) {
  return settings.setMany(updates, userId);
}

// Los secretos nunca se devuelven completos: solo una pista para que el usuario
// reconozca cuál está guardado.
const MASK = '••••••';
const mask = v => v ? (v.slice(0, 4) + MASK + v.slice(-3)) : '';

// ─────────────────────────────────────────
// GET /api/config/settings — qué está configurado (sin exponer secretos)
// ─────────────────────────────────────────
router.get('/settings', auth, checkPerm('integrations.manage'), (req, res) => {
  const e = readEnv();
  const data = {};
  for (const key of settings.ALLOWED_KEYS) {
    const value = e[key];
    data[key] = { set: !!value, hint: value ? mask(value) : '' };
  }
  res.json({ success: true, data });
});

// ─────────────────────────────────────────
// POST /api/config/settings — guarda cualquier credencial permitida
// Body: { CLAVE: 'valor', ... }. Los campos vacíos se ignoran (se deja lo que ya
// había), igual que los que traen la máscara: significa que el usuario no tocó
// ese campo y guardarla borraría el secreto real.
// ─────────────────────────────────────────
router.post('/settings', auth, checkPerm('integrations.manage'), async (req, res) => {
  try {
    const updates = {};
    for (const [key, raw] of Object.entries(req.body || {})) {
      if (typeof raw !== 'string' && typeof raw !== 'number') continue;
      const value = String(raw).trim();
      if (!value || value.includes(MASK)) continue;
      updates[key] = value;
    }
    const saved = await writeEnv(updates, req.user._id);
    res.json({
      success: true,
      saved,
      message: saved.length ? `${saved.length} campo(s) guardado(s)` : 'Sin cambios que guardar',
    });
  } catch (error) {
    console.error('[config] settings', error);
    res.status(500).json({ success: false, message: 'No se pudo guardar la configuración' });
  }
});

// ─────────────────────────────────────────
// DELETE /api/config/settings/:key — borra una credencial guardada
// ─────────────────────────────────────────
router.delete('/settings/:key', auth, checkPerm('integrations.manage'), async (req, res) => {
  try {
    const removed = await settings.remove([req.params.key]);
    if (!removed.length) {
      return res.status(400).json({ success: false, message: 'Clave no administrable' });
    }
    res.json({ success: true, message: 'Credencial eliminada' });
  } catch (error) {
    console.error('[config] delete setting', error);
    res.status(500).json({ success: false, message: 'No se pudo eliminar' });
  }
});

// ─────────────────────────────────────────
// GET /api/config — lee estado actual (oculta secretos)
// ─────────────────────────────────────────
router.get('/', auth, checkPerm('integrations.manage'), async (req, res) => {
  const e = readEnv();

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
      google: {
        GOOGLE_CLIENT_ID:     e.GOOGLE_CLIENT_ID     ? mask(e.GOOGLE_CLIENT_ID)     : '',
        GOOGLE_CLIENT_SECRET: e.GOOGLE_CLIENT_SECRET ? '••••••••••••'               : '',
        GOOGLE_REDIRECT_URI:  e.GOOGLE_REDIRECT_URI  || '',
        configured: !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
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
        base: PUBLIC_BASE_URL,
        whatsapp:  `/api/whatsapp/webhook`,
        meta:      `/api/webhooks/meta`,
        generic:   `/api/webhooks/generic`,
        linkedin:  `/api/webhooks/linkedin`,
        apiKeyHint: process.env.WEBHOOK_API_KEY || process.env.JWT_SECRET?.slice(0, 20) || '',
        publicBaseUrl: PUBLIC_BASE_URL,
        isLocalhost,
      }
    }
  });
});

// ─────────────────────────────────────────
// POST /api/config/whatsapp — guarda credenciales WA
// ─────────────────────────────────────────
router.post('/whatsapp', auth, checkPerm('integrations.manage'), async (req, res) => {
  const { META_WA_TOKEN, META_WA_PHONE_ID, META_WA_VERIFY_TOKEN, META_APP_SECRET } = req.body;
  const updates = {};
  if (META_WA_TOKEN)        updates.META_WA_TOKEN        = META_WA_TOKEN;
  if (META_WA_PHONE_ID)     updates.META_WA_PHONE_ID     = META_WA_PHONE_ID;
  if (META_WA_VERIFY_TOKEN) updates.META_WA_VERIFY_TOKEN = META_WA_VERIFY_TOKEN;
  if (META_APP_SECRET)      updates.META_APP_SECRET      = META_APP_SECRET;
  await writeEnv(updates, req.user._id);
  res.json({ success: true, message: 'Credenciales WhatsApp guardadas' });
});

// ─────────────────────────────────────────
// POST /api/config/whatsapp/test — prueba llamada real a Meta API
// ─────────────────────────────────────────
router.post('/whatsapp/test', auth, checkPerm('integrations.manage'), async (req, res) => {
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
    await writeEnv({ WA_VERIFIED: 'true' }, req.user._id);
    res.json({
      success: true,
      message: '✅ Conexión exitosa con WhatsApp Business API',
      data: { displayName: r.data.display_phone_number, verifiedName: r.data.verified_name }
    });
  } catch (e) {
    // Si falló, limpiar bandera de verificación
    await writeEnv({ WA_VERIFIED: 'false' }, req.user._id);
    res.json({ success: false, message: e.response?.data?.error?.message || e.message });
  }
});

// ─────────────────────────────────────────
// POST /api/config/email — guarda credenciales SMTP
// ─────────────────────────────────────────
router.post('/email', auth, checkPerm('integrations.manage'), async (req, res) => {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM } = req.body;
  const updates = {};
  if (SMTP_HOST)   updates.SMTP_HOST   = SMTP_HOST;
  if (SMTP_PORT)   updates.SMTP_PORT   = SMTP_PORT;
  if (SMTP_SECURE !== undefined) updates.SMTP_SECURE = SMTP_SECURE;
  if (SMTP_USER)   updates.SMTP_USER   = SMTP_USER;
  if (SMTP_PASS)   updates.SMTP_PASS   = SMTP_PASS;
  if (EMAIL_FROM)  updates.EMAIL_FROM  = EMAIL_FROM;
  await writeEnv(updates, req.user._id);
  res.json({ success: true, message: 'Credenciales Email guardadas' });
});

// ─────────────────────────────────────────
// POST /api/config/email/test — envía correo de prueba
// ─────────────────────────────────────────
router.post('/email/test', auth, checkPerm('integrations.manage'), async (req, res) => {
  const { testTo } = req.body;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return res.status(400).json({ success: false, message: 'Configura SMTP_USER y SMTP_PASS primero' });
  }

  const host   = process.env.SMTP_HOST   || 'smtp.gmail.com';
  const port   = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true'; // true = SSL/465, false = STARTTLS/587
  // Gmail app passwords come with spaces — strip them
  const pass   = (process.env.SMTP_PASS || '').replace(/\s/g, '');

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: process.env.SMTP_USER, pass },
      tls: { rejectUnauthorized: false }, // tolera certs auto-firmados (Hostinger, etc.)
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
    // Traducir errores comunes a mensajes claros en español
    let msg = e.message || 'Error desconocido';
    if (msg.includes('Invalid login') || msg.includes('Username and Password not accepted') || msg.includes('535')) {
      msg = '❌ Usuario o contraseña incorrectos. Para Gmail: usa Contraseña de aplicación de 16 caracteres (sin espacios), NO tu contraseña normal. Verifica que 2-Step Verification esté activo.';
    } else if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) {
      msg = `❌ No se pudo conectar al servidor ${host}:${port}. Verifica el host y puerto.`;
    } else if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
      msg = `❌ Tiempo de espera agotado conectando a ${host}:${port}. Puede ser un problema de firewall o puerto incorrecto.`;
    } else if (msg.includes('self signed') || msg.includes('certificate')) {
      msg = `❌ Error de certificado SSL. Prueba cambiando a puerto 587 con STARTTLS.`;
    } else if (msg.includes('STARTTLS') || msg.includes('greeting')) {
      msg = `❌ Error de protocolo. Para Hostinger: usa port 465 + SSL/TLS. Para Gmail: usa port 587 + STARTTLS.`;
    }
    res.json({ success: false, message: msg });
  }
});

// ─────────────────────────────────────────
// POST /api/config/resend/test — verifica la API Key y, si se indica
// destinatario, envía un correo real por Resend.
// ─────────────────────────────────────────
router.post('/resend/test', auth, checkPerm('integrations.manage'), async (req, res) => {
  const { testTo } = req.body;
  if (!process.env.RESEND_API_KEY) {
    return res.status(400).json({ success: false, message: 'Configura RESEND_API_KEY primero' });
  }
  try {
    await axios.get('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      timeout: 10000,
    });

    if (testTo) {
      const from = process.env.RESEND_FROM || process.env.EMAIL_FROM;
      if (!from) {
        return res.json({
          success: false,
          message: 'Falta el remitente: configura RESEND_FROM con un correo de un dominio verificado en Resend',
        });
      }
      await axios.post(
        'https://api.resend.com/emails',
        {
          from,
          to: [testTo],
          subject: '✅ ACON CRM — Prueba de Resend',
          html: '<h2>Resend conectado</h2><p>Este es un correo de prueba del CRM de ACON Worldwide Logística.</p>',
        },
        {
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          timeout: 15000,
        }
      );
    }

    res.json({
      success: true,
      message: testTo ? `✅ Correo enviado a ${testTo} vía Resend` : '✅ API Key de Resend válida',
    });
  } catch (e) {
    const detail = e.response?.data?.message || e.response?.data?.error || e.message;
    let msg = `❌ ${detail}`;
    if (e.response?.status === 401) {
      msg = '❌ API Key de Resend inválida. Genera una nueva en resend.com → API Keys.';
    } else if (String(detail).includes('domain')) {
      msg = `❌ ${detail}. El remitente debe pertenecer a un dominio verificado en Resend.`;
    }
    res.json({ success: false, message: msg });
  }
});

// ─────────────────────────────────────────
// POST /api/config/google — guarda credenciales Google OAuth
// ─────────────────────────────────────────
router.post('/google', auth, checkPerm('integrations.manage'), async (req, res) => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = req.body;
  const updates = {};
  if (GOOGLE_CLIENT_ID)     updates.GOOGLE_CLIENT_ID     = GOOGLE_CLIENT_ID;
  if (GOOGLE_CLIENT_SECRET) updates.GOOGLE_CLIENT_SECRET = GOOGLE_CLIENT_SECRET;
  if (GOOGLE_REDIRECT_URI)  updates.GOOGLE_REDIRECT_URI  = GOOGLE_REDIRECT_URI;
  await writeEnv(updates, req.user._id);
  res.json({ success: true, message: 'Credenciales Google guardadas' });
});

// ─────────────────────────────────────────
// POST /api/config/google/test — verifica que los IDs son válidos
// ─────────────────────────────────────────
router.post('/google/test', auth, checkPerm('integrations.manage'), async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.json({ success: false, message: 'Configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET primero' });
  }
  // We cannot do a real OAuth verify without user interaction — just confirm they're set
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const isValid = clientId.endsWith('.apps.googleusercontent.com');
  if (!isValid) {
    return res.json({ success: false, message: 'GOOGLE_CLIENT_ID no parece válido — debe terminar en .apps.googleusercontent.com' });
  }
  res.json({
    success: true,
    message: '✅ Credenciales Google configuradas. Ahora ve a Integraciones y haz click en "Conectar con Google" para autorizar tu cuenta.',
    data: { clientId: clientId.slice(0, 20) + '...' }
  });
});

// ─────────────────────────────────────────
// POST /api/config/openai — guarda API key de OpenAI
// ─────────────────────────────────────────
router.post('/openai', auth, checkPerm('integrations.manage'), async (req, res) => {
  const { OPENAI_API_KEY, OPENAI_MODEL } = req.body;
  const updates = {};
  if (OPENAI_API_KEY) updates.OPENAI_API_KEY = OPENAI_API_KEY;
  if (OPENAI_MODEL)   updates.OPENAI_MODEL   = OPENAI_MODEL;
  await writeEnv(updates, req.user._id);
  res.json({ success: true, message: 'OpenAI API Key guardada' });
});

// ─────────────────────────────────────────
// POST /api/config/openai/test
// ─────────────────────────────────────────
router.post('/openai/test', auth, checkPerm('integrations.manage'), async (req, res) => {
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
router.post('/facebook', auth, checkPerm('integrations.manage'), async (req, res) => {
  const { META_ACCESS_TOKEN, META_PAGE_ID, META_WEBHOOK_VERIFY_TOKEN, META_APP_SECRET } = req.body;
  const updates = {};
  if (META_ACCESS_TOKEN)         updates.META_ACCESS_TOKEN         = META_ACCESS_TOKEN;
  if (META_PAGE_ID)              updates.META_PAGE_ID              = META_PAGE_ID;
  if (META_WEBHOOK_VERIFY_TOKEN) updates.META_WEBHOOK_VERIFY_TOKEN = META_WEBHOOK_VERIFY_TOKEN;
  if (META_APP_SECRET)           updates.META_APP_SECRET           = META_APP_SECRET;
  await writeEnv(updates, req.user._id);
  res.json({ success: true, message: 'Credenciales Facebook/Meta guardadas' });
});

// ─────────────────────────────────────────
// POST /api/config/facebook/test
// ─────────────────────────────────────────
router.post('/facebook/test', auth, checkPerm('integrations.manage'), async (req, res) => {
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
