// ============================================
// Configuración de integraciones persistida en MongoDB
// ============================================
//
// Sustituye al viejo esquema de escribir en un archivo .env, que en Docker no
// funciona: el contenedor se recrea en cada despliegue y se perdía todo lo que
// el encargado de integraciones hubiera configurado desde el panel.
//
// Cómo encaja con el resto del sistema: al arrancar, los valores guardados se
// vuelcan en process.env (hydrateEnv). Así los ~15 servicios que ya leen
// process.env.META_WA_TOKEN, process.env.SMTP_USER, etc. siguen funcionando sin
// cambios, y al guardar desde el panel el cambio aplica en caliente, sin reiniciar.
//
// Precedencia: lo guardado en la base de datos gana sobre la variable de entorno,
// porque es lo que el usuario configuró explícitamente desde el panel.

const crypto = require('crypto');
const Setting = require('../models/Setting');

const ALGO = 'aes-256-gcm';

// Solo estas claves pueden administrarse desde el panel. Es una lista blanca a
// propósito: sin ella, quien tuviera acceso al panel podría reescribir
// JWT_SECRET o MONGODB_URI y comprometer todo el sistema.
const ALLOWED_KEYS = new Set([
  // WhatsApp Cloud API
  'META_WA_TOKEN', 'META_WA_PHONE_ID', 'META_WA_VERIFY_TOKEN', 'META_APP_SECRET', 'WA_VERIFIED',
  'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET', 'WHATSAPP_WABA_ID',
  // Meta / Facebook Lead Ads
  'META_APP_ID', 'META_ACCESS_TOKEN', 'META_PAGE_ID', 'META_WEBHOOK_VERIFY_TOKEN',
  // Email SMTP
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'EMAIL_FROM',
  // Google OAuth
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI',
  // OpenAI
  'OPENAI_API_KEY', 'OPENAI_MODEL',
  // LinkedIn
  'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_ACCESS_TOKEN',
  // Almacenamiento S3
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'S3_BUCKET',
  // Otros
  'N8N_API_KEY', 'BANXICO_TOKEN', 'DEFAULT_EXCHANGE_RATE', 'WEBHOOK_API_KEY',
]);

function getKey() {
  const raw = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!raw) throw new Error('Falta ENCRYPTION_KEY (o JWT_SECRET) para cifrar la configuración');
  return crypto.createHash('sha256').update(raw).digest(); // 32 bytes
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

function decrypt(payload) {
  const [iv, tag, data] = String(payload).split(':');
  if (!iv || !tag || !data) return '';
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

// Devuelve todas las claves guardadas, descifradas.
async function getAll() {
  const docs = await Setting.find().lean();
  const out = {};
  for (const doc of docs) {
    try {
      out[doc.key] = decrypt(doc.value);
    } catch {
      // Valor ilegible: normalmente significa que cambió ENCRYPTION_KEY.
      console.error(`⚠️ No se pudo descifrar la configuración "${doc.key}". ¿Cambió ENCRYPTION_KEY?`);
    }
  }
  return out;
}

// Guarda un conjunto de claves y las aplica de inmediato a process.env.
// Devuelve las claves que sí se guardaron (las no permitidas se ignoran).
async function setMany(updates, userId) {
  const saved = [];
  for (const [key, rawValue] of Object.entries(updates || {})) {
    if (!ALLOWED_KEYS.has(key)) continue;
    const value = String(rawValue).trim();
    await Setting.findOneAndUpdate(
      { key },
      { key, value: encrypt(value), updatedBy: userId },
      { upsert: true, new: true }
    );
    process.env[key] = value; // efecto inmediato, sin reiniciar el contenedor
    saved.push(key);
  }
  return saved;
}

// Vuelca la configuración guardada en process.env. Se llama al arrancar, después
// de conectar a Mongo.
async function hydrateEnv() {
  const stored = await getAll();
  const keys = Object.keys(stored);
  for (const key of keys) process.env[key] = stored[key];
  if (keys.length) console.log(`⚙️  Configuración cargada desde la base de datos: ${keys.length} claves`);
  return keys;
}

// Estado actual de las claves administrables (valor efectivo, venga de la base
// de datos o del entorno). No descifra nada extra: process.env ya está hidratado.
function currentEnv() {
  const out = {};
  for (const key of ALLOWED_KEYS) {
    if (process.env[key] !== undefined) out[key] = process.env[key];
  }
  return out;
}

module.exports = { getAll, setMany, hydrateEnv, currentEnv, ALLOWED_KEYS };
