// ============================================
// Alcance por propiedad y saneado de búsquedas
// ============================================

// Roles que ven y editan todo el negocio. El resto solo lo suyo.
const GLOBAL_ROLES = new Set(['admin', 'direccion', 'gerencia', 'finanzas', 'operaciones']);

/**
 * Limita un filtro de Mongo a los registros del usuario cuando su rol no es
 * global. Se aplica sobre el filtro, no después de leer: así la paginación y
 * los totales también salen correctos.
 *
 * @param {object} user
 * @param {object} filter filtro de Mongo, se devuelve una copia nueva
 * @param {string} field campo que guarda al dueño ('createdBy', 'assignedTo'…)
 */
function scopeToOwner(user, filter, field) {
  if (GLOBAL_ROLES.has(user?.role)) return { ...filter };
  return { ...filter, [field]: user._id };
}

/**
 * ¿Este usuario puede tocar este documento?
 * Resolver por id sin comprobarlo es el patrón que permite editar la cotización
 * de otro simplemente cambiando el número en la URL.
 */
function ownsDocument(user, doc, field) {
  if (!doc) return false;
  if (GLOBAL_ROLES.has(user?.role)) return true;
  const owner = doc[field];
  return !!owner && String(owner._id || owner) === String(user._id);
}

/**
 * Escapa los metacaracteres de una búsqueda antes de meterla en un $regex.
 * Sin esto, un `search` como "(a+)+$" cuelga el proceso (ReDoS) y uno como
 * ".*" convierte el filtro en "todo".
 */
function safeRegex(input, flags = 'i') {
  const escaped = String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, flags);
}

module.exports = { scopeToOwner, ownsDocument, safeRegex, GLOBAL_ROLES };
