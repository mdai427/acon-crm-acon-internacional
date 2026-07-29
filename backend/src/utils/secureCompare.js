const crypto = require('crypto');

/**
 * Compara dos secretos en tiempo constante.
 *
 * Un `===` normal corta en el primer byte distinto, así que el tiempo de
 * respuesta filtra cuántos caracteres acertó quien lo intenta y permite
 * reconstruir la clave byte a byte. Se hashea antes de comparar para que la
 * comparación sea siempre sobre 32 bytes: `timingSafeEqual` exige la misma
 * longitud y, si la comprobáramos aparte, la propia longitud se filtraría.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean} false si cualquiera de los dos está vacío
 */
function secureCompare(a, b) {
  if (!a || !b) return false;
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = { secureCompare };
