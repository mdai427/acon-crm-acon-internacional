/**
 * Copia solo los campos permitidos de un objeto.
 *
 * Pasar `req.body` entero a `create` o `findByIdAndUpdate` deja que el cliente
 * escriba cualquier campo del esquema: contadores de métricas, el dueño del
 * registro, marcas de aprobación. La lista blanca es explícita a propósito —
 * cuando el esquema crece, el campo nuevo no queda expuesto por accidente.
 *
 * @param {object} source normalmente req.body
 * @param {string[]} fields campos que el cliente sí puede escribir
 */
function pick(source, fields) {
  const out = {};
  if (!source) return out;
  for (const field of fields) {
    if (source[field] !== undefined) out[field] = source[field];
  }
  return out;
}

module.exports = { pick };
