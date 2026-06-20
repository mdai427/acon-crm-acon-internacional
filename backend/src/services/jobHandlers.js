// ============================================
// ACON CRM — Job Handlers
// Register all async background job types here
// ============================================
const { register } = require('./jobQueue');

// ── Handler: campaign_launch ───────────────────────────────────────
// payload: { campaignId, userId }
register('campaign_launch', async (payload, updateProgress) => {
  const mongoose = require('mongoose');
  const Lead = require('../models/Lead');
  const Activity = require('../models/Activity');
  const Campaign = mongoose.models.Campaign;

  const campaign = await Campaign.findById(payload.campaignId);
  if (!campaign) throw new Error('Campaña no encontrada');

  const filter = { isActive: true };
  if (campaign.segment?.services?.length) filter.services = { $in: campaign.segment.services };
  if (campaign.segment?.stages?.length) filter.stage = { $in: campaign.segment.stages };
  if (campaign.segment?.countries?.length) filter.country = { $in: campaign.segment.countries };
  if (campaign.segment?.minScore) filter.score = { $gte: campaign.segment.minScore };

  const leads = await Lead.find(filter).select('_id company email').limit(500).lean();
  const total = leads.length;
  await Campaign.findByIdAndUpdate(payload.campaignId, { status: 'running', sentCount: total });

  let sent = 0;
  for (const lead of leads) {
    try {
      await Activity.create({
        lead: lead._id,
        type: 'email',
        content: `Campaña "${campaign.name}": ${campaign.subject || campaign.name}`,
        direction: 'outbound',
        user: payload.userId,
      });
      sent++;
      if (sent % 10 === 0) await updateProgress(Math.round((sent / total) * 100), total);
    } catch {}
  }

  await Campaign.findByIdAndUpdate(payload.campaignId, { status: 'completed' });
  return { sent, total };
});

// ── Handler: lead_rescore_all ──────────────────────────────────────
// payload: {}
register('lead_rescore_all', async (payload, updateProgress) => {
  const Lead = require('../models/Lead');
  const { scoreLeadWithAI } = require('./aiAgent');

  const leads = await Lead.find({ isActive: true, score: 0 }).select('_id').lean();
  const total = leads.length;
  let ok = 0, fail = 0;

  for (let i = 0; i < leads.length; i++) {
    try {
      await scoreLeadWithAI(leads[i]._id);
      ok++;
    } catch (e) {
      fail++;
    }
    if ((i + 1) % 5 === 0) await updateProgress(Math.round(((i + 1) / total) * 100), total);
    await new Promise(r => setTimeout(r, 150)); // throttle
  }

  return { ok, fail, total };
});

// ── Handler: followup_execute ──────────────────────────────────────
// payload: { ruleId, userId }
register('followup_execute', async (payload, updateProgress) => {
  const mongoose = require('mongoose');
  const Lead = require('../models/Lead');
  const Activity = require('../models/Activity');
  const FollowUpRule = require('../models/FollowUpRule');

  const rule = await FollowUpRule.findById(payload.ruleId);
  if (!rule || !rule.isActive) throw new Error('Regla no encontrada o inactiva');

  const ACTIVE_STAGES = ['new','contacted','qualified','proposal','negotiation'];
  const filter = { isActive: true, stage: { $in: ACTIVE_STAGES } };

  if (rule.trigger.type === 'days_inactive') {
    filter.daysSinceLastContact = { $gte: rule.trigger.value };
  } else if (rule.trigger.type === 'score_below') {
    filter.score = { $lt: rule.trigger.value };
  } else if (rule.trigger.type === 'stage_entered' && rule.trigger.stages?.length) {
    filter.stage = { $in: rule.trigger.stages };
  }

  const leads = await Lead.find(filter).select('_id company').lean();
  const total = leads.length;
  let executed = 0;

  for (let i = 0; i < leads.length; i++) {
    try {
      for (const action of (rule.actions || [])) {
        if (action.type === 'create_activity') {
          await Activity.create({
            lead: leads[i]._id,
            type: 'task',
            content: action.body || `Follow-up automático: ${rule.name}`,
            direction: 'internal',
            user: payload.userId,
          });
        }
      }
      executed++;
      if ((i + 1) % 10 === 0) await updateProgress(Math.round(((i + 1) / total) * 100), total);
    } catch {}
  }

  await FollowUpRule.findByIdAndUpdate(payload.ruleId, { lastRunAt: new Date(), $inc: { executionCount: 1 } });
  return { executed, total };
});

// ── Handler: leads_import ──────────────────────────────────────────
// payload: { rows: [...], userId }
register('leads_import', async (payload, updateProgress) => {
  const Lead = require('../models/Lead');
  const { rows, userId } = payload;
  const total = rows.length;
  let created = 0, skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (!row.company && !row.contact) { skipped++; continue; }
      await Lead.create({
        company: row.company || row.contact || 'Sin nombre',
        contact: row.contact || '',
        email: row.email || '',
        phone: row.phone || '',
        whatsapp: row.whatsapp || row.phone || '',
        source: row.source || 'other',
        stage: row.stage || 'new',
        country: row.country || 'México',
        notes: row.notes || '',
        value: parseFloat(row.value) || 0,
        services: row.services ? row.services.split(',').map(s => s.trim()).filter(Boolean) : [],
        assignedTo: userId,
      });
      created++;
    } catch { skipped++; }

    if ((i + 1) % 20 === 0) await updateProgress(Math.round(((i + 1) / total) * 100), total);
  }

  return { created, skipped, total };
});

console.log('[JobQueue] Handlers registrados: campaign_launch, lead_rescore_all, followup_execute, leads_import');
