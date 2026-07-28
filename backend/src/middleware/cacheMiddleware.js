// ================================================================
// ACON CRM — Cache Middleware
// Envuelve routes GET con cache automático.
// Uso: router.get('/path', cacheMiddleware(TTL.COMPUTED, keyFn), handler)
// ================================================================
const cache = require('../services/cache');

/**
 * Middleware de cache para respuestas HTTP GET.
 *
 * @param {number}   ttl   — tiempo de vida en ms
 * @param {Function} keyFn — (req) => string con la clave de cache
 *                           Por defecto usa userId + originalUrl + query params
 */
function cacheMiddleware(ttl, keyFn) {
  return (req, res, next) => {
    // Solo cachear GET
    if (req.method !== 'GET') return next();

    const key = keyFn
      ? keyFn(req)
      : `http:${req.user?.id || 'anon'}:${req.originalUrl}`;

    const hit = cache.get(key);
    if (hit !== undefined) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Key', key);
      return res.json(hit);
    }

    // Interceptar res.json para guardar en cache
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Solo cachear respuestas exitosas
      if (res.statusCode < 400 && body?.success !== false) {
        cache.set(key, body, ttl);
      }
      res.setHeader('X-Cache', 'MISS');
      res.setHeader('X-Cache-Key', key);
      return originalJson(body);
    };

    next();
  };
}

module.exports = { cacheMiddleware };
