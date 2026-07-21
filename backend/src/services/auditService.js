const AuditLog = require('../models/AuditLog');

/**
 * Record an audit event.
 * @param {Object} opts
 * @param {Object}  opts.req       - Express request (provides user + IP)
 * @param {string}  opts.action    - 'create' | 'update' | 'delete' | 'login' | 'export' | 'approve'
 * @param {string}  opts.entity    - Model name, e.g. 'Lead', 'Quote', 'User'
 * @param {*}       opts.entityId  - MongoDB ObjectId of the affected document
 * @param {string}  [opts.entityLabel] - Human-readable identifier (company name, folio, etc.)
 * @param {Object}  [opts.before]  - Old document values (plain object)
 * @param {Object}  [opts.after]   - New document values (plain object)
 * @param {Object}  [opts.meta]    - Any extra context
 */
async function audit({ req, action, entity, entityId, entityLabel, before, after, meta }) {
  try {
    const changes = [];
    if (before && after) {
      const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
      for (const key of allKeys) {
        const oldVal = before[key];
        const newVal = after[key];
        // Compare as strings to handle dates / ObjectIds
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changes.push({ field: key, oldValue: oldVal, newValue: newVal });
        }
      }
    }

    const ip = req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
      || req?.socket?.remoteAddress
      || req?.ip
      || 'unknown';

    await AuditLog.create({
      user:        req?.user?._id,
      userName:    req?.user?.name,
      userRole:    req?.user?.role,
      ip,
      userAgent:   req?.headers?.['user-agent'],
      action,
      entity,
      entityId,
      entityLabel,
      changes,
      meta,
    });
  } catch (err) {
    // Audit failures should never crash the app
    console.error('[audit] Failed to log:', err.message);
  }
}

module.exports = { audit };
