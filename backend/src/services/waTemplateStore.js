// ============================================
// Espejo local de las plantillas de WhatsApp
// ============================================
//
// Une lo que sabe el proveedor (qué plantillas existen y en qué estado) con lo
// que solo sabe el CRM (quién la creó y con qué contenido se envió a revisión).
// Ver models/WaTemplate.js para el porqué del espejo.

const WaTemplate = require('../models/WaTemplate');

// El estado que informa Meta puede venir en cualquier caja y con nombres que no
// están en nuestro enum; lo que no reconocemos se deja como estaba en vez de
// romper la escritura.
const KNOWN_STATUSES = new Set([
  'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'IN_APPEAL',
]);

function normalizeStatus(raw) {
  const status = String(raw || '').toUpperCase();
  if (KNOWN_STATUSES.has(status)) return status;
  // Meta usa estos alias en algunos eventos.
  if (status === 'PENDING_DELETION' || status === 'DELETED') return 'DISABLED';
  if (status === 'APPROVED_PENDING') return 'PENDING';
  return null;
}

/** Extrae del formato de componentes de Meta los campos planos que guardamos. */
function fromComponents(components = []) {
  const out = { buttons: [] };
  for (const c of components) {
    const type = String(c.type || '').toUpperCase();
    if (type === 'HEADER') {
      out.headerFormat = String(c.format || 'TEXT').toUpperCase();
      if (c.text) out.headerText = c.text;
    } else if (type === 'BODY') {
      out.bodyText = c.text;
    } else if (type === 'FOOTER') {
      out.footerText = c.text;
    } else if (type === 'BUTTONS') {
      out.buttons = (c.buttons || []).map(b => ({
        type: String(b.type || '').toUpperCase(),
        text: b.text,
        url: b.url,
        phone: b.phone || b.phone_number,
      }));
    }
  }
  return out;
}

