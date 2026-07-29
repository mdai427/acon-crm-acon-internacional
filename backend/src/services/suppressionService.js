// ============================================
// Rebotes y supresión de correo
// ============================================
//
// Regla: una dirección que rebota en firme o marca spam deja de recibir correo,
// para siempre y en todos los módulos (envío manual, secuencias, campañas).
// No es cortesía: los proveedores miden la tasa de rebote del dominio, y
// seguir escribiendo a direcciones muertas manda a spam el correo del resto.

const EmailSuppression = require('../models/EmailSuppression');
const Lead = require('../models/Lead');

// Un rebote blando aislado es ruido (buzón lleno, servidor caído un rato).
// Repetido, la dirección está muerta igual.
const SOFT_BOUNCE_LIMIT = 3;

function normalize(address) {
  return String(address || '').trim().toLowerCase();
}

/** Clasifica el evento de rebote de Resend en duro o blando. */
function classifyBounce(data) {
  const type = String(data?.bounce?.type || data?.type || '').toLowerCase();
  const subType = String(data?.bounce?.subType || data?.bounce?.sub_type || '').toLowerCase();
  const message = String(data?.bounce?.message || data?.reason || '');

  // Resend reporta "Permanent"/"Transient" siguiendo la nomenclatura de SES.
  if (type.includes('permanent')) return { hard: true, detail: message || subType || 'rebote permanente' };
  if (type.includes('transient') || type.includes('soft')) return { hard: false, detail: message || subType || 'rebote temporal' };

  // Sin clasificación explícita, el texto suele decirlo.
  const hard = /does not exist|no such user|unknown user|invalid recipient|user unknown|mailbox unavailable/i.test(message);
  return { hard, detail: message || 'rebote sin detalle' };
}

/** ¿Esta dirección tiene el envío bloqueado? */
async function isSuppressed(address) {
  const normalized = normalize(address);
  if (!normalized) return false;
  return !!(await EmailSuppression.exists({ address: normalized, releasedAt: null }));
}

/**
 * Corta el envío antes de gastar una llamada al proveedor.
 * @throws {Error} con `code = 'EMAIL_SUPPRESSED'` si la dirección está bloqueada.
 */
async function assertSendable(address) {
  if (await isSuppressed(address)) {
    const error = new Error(`El correo ${normalize(address)} está bloqueado por rebotes previos`);
    error.code = 'EMAIL_SUPPRESSED';
    error.status = 422;
    throw error;
  }
}

/** Refleja el bloqueo en todos los leads con esa dirección, para la UI. */
async function markLeads(address, { canReceive, reason, detail }) {
  const update = canReceive
    ? {
        'emailStatus.canReceive': true,
        $unset: { 'emailStatus.blockedReason': '', 'emailStatus.blockedDetail': '', 'emailStatus.blockedAt': '' },
      }
    : {
        'emailStatus.canReceive': false,
        'emailStatus.blockedReason': reason,
        'emailStatus.blockedDetail': detail,
        'emailStatus.blockedAt': new Date(),
      };

  // $unset no convive con $set implícito en el mismo objeto plano.
  const { $unset, ...set } = update;
  await Lead.updateMany({ email: normalize(address) }, $unset ? { $set: set, $unset } : { $set: set });
}

/**
 * Registra un rebote. Los duros y las quejas de spam bloquean al instante;
 * los blandos se acumulan hasta SOFT_BOUNCE_LIMIT.
 * @returns {Promise<{suppressed: boolean, reason: string|null}>}
 */
async function recordBounce(address, { hard, complaint = false, detail = '' } = {}) {
  const normalized = normalize(address);
  if (!normalized) return { suppressed: false, reason: null };

  const reason = complaint ? 'complaint' : (hard ? 'hard_bounce' : 'soft_bounces');
  const blocksNow = complaint || hard;

  const record = await EmailSuppression.findOneAndUpdate(
    { address: normalized },
    {
      $set: { lastBounceAt: new Date(), detail, ...(blocksNow ? { reason, releasedAt: null, releasedBy: null } : {}) },
      $inc: { bounceCount: 1 },
      $setOnInsert: { address: normalized, ...(blocksNow ? {} : { reason }) },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  // Los blandos acumulados también terminan bloqueando.
  const suppressed = blocksNow || (record.bounceCount >= SOFT_BOUNCE_LIMIT && !record.releasedAt);
  if (!suppressed) {
    await Lead.updateMany(
      { email: normalized },
      { $inc: { 'emailStatus.bounceCount': 1 }, $set: { 'emailStatus.lastBounceAt': new Date() } },
    );
    return { suppressed: false, reason: null };
  }

  if (!blocksNow) await EmailSuppression.updateOne({ _id: record._id }, { reason: 'soft_bounces', releasedAt: null });

  await markLeads(normalized, { canReceive: false, reason: record.reason || reason, detail });
  await Lead.updateMany(
    { email: normalized },
    { $inc: { 'emailStatus.bounceCount': 1 }, $set: { 'emailStatus.lastBounceAt': new Date() } },
  );

  console.warn(`[supresión] ${normalized} bloqueado (${reason}): ${detail}`);
  return { suppressed: true, reason };
}

/** Bloqueo manual desde la UI (el contacto pidió no recibir más). */
async function suppressManually(address, detail = 'Bloqueado manualmente') {
  const normalized = normalize(address);
  await EmailSuppression.findOneAndUpdate(
    { address: normalized },
    { $set: { reason: 'manual', detail, releasedAt: null, releasedBy: null }, $setOnInsert: { address: normalized } },
    { upsert: true, setDefaultsOnInsert: true },
  );
  await markLeads(normalized, { canReceive: false, reason: 'manual', detail });
}

/** Reactiva una dirección: vuelve a poder recibir correo. */
async function release(address, userId) {
  const normalized = normalize(address);
  const record = await EmailSuppression.findOneAndUpdate(
    { address: normalized },
    { $set: { releasedAt: new Date(), releasedBy: userId || null, bounceCount: 0 } },
    { new: true },
  );
  if (!record) return null;
  await markLeads(normalized, { canReceive: true });
  return record;
}

module.exports = {
  isSuppressed,
  assertSendable,
  recordBounce,
  classifyBounce,
  suppressManually,
  release,
  SOFT_BOUNCE_LIMIT,
};
