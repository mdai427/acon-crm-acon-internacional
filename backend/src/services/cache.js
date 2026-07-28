// ================================================================
// ACON CRM — Cache Service
// In-process LRU cache con TTL por capa de datos.
// Sin Redis para mantener zero-dependency en Railway.
// Si en el futuro se agrega Redis, solo cambiar los métodos
// get/set/del para usar ioredis — la interfaz es idéntica.
// ================================================================

// ── Tiempos de vida por tipo de dato ────────────────────────────
//  STATIC   → cambia rara vez (config, usuarios, plantillas)
//  COMPUTED → agregaciones costosas (dashboard, reports)
//  LIVE     → data que cambia con frecuencia (leads list, kanban)
//  HOT      → invalidar en cada escritura (no cachear, o TTL mínimo)
const TTL = {
  STATIC:   15 * 60 * 1000,   // 15 min
  COMPUTED:  5 * 60 * 1000,   //  5 min
  LIVE:      2 * 60 * 1000,   //  2 min
  HOT:          30 * 1000,    // 30 seg — para conteos de pipeline en tiempo real
};

// ── LRU store en memoria ─────────────────────────────────────────
const MAX_ENTRIES = 500;

class LRUCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.map = new Map(); // preserva orden de inserción en JS
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const entry = this.map.get(key);
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    // Move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key, value, ttl) {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.maxSize) {
      // Evict least recently used (first entry)
      this.map.delete(this.map.keys().next().value);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttl });
  }

  delete(key) {
    this.map.delete(key);
  }

  // Borrar todas las entradas cuya clave empiece con prefix
  deleteByPrefix(prefix) {
    for (const key of this.map.keys()) {
      if (key.startsWith(prefix)) this.map.delete(key);
    }
  }

  // Borrar entradas que coincidan con un patrón regex
  deleteByPattern(pattern) {
    const re = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    for (const key of this.map.keys()) {
      if (re.test(key)) this.map.delete(key);
    }
  }

  flush() {
    this.map.clear();
  }

  stats() {
    let valid = 0, expired = 0;
    const now = Date.now();
    for (const entry of this.map.values()) {
      if (now > entry.expiresAt) expired++; else valid++;
    }
    return { total: this.map.size, valid, expired, maxSize: this.maxSize };
  }
}

const store = new LRUCache(MAX_ENTRIES);

// ── API pública ──────────────────────────────────────────────────

/**
 * Obtener del cache o ejecutar fn y guardar resultado.
 * @param {string}   key   — clave única
 * @param {Function} fn    — async fn que devuelve el dato
 * @param {number}   ttl   — tiempo de vida en ms (usar constantes TTL)
 */
async function cached(key, fn, ttl = TTL.COMPUTED) {
  const hit = store.get(key);
  if (hit !== undefined) return hit;
  const result = await fn();
  store.set(key, result, ttl);
  return result;
}

function get(key)            { return store.get(key); }
function set(key, val, ttl)  { store.set(key, val, ttl ?? TTL.COMPUTED); }
function del(key)            { store.delete(key); }
function delPrefix(prefix)   { store.deleteByPrefix(prefix); }
function delPattern(pattern) { store.deleteByPattern(pattern); }
function flush()             { store.flush(); }
function stats()             { return store.stats(); }

// ── Invalidation helpers (llamar desde routes al mutar datos) ───

/**
 * Llamar cuando se crea/edita/elimina un Lead.
 * @param {string} [userId]     — invalidar también cache personalizado del usuario
 * @param {string} [assignedTo] — ejecutivo asignado (si cambia de dueño)
 */
function invalidateLead(userId, assignedTo) {
  store.deleteByPrefix('dashboard:');
  store.deleteByPrefix('pipeline:');
  store.deleteByPrefix('kanban:');
  store.deleteByPrefix('reports:team');
  store.deleteByPrefix('copilot:suggestions:');
  store.deleteByPrefix('marketing:analytics');
  if (userId)     store.deleteByPrefix(`dashboard:${userId}`);
  if (assignedTo) store.deleteByPrefix(`dashboard:${assignedTo}`);
}

/** Llamar cuando se crea/edita una Activity */
function invalidateActivity(leadId) {
  if (leadId) store.deleteByPrefix(`lead:${leadId}`);
  store.deleteByPrefix('dashboard:');
  store.deleteByPrefix('reports:team');
}

/** Llamar cuando cambia config de usuarios */
function invalidateUsers() {
  store.deleteByPrefix('users:');
  store.deleteByPrefix('reports:team');
}

/** Llamar cuando cambia una Template */
function invalidateTemplates() {
  store.deleteByPrefix('templates:');
}

/** Llamar cuando cambia una Campaign / Automation */
function invalidateMarketing() {
  store.deleteByPrefix('marketing:');
}

module.exports = {
  TTL,
  cached,
  get, set, del, delPrefix, delPattern, flush, stats,
  invalidateLead, invalidateActivity, invalidateUsers,
  invalidateTemplates, invalidateMarketing,
};