/** Guarda la plantilla recién enviada a revisión. */
async function recordSubmission({ template, provider, userId }) {
  const now = new Date();
  return WaTemplate.findOneAndUpdate(
    { name: template.name, language: template.language || 'es_MX' },
    {
      $set: {
        category: template.category || 'UTILITY',
        status: normalizeStatus(template.status) || 'PENDING',
        // Un reenvío tras un rechazo empieza de cero: el motivo viejo confunde.
        rejectionReason: null,
        reviewedAt: null,
        headerFormat: template.headerFormat,
        headerText: template.headerText,
        headerHandle: template.headerHandle,
        bodyText: template.bodyText,
        footerText: template.footerText,
        buttons: template.buttons || [],
        examples: template.examples || [],
        variables: template.variables || [],
        provider,
        providerId: template.providerId || template.id || null,
        submittedAt: now,
        lastSyncAt: now,
      },
      $setOnInsert: { createdBy: userId || null },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

/**
 * Aplica un evento `template.status` del webhook.
 * @returns {Promise<{doc: object, changed: boolean}|null>} null si no la conocemos.
 */
async function applyStatusEvent({ name, language, event, status, reason, templateId }) {
  const nextStatus = normalizeStatus(event || status);
  if (!name || !nextStatus) return null;

  // El evento no siempre trae idioma; si falta, se resuelve por nombre. Cuando
  // hay varias traducciones se prefiere la que siga pendiente, que es la que
  // está esperando respuesta de Meta.
  const filter = language ? { name, language } : { name };
  const doc = await WaTemplate.findOne(filter).sort({ status: 1, updatedAt: -1 });
  if (!doc) return null;

  const changed = doc.status !== nextStatus;
  doc.status = nextStatus;
  doc.rejectionReason = nextStatus === 'REJECTED' ? (reason || 'Sin motivo indicado') : null;
  doc.reviewedAt = new Date();
  doc.lastSyncAt = new Date();
  if (templateId && !doc.providerId) doc.providerId = templateId;
  await doc.save();
  return { doc, changed };
}

/**
 * Refresca el espejo con la lista que devuelve el proveedor y entrega la vista
 * unificada: las del proveedor, más las que el CRM envió a revisión y todavía
 * no aparecen en su lista.
 * @param {Array} providerTemplates plantillas en formato Meta (components[])
 * @param {string} provider
 */
async function syncFromProvider(providerTemplates = [], provider = 'meta') {
  const now = new Date();

  for (const tpl of providerTemplates) {
    const status = normalizeStatus(tpl.status);
    if (!tpl.name) continue;
    const flat = fromComponents(tpl.components);
    await WaTemplate.updateOne(
      { name: tpl.name, language: tpl.language || 'es_MX' },
      {
        $set: {
          ...(status ? { status } : {}),
          ...(tpl.category ? { category: String(tpl.category).toUpperCase() } : {}),
          ...flat,
          provider,
          ...(tpl.id ? { providerId: String(tpl.id) } : {}),
          lastSyncAt: now,
        },
        // El cuerpo es obligatorio en el esquema: si el proveedor lo trae vacío
        // (plantillas raras sin BODY) se evita crear un documento inválido.
        $setOnInsert: { submittedAt: now },
      },
      { upsert: !!flat.bodyText },
    );
  }

  const knownNames = new Set(providerTemplates.map(t => `${t.name}|${t.language || 'es_MX'}`));
  // Pendientes que el proveedor todavía no lista: se muestran igual para que
  // quien la creó vea que está en revisión y no la vuelva a crear.
  const locales = await WaTemplate.find({ status: { $ne: 'APPROVED' } }).lean();
  const extra = locales
    .filter(d => !knownNames.has(`${d.name}|${d.language}`))
    .map(toMetaShape);

  return [...providerTemplates, ...extra];
}

/** Devuelve un documento local con la forma de Meta que consume el frontend. */
function toMetaShape(doc) {
  const components = [];
  if (doc.headerFormat) {
    components.push({
      type: 'HEADER',
      format: doc.headerFormat,
      ...(doc.headerText ? { text: doc.headerText } : {}),
    });
  }
  components.push({ type: 'BODY', text: doc.bodyText });
  if (doc.footerText) components.push({ type: 'FOOTER', text: doc.footerText });
  if (doc.buttons?.length) components.push({ type: 'BUTTONS', buttons: doc.buttons });

  return {
    id: doc.providerId || String(doc._id),
    name: doc.name,
    language: doc.language,
    category: doc.category,
    status: doc.status,
    rejectionReason: doc.rejectionReason || null,
    components,
    local: true,
  };
}


// ── Variables ───────────────────────────────────────────────────────
//
// Cada {{n}} del cuerpo es una de dos cosas:
//   · `field`  → un dato que el CRM ya tiene del lead: se rellena solo.
//   · `custom` → algo que depende del momento (una fecha, un folio, un monto):
//                se le pide al ejecutivo justo antes de enviar, con la etiqueta
//                que definió quien creó la plantilla.
//
// Los campos que se pueden usar son una lista cerrada a propósito: `source`
// viaja desde el navegador, y sin lista blanca bastaría con inventarse un
// nombre de campo para colar cualquier dato del lead dentro de un mensaje.

const LEAD_FIELDS = {
  contact:   (l) => (typeof l.contact === 'object' ? l.contact?.name : l.contact) || '',
  company:   (l) => l.company || '',
  email:     (l) => l.email || '',
  phone:     (l) => l.whatsapp || l.phone || '',
  country:   (l) => l.country || '',
  city:      (l) => l.city || '',
  stage:     (l) => l.stage || '',
  service:   (l) => (Array.isArray(l.services) ? l.services[0] : l.services) || '',
  executive: (l) => (typeof l.assignedTo === 'object' ? l.assignedTo?.name : '') || '',
};

const isLeadField = (source) => Object.prototype.hasOwnProperty.call(LEAD_FIELDS, source);

/** Cuántas variables {{n}} distintas tiene un cuerpo. */
function countVariables(bodyText) {
  return new Set([...String(bodyText || '').matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1])).size;
}

/**
 * Deja el mapeo de variables en forma canónica y del largo exacto que pide el
 * cuerpo. Lo que llega mal (un `source` inventado, un tipo desconocido) se
 * degrada a variable personalizada en vez de rechazarse: es preferible pedirle
 * el valor al ejecutivo que perder la plantilla entera.
 */
function normalizeVariables(raw, bodyText) {
  const total = countVariables(bodyText);
  const input = Array.isArray(raw) ? raw : [];

  return Array.from({ length: total }, (_, i) => {
    const v = input[i] || {};
    const source = String(v.source || '').trim();

    if (v.kind !== 'custom' && isLeadField(source)) {
      return { kind: 'field', source, label: v.label || source, sample: v.sample || `Ejemplo ${i + 1}` };
    }
    return {
      kind: 'custom',
      label: v.label?.trim() || `Dato ${i + 1}`,
      sample: v.sample || `Ejemplo ${i + 1}`,
    };
  });
}

/** Resuelve las variables `field` con los datos de un lead concreto. */
function resolveVariables(variables = [], lead = {}) {
  return variables.map(v => (v.kind === 'field' && isLeadField(v.source)
    ? LEAD_FIELDS[v.source](lead)
    : ''));
}

/** Botones en forma canónica, con el tope de 10 que impone Meta. */
function normalizeButtons(raw) {
  const TYPES = new Set(['QUICK_REPLY', 'URL', 'PHONE_NUMBER']);
  return (Array.isArray(raw) ? raw : [])
    .map(b => ({
      type: String(b.type || '').toUpperCase(),
      text: String(b.text || '').trim(),
      url: b.url?.trim(),
      phone: (b.phone || b.phone_number)?.trim(),
    }))
    .filter(b => TYPES.has(b.type) && b.text
      && (b.type !== 'URL' || b.url)
      && (b.type !== 'PHONE_NUMBER' || b.phone))
    .slice(0, 10);
}

/**
 * Adjunta a cada plantilla su mapeo de variables. El proveedor no lo conoce
 * —es información del CRM— así que se toma del espejo local.
 */
async function attachVariables(templates = []) {
  const docs = await WaTemplate.find({}, 'name language variables rejectionReason createdBy')
    .populate('createdBy', 'name')
    .lean();
  const byKey = Object.fromEntries(docs.map(d => [`${d.name}|${d.language}`, d]));

  return templates.map((t) => {
    const local = byKey[`${t.name}|${t.language || 'es_MX'}`];
    return {
      ...t,
      variables: local?.variables || [],
      rejectionReason: t.rejectionReason || local?.rejectionReason || null,
      createdByName: local?.createdBy?.name || null,
    };
  });
}

module.exports = {
  LEAD_FIELDS,
  countVariables,
  normalizeVariables,
  resolveVariables,
  normalizeButtons,
  attachVariables,
  recordSubmission,
  applyStatusEvent,
  syncFromProvider,
  fromComponents,
  normalizeStatus,
  toMetaShape,
};
