const crypto = require('crypto');

// ============================================
// Claves derivadas por propósito
// ============================================
//
// Cada uso criptográfico tiene su propia clave, derivada de ENCRYPTION_KEY con
// una etiqueta distinta. Así un token filtrado de un propósito no sirve para
// falsificar los de otro, y rotar la clave raíz rota todos a la vez de forma
// predecible.
//
// Antes esto se firmaba con `process.env.JWT_SECRET || ''`: si la variable
// faltaba, el HMAC se calculaba con clave vacía y cualquiera podía falsificar
// tokens de respuesta o bajas. Ahora falla en voz alta.

const cache = new Map();

/**
 * @param {string} purpose etiqueta estable, p. ej. 'mailbox-reply' o 'unsubscribe'
 * @returns {Buffer} clave de 32 bytes
 */
function keyFor(purpose) {
  if (cache.has(purpose)) return cache.get(purpose);

  const root = process.env.ENCRYPTION_KEY;
  if (!root) {
    throw new Error(`Falta ENCRYPTION_KEY: no se puede derivar la clave de "${purpose}"`);
  }

  const key = crypto.createHmac('sha256', root).update(`acon-crm:${purpose}`).digest();
  cache.set(purpose, key);
  return key;
}

/**
 * Firma un valor y devuelve los primeros `length` caracteres hex.
 * El truncado es deliberado: estos tokens viajan dentro de direcciones de
 * correo y URLs, y 10 caracteres hex (40 bits) bastan cuando además hay que
 * acertar un ObjectId válido.
 */
function sign(purpose, value, length = 10) {
  return crypto.createHmac('sha256', keyFor(purpose)).update(String(value)).digest('hex').slice(0, length);
}

/** Verifica una firma en tiempo constante. */
function verify(purpose, value, signature, length = 10) {
  if (!signature) return false;
  const expected = sign(purpose, value, length);
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

module.exports = { keyFor, sign, verify };
