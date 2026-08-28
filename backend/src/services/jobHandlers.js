// ============================================
// ACON CRM — Job Handlers
// Register all async background job types here
// ============================================
const { register } = require('./jobQueue');

// ── Handler: campaign_launch ───────────────────────────────────────
// payload: { campaignId, userId }
register('campaign_launch', async (payload, updateProgress) => {
  const mongoose = require('mongoose');
  const { sendCampaign } = require('./campaignSender');

  try {
    return await sendCampaign(payload.campaignId, updateProgress);
  } catch (error) {
    // La campaña queda en 'paused' con el motivo a la vista, no en 'running'
    // para siempre: así se puede corregir y relanzar sin reenviar a quien ya
    // recibió (los destinatarios ya enviados se saltan).
    await mongoose.models.Campaign?.findByIdAndUpdate(payload.campaignId, {
      status: 'paused', lastError: error.message,
    });
    throw error;
  }
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

console.log('[JobQueue] Handlers registrados: campaign_launch, lead_rescore_all, leads_import');
