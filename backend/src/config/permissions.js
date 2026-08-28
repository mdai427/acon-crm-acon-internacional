/**
 * ACON CRM — Matriz de Permisos Granulares
 *
 * Roles disponibles:
 *   admin         — Administrador del sistema (acceso total)
 *   direccion     — Dirección general (lectura total + aprobar cotizaciones)
 *   gerencia      — Gerencia comercial (gestión de equipo + aprobaciones)
 *   executive     — Ejecutivo comercial (su propio pipeline)
 *   operaciones   — Operaciones y logística
 *   marketing     — Campañas y automatizaciones
 *   finanzas      — Comisiones y reportes financieros
 *   viewer        — Solo lectura
 */

const PERMISSIONS = {
  // ── LEADS ────────────────────────────────────────────────
  'leads.view':           ['admin','direccion','gerencia','executive','operaciones','marketing','finanzas','viewer'],
  'leads.create':         ['admin','direccion','gerencia','executive','marketing'],
  'leads.edit':           ['admin','direccion','gerencia','executive'],
  'leads.delete':         ['admin','gerencia'],
  'leads.assign':         ['admin','gerencia'],
  'leads.view_all':       ['admin','direccion','gerencia','finanzas'],  // sin este rol, ejecutivo solo ve los suyos
  'leads.import':         ['admin','gerencia','marketing'],
  'leads.export':         ['admin','direccion','gerencia','finanzas'],
  'leads.rescore':        ['admin','gerencia'],

  // ── PIPELINE ─────────────────────────────────────────────
  'pipeline.view':        ['admin','direccion','gerencia','executive','operaciones','marketing','finanzas','viewer'],
  'pipeline.move':        ['admin','gerencia','executive'],
  // Editar las etapas del tablero (crear, renombrar, reordenar, eliminar)
  'pipeline.stages':      ['admin','gerencia'],

  // ── COTIZADOR ────────────────────────────────────────────
  'quotes.view':          ['admin','direccion','gerencia','executive','finanzas','viewer'],
  'quotes.create':        ['admin','gerencia','executive'],
  'quotes.edit':          ['admin','gerencia','executive'],
  'quotes.delete':        ['admin','gerencia'],
  'quotes.approve':       ['admin','direccion','gerencia'],   // puede aprobar/rechazar cotizaciones
  'quotes.send':          ['admin','gerencia','executive'],

  // ── OPERACIONES ──────────────────────────────────────────
  'operations.view':      ['admin','direccion','gerencia','executive','operaciones','finanzas','viewer'],
  'operations.create':    ['admin','gerencia','operaciones'],
  'operations.edit':      ['admin','gerencia','operaciones'],
  'operations.delete':    ['admin','gerencia'],

  // ── COMISIONES ───────────────────────────────────────────
  'commissions.view':     ['admin','direccion','gerencia','executive','finanzas'],
  'commissions.view_all': ['admin','direccion','gerencia','finanzas'],
  'commissions.create':   ['admin','gerencia','finanzas'],
  'commissions.edit':     ['admin','gerencia','finanzas'],
  'commissions.delete':   ['admin'],
  'commissions.config':   ['admin'],

  // ── MARKETING ────────────────────────────────────────────
  'marketing.view':       ['admin','direccion','gerencia','marketing','finanzas','viewer'],
  'marketing.create':     ['admin','gerencia','marketing'],
  'marketing.launch':     ['admin','gerencia','marketing'],
  'marketing.delete':     ['admin','gerencia'],

  // ── REPORTES ─────────────────────────────────────────────
  'reports.view':         ['admin','direccion','gerencia','finanzas','viewer'],
  'reports.team':         ['admin','direccion','gerencia'],
  'reports.export':       ['admin','direccion','gerencia','finanzas'],

  // ── USUARIOS ─────────────────────────────────────────────
  'users.view':           ['admin','direccion','gerencia'],
  'users.create':         ['admin'],
  'users.edit':           ['admin'],
  'users.delete':         ['admin'],

  // ── CONFIGURACIÓN ────────────────────────────────────────
  'config.view':          ['admin'],
  'config.edit':          ['admin'],

  // ── INTEGRACIONES ────────────────────────────────────────
  'integrations.view':    ['admin','direccion'],
  'integrations.connect': ['admin'],
  'integrations.manage':  ['admin','gerencia'],

  // ── CONSUMO DE IA ────────────────────────────────────────
  // Cuánto se le factura al CRM por el uso de IA (sin costo real ni margen,
  // eso solo lo ve el superadmin en su propio panel).
  'ai_usage.view':        ['admin','direccion','gerencia','finanzas'],

  // ── LLAMADAS (Twilio) ────────────────────────────────────
  'calls.make':           ['admin','gerencia','executive'],
  'calls.view':           ['admin','direccion','gerencia','executive'],

  // ── WHATSAPP ─────────────────────────────────────────────
  'whatsapp.view':        ['admin','direccion','gerencia','executive','marketing'],
  'whatsapp.send':        ['admin','gerencia','executive','marketing'],
  'whatsapp.templates':   ['admin','gerencia','marketing'],

  // ── BUZONES DE CORREO ────────────────────────────────────
  // Ver los propios lo puede cualquiera que escriba correos; crear direcciones
  // nuevas y reasignarlas es administración del dominio.
  'mailboxes.view':       ['admin','direccion','gerencia','executive','marketing'],
  'mailboxes.manage':     ['admin','direccion'],
  // Escribir un correo suelto a un lead desde el CRM.
  'email.send':           ['admin','direccion','gerencia','executive','marketing'],
  // Lista de direcciones bloqueadas por rebote. Bloquear a mano corta el envío
  // para todo el CRM, así que no es una acción de cualquier usuario.
  'email.blocklist_view': ['admin','direccion','gerencia','marketing'],
  'email.blocklist_edit': ['admin','direccion','gerencia'],

  // ── PLANTILLAS Y AUTOMATIZACIONES ────────────────────────
  'templates.view':       ['admin','gerencia','executive','marketing'],
  'templates.edit':       ['admin','gerencia','marketing'],
  'flows.view':           ['admin','direccion','gerencia','executive','marketing'],
  'flows.edit':           ['admin','gerencia','marketing'],
  'flows.publish':        ['admin','gerencia'],
  'flows.delete':         ['admin'],

  // ── POST-VENTA ───────────────────────────────────────────
  'postventa.view':       ['admin','direccion','gerencia','executive','operaciones','finanzas'],
  'postventa.edit':       ['admin','gerencia','operaciones'],

  // ── CATÁLOGO ─────────────────────────────────────────────
  'catalog.view':         ['admin','direccion','gerencia','executive','operaciones','marketing','finanzas','viewer'],
  'catalog.edit':         ['admin','gerencia','operaciones'],

  // ── AUDITORÍA ────────────────────────────────────────────
  'audit.view':           ['admin','direccion'],
};

/**
 * Verifica si un rol tiene un permiso específico.
 */
function can(role, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) return false;
  return allowed.includes(role);
}

/**
 * Middleware de Express: verifica permiso antes de continuar.
 * Uso: router.get('/endpoint', auth, require('./permission')('leads.view'), handler)
 */
function permission(perm) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Sin autenticación' });
    if (!can(req.user.role, perm)) {
      return res.status(403).json({
        success: false,
        message: `Acceso denegado. Se requiere permiso: ${perm}`,
        required: perm,
        role: req.user.role,
      });
    }
    next();
  };
}

module.exports = { PERMISSIONS, can, permission };
