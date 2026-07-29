// ============================================
// Buzones: enrutamiento, permisos y tokens de respuesta
// ============================================

const crypto = require('crypto');
const Mailbox = require('../models/Mailbox');

// Dominio donde viven los buzones del CRM. Se usa un subdominio propio
// (mail.aconinternacional.com) para no tocar el MX del dominio corporativo:
// el MX es único, y apuntarlo a Resend dejaría a Google Workspace sin recibir.
function inboundDomain() {
  return String(process.env.INBOUND_EMAIL_DOMAIN || '').trim().toLowerCase();
}

function isValidLocalPart(localPart) {
  // Sin '+': ese carácter se reserva para el token de respuesta.
  return /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(localPart);
}

// ── Token de respuesta ──────────────────────────────────────────────
//
// Cada correo saliente lleva un Reply-To del tipo
//   ventas+l<leadId>.<firma>@mail.aconinternacional.com
// Así, cuando el contacto responde, sabemos exactamente a qué lead pertenece
// aunque conteste desde otra dirección. La firma HMAC evita que alguien
// escriba a un lead ajeno inventando el token.

const TOKEN_SIG_LENGTH = 10;

function signToken(localPart, leadId) {
  return crypto
    .createHmac('sha256', process.env.JWT_SECRET || '')
    .update(`${localPart}:${leadId}`)
    .digest('hex')
    .slice(0, TOKEN_SIG_LENGTH);
}

/** Dirección de respuesta con el lead codificado. */
function buildReplyTo(mailbox, leadId) {
  if (!leadId) return mailbox.address;
  const [localPart, domain] = mailbox.address.split('@');
  return `${localPart}+l${leadId}.${signToken(localPart, leadId)}@${domain}`;
}

/**
 * Extrae el lead de una dirección con token, validando la firma.
 * @returns {{ address: string, leadId: string|null }} address = dirección sin token
 */
function parseAddress(raw) {
  const address = String(raw || '').trim().toLowerCase();
  const [localPart, domain] = address.split('@');
  if (!localPart || !domain) return { address, leadId: null };

  const match = localPart.match(/^([^+]+)\+l([a-f0-9]{24})\.([a-f0-9]+)$/);
  if (!match) return { address, leadId: null };

  const [, base, leadId, sig] = match;
  const expected = signToken(base, leadId);
  const valid = sig.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));

  return { address: `${base}@${domain}`, leadId: valid ? leadId : null };
}

// ── Enrutamiento del correo entrante ────────────────────────────────

/**
 * Encuentra el buzón destinatario entre todos los "to"/"cc" del correo.
 * Devuelve también el lead si venía codificado en el Reply-To.
 */
async function resolveInbound(recipients) {
  const parsed = (recipients || []).filter(Boolean).map(parseAddress);
  if (!parsed.length) return { mailbox: null, leadId: null };

  const mailbox = await Mailbox.findOne({
    address: { $in: parsed.map(p => p.address) },
    isActive: true,
  });
  if (!mailbox) return { mailbox: null, leadId: null };

  // El lead solo vale si venía en la dirección de ESE buzón.
  const hit = parsed.find(p => p.address === mailbox.address && p.leadId);
  return { mailbox, leadId: hit?.leadId || null };
}

// ── Permisos ────────────────────────────────────────────────────────

/** Un usuario puede usar un buzón si es su dueño, lo comparte, o es admin. */
function canUse(user, mailbox) {
  if (!mailbox?.isActive) return false;
  if (['admin', 'direccion', 'gerencia'].includes(user.role)) return true;
  const uid = String(user._id);
  return String(mailbox.assignedTo) === uid
    || (mailbox.sharedWith || []).some(id => String(id) === uid);
}

/** Buzones que el usuario puede usar como remitente. */
function visibleFilter(user) {
  if (['admin', 'direccion', 'gerencia'].includes(user.role)) return { isActive: true };
  return {
    isActive: true,
    $or: [{ assignedTo: user._id }, { sharedWith: user._id }],
  };
}

/**
 * Buzón a usar cuando nadie especifica remitente: el preferido del usuario,
 * si no el marcado por defecto. Devuelve null si todavía no hay buzones — en
 * ese caso el llamador cae al RESEND_FROM global de siempre.
 */
async function defaultFor(user) {
  if (user) {
    const own = await Mailbox.findOne({ isActive: true, assignedTo: user._id });
    if (own) return own;
  }
  return Mailbox.findOne({ isActive: true, isDefault: true });
}

module.exports = {
  inboundDomain,
  isValidLocalPart,
  buildReplyTo,
  parseAddress,
  resolveInbound,
  canUse,
  visibleFilter,
  defaultFor,
};
