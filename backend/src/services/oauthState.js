const crypto = require('crypto');

// ============================================
// Parámetro `state` de OAuth
// ============================================
//
// Antes el `state` era directamente el id del usuario: predecible y sin
// caducidad. Eso permite el ataque clásico de vinculación forzada — el
// atacante completa el flujo con SU cuenta de Google poniendo el id de la
// víctima, y termina con su buzón vinculado a la cuenta de otro (o al revés,
// leyendo el correo de la víctima desde su propia sesión).
//
// Ahora el state es un valor aleatorio, de un solo uso, atado al usuario que
// inició el flujo y con caducidad corta.

const TTL_MS = 10 * 60 * 1000; // 10 minutos: un OAuth normal tarda segundos

// En memoria a propósito: son efímeros y de un solo uso. Si el proceso se
// reinicia a mitad del flujo, el usuario simplemente vuelve a pulsar "conectar".
const pending = new Map();

function purgeExpired() {
  const now = Date.now();
  for (const [token, entry] of pending) {
    if (entry.expiresAt <= now) pending.delete(token);
  }
}

/**
 * Crea un state para el usuario que inicia el flujo.
 * @param {string} userId
 * @param {string} provider 'google' | 'meta_ads' | 'linkedin_ads' | 'google_ads'
 * @returns {string} valor a mandar como `state`
 */
function issue(userId, provider) {
  purgeExpired();
  const token = crypto.randomBytes(32).toString('base64url');
  pending.set(token, { userId: String(userId), provider, expiresAt: Date.now() + TTL_MS });
  return token;
}

/**
 * Canjea un state. Devuelve null si no existe, ya se usó, caducó, o es de otro
 * proveedor. Es de un solo uso: se borra en la primera lectura válida.
 * @returns {{ userId: string, provider: string } | null}
 */
function consume(token, provider) {
  purgeExpired();
  const entry = pending.get(String(token || ''));
  if (!entry) return null;

  pending.delete(String(token));
  if (entry.expiresAt <= Date.now()) return null;
  if (provider && entry.provider !== provider) return null;

  return { userId: entry.userId, provider: entry.provider };
}

module.exports = { issue, consume, TTL_MS };
