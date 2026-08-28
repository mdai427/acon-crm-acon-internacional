// ============================================
// Disparadores: qué flujos abre un evento, y los disparadores por reloj
// ============================================

const Flow = require('../../models/Flow');
const Lead = require('../../models/Lead');

const DAY_MS = 86400e3;

// ¿El inicio de este flujo coincide con el evento? (los filtros de entrada se
// evalúan después, en el motor, con el lead cargado)
function triggerMatches(trigger, event) {
  if (!trigger || trigger.type !== event.name) return false;
  const p = trigger.params || {};
  switch (event.name) {
    case 'lead.stage_entered':
      return (p.stages || []).includes(event.stage);
    case 'lead.score_changed': {
      const t = Number(p.threshold);
      if (Number.isNaN(t)) return false;
      const prev = event.previous ?? 0, cur = event.score ?? 0;
      return (p.direction || 'above') === 'above' ? (prev < t && cur >= t) : (prev > t && cur <= t);
    }
    case 'message.received':
      return !p.channel || p.channel === 'any' || p.channel === event.channel;
    case 'lead.created':
      return (!p.sources?.length || p.sources.includes(event.source));
    case 'call.ended':
      return !p.outcome || p.outcome === event.outcome;
    default:
      return true; // lead.assigned, quote.*: sin parámetros
  }
}

/** Flujos activos cuyo inicio coincide con el evento. */
async function matchingFlows(event) {
  const flows = await Flow.find({ isActive: true, status: 'published', 'trigger.type': event.name });
  return flows.filter(f => triggerMatches(f.published?.trigger || f.trigger, event));
}

// ── Por reloj ───────────────────────────────────────────────────────

const OPEN_STAGE_TYPES = ['closed_won', 'closed_lost'];

async function leadsForInactive(params) {
  const days = Number(params.days) || 0;
  if (!days) return [];
  const cutoff = new Date(Date.now() - days * DAY_MS);
  const q = {
    isActive: true,
    stage: params.stages?.length ? { $in: params.stages } : { $nin: OPEN_STAGE_TYPES },
    $or: [{ lastContactDate: { $lt: cutoff } }, { lastContactDate: { $exists: false }, createdAt: { $lt: cutoff } }],
  };
  return Lead.find(q).select('_id').lean();
}

const DATE_FIELDS = ['createdAt', 'lastContactDate', 'nextFollowUpDate', 'assignedAt', 'updatedAt'];

async function leadsForDate(params) {
  const field = DATE_FIELDS.includes(params.field) ? params.field : 'createdAt';
  const offset = Number(params.offsetDays) || 0;
  // El día en que "field + offset" cae en hoy (ventana de 24 h para no
  // perderse por el cron; el cooldown del flujo evita repetir).
  const to = new Date(Date.now() - offset * DAY_MS);
  const from = new Date(to.getTime() - DAY_MS);
  const q = { isActive: true, [field]: { $gte: from, $lte: to } };
  if (params.stages?.length) q.stage = { $in: params.stages };
  return Lead.find(q).select('_id').lean();
}

/**
 * Cron (cada 10 min): abre los flujos «N días sin contacto» y «fecha alcanzada»
 * para los leads que cumplen. La reentrada/cooldown la controla startRun.
 */
async function runClockTriggers(io) {
  const engine = require('./engine');
  const flows = await Flow.find({ isActive: true, status: 'published', 'trigger.type': { $in: ['lead.inactive', 'lead.date_reached'] } });
  let opened = 0;
  for (const flowDoc of flows) {
    const trig = flowDoc.published?.trigger || flowDoc.trigger;
    const leads = trig.type === 'lead.inactive' ? await leadsForInactive(trig.params || {}) : await leadsForDate(trig.params || {});
    for (const { _id } of leads) {
      try {
        const r = await engine.startRun({ flowDoc, leadId: _id, io, triggeredBy: { type: trig.type } });
        if (r) opened++;
      } catch (err) {
        console.error(`[flows] reloj «${flowDoc.name}»:`, err.message);
      }
    }
  }
  if (opened) console.log(`⚙️  Flujos: ${opened} ejecución(es) abiertas por reloj`);
  return opened;
}

module.exports = { triggerMatches, matchingFlows, runClockTriggers, DATE_FIELDS };
