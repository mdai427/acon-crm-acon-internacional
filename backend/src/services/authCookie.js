// ============================================
// Sesión en cookie httpOnly
// ============================================
//
// El token vivía en localStorage, donde cualquier XSS lo puede leer y robar.
// En una cookie httpOnly el JavaScript de la página no lo alcanza.
//
// El precio de las cookies es el CSRF: el navegador las manda solas. Aquí se
// cubre con doble envío (double submit): junto a la cookie httpOnly se emite
// otra cookie legible con un valor aleatorio, y las peticiones que cambian
// estado deben repetir ese valor en la cabecera X-CSRF-Token. Una página
// ajena puede provocar la petición, pero no puede leer la cookie para copiar
// el valor — se lo impide el mismo origen.

const crypto = require('crypto');

const TOKEN_COOKIE = 'acon_session';
const CSRF_COOKIE = 'acon_csrf';
const CSRF_HEADER = 'x-csrf-token';

// Métodos que no cambian estado: no necesitan el token CSRF.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function isCrossSite() {
  // Frontend y backend viven en subdominios distintos (crm.x.com y
  // api-crm.x.com), así que la cookie es de terceros: necesita SameSite=None,
  // que a su vez exige Secure y, por tanto, HTTPS.
  return process.env.NODE_ENV === 'production';
}

function cookieOptions(maxAgeMs) {
  const crossSite = isCrossSite();
  return {
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? 'none' : 'lax',
    maxAge: maxAgeMs,
    path: '/',
  };
}

// Duración de la cookie alineada con la del token (JWT_EXPIRES_IN).
function sessionMaxAge() {
  const raw = String(process.env.JWT_EXPIRES_IN || '7d').trim();
  const match = raw.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
  return Number(match[1]) * unit;
}

/** Emite la cookie de sesión y la de CSRF. Devuelve el valor CSRF. */
function issue(res, token) {
  const maxAge = sessionMaxAge();
  res.cookie(TOKEN_COOKIE, token, cookieOptions(maxAge));

  const csrf = crypto.randomBytes(24).toString('base64url');
  // Esta SÍ debe ser legible por el JavaScript de la propia página: es la que
  // se copia a la cabecera.
  res.cookie(CSRF_COOKIE, csrf, { ...cookieOptions(maxAge), httpOnly: false });
  return csrf;
}

function clear(res) {
  const base = { ...cookieOptions(0) };
  res.clearCookie(TOKEN_COOKIE, base);
  res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false });
}

/** Token de la petición: cookie primero, cabecera Authorization después. */
function readToken(req) {
  return req.cookies?.[TOKEN_COOKIE] || req.headers.authorization?.split(' ')[1] || null;
}

/**
 * ¿Hace falta comprobar CSRF? Solo cuando la sesión viene por cookie: una
 * petición autenticada con la cabecera Authorization no se puede falsificar
 * desde otro sitio, porque el navegador no la añade solo.
 */
function needsCsrfCheck(req) {
  if (SAFE_METHODS.has(req.method)) return false;
  return !!req.cookies?.[TOKEN_COOKIE];
}

function csrfIsValid(req) {
  const fromCookie = req.cookies?.[CSRF_COOKIE];
  const fromHeader = req.headers[CSRF_HEADER];
  if (!fromCookie || !fromHeader) return false;
  const a = Buffer.from(String(fromCookie));
  const b = Buffer.from(String(fromHeader));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  issue, clear, readToken, needsCsrfCheck, csrfIsValid,
  TOKEN_COOKIE, CSRF_COOKIE, CSRF_HEADER,
};
