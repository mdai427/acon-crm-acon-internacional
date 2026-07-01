const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const User = require('../models/User');
const Commission = require('../models/Commission');
const Quote = require('../models/Quote');
const Operation = require('../models/Operation');
const { auth, adminOnly } = require('../middleware/auth');
const { analyzePipeline } = require('../services/aiAgent');
const { cacheMiddleware } = require('../middleware/cacheMiddleware');
const { TTL } = require('../services/cache');

router.use(auth);

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPeriodDates(period) {
  const now = new Date();
  let start, prevStart, prevEnd;
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  switch (period) {
    case 'today':
      start     = startOfDay(now);
      prevStart = new Date(start.getTime() - 86400000);
      prevEnd   = start;
      break;
    case 'week': {
      const dow = now.getDay();
      start     = startOfDay(new Date(now.getTime() - dow * 86400000));
      prevStart = new Date(start.getTime() - 7 * 86400000);
      prevEnd   = start;
      break;
    }
    case 'quarter': {
      const q  = Math.floor(now.getMonth() / 3);
      start     = new Date(now.getFullYear(), q * 3, 1);
      prevStart = new Date(now.getFullYear(), (q - 1) * 3, 1);
      prevEnd   = start;
      break;
    }
    case 'year':
      start     = new Date(now.getFullYear(), 0, 1);
      prevStart = new Date(now.getFullYear() - 1, 0, 1);
      prevEnd   = start;
      break;
    default: // month
      start     = new Date(now.getFullYear(), now.getMonth(), 1);
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEnd   = start;
  }
  return { start, prevStart, prevEnd, now };
}

function trend(current, previous) {
  if (!previous || previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function kpi(current, previous) {
  return { current, previous, trend: trend(current, previous) };
}

// ── GET /api/reports/dashboard — KPIs enterprise con filtro de periodo ─────────
router.get('/dashboard',
  cacheMiddleware(TTL.COMPUTED, req => `dashboard_v2:${req.user.id}:${req.user.role}:${req.query.period || 'month'}`),
  async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const { start, prevStart, prevEnd, now } = getPeriodDates(period);

    const baseFilter = { isActive: true };
    if (req.user.role === 'executive') baseFilter.assignedTo = req.user._id;

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // ── Parallel queries ──────────────────────────────────────────────────
    const [
      // Lead counts by stage (global snapshot)
      byStage,
      bySource,

      // Leads created in current vs previous period
      leadsCurrentPeriod,
      leadsPrevPeriod,

      // Won deals in current vs previous period
      wonCurrentPeriod,
      wonPrevPeriod,

      // Pipeline (non-closed leads)
      pipelineLeads,

      // Activities today
      activitiesToday,
      pendingTasks,
      overdueFollowUps,

      // Sales by month (last 12 months) — from commissions
      salesByMonth,

      // Sales by vendor (current period)
      salesByVendor,

      // Conversion: quotes sent vs accepted
      quotesStats,

      // Avg close time: average days between stage=new and stage=closed_won
      // (approximation via Activity stage_change records)
      closedWonLeads,

      // Recent leads
      recentLeads,

      // Top performers
      topLeads,

      // Operations count
      operationsCount,
    ] = await Promise.all([
      // byStage
      Lead.aggregate([
        { $match: baseFilter },
        { $group: { _id: '$stage', count: { $sum: 1 }, value: { $sum: '$value' } } }
      ]),
      // bySource
      Lead.aggregate([
        { $match: baseFilter },
        { $group: { _id: '$source', count: { $sum: 1 } } }
      ]),
      // leads created current period
      Lead.countDocuments({ ...baseFilter, createdAt: { $gte: start, $lte: now } }),
      // leads created prev period
      Lead.countDocuments({ ...baseFilter, createdAt: { $gte: prevStart, $lt: prevEnd } }),
      // won current period
      Lead.aggregate([
        { $match: { ...baseFilter, stage: 'closed_won', updatedAt: { $gte: start, $lte: now } } },
        { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$value' } } }
      ]),
      // won prev period
      Lead.aggregate([
        { $match: { ...baseFilter, stage: 'closed_won', updatedAt: { $gte: prevStart, $lt: prevEnd } } },
        { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$value' } } }
      ]),
      // pipeline (active stages)
      Lead.aggregate([
        { $match: { ...baseFilter, stage: { $nin: ['closed_won', 'closed_lost'] } } },
        { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$value' } } }
      ]),
      // activities today
      Activity.countDocuments({
        createdAt: { $gte: todayStart },
        ...(req.user.role === 'executive' ? { user: req.user._id } : {})
      }),
      // pending tasks
      Activity.countDocuments({
        type: 'task',
        'taskData.completed': false,
        ...(req.user.role === 'executive' ? { user: req.user._id } : {})
      }),
      // overdue follow-ups
      Lead.countDocuments({
        ...baseFilter,
        nextFollowUpDate: { $lt: now },
        stage: { $nin: ['closed_won', 'closed_lost'] }
      }),
      // sales by month (last 12 months)
      Commission.aggregate([
        {
          $match: {
            status: { $in: ['paid', 'approved'] },
            dealDate: { $gte: new Date(now.getFullYear() - 1, now.getMonth(), 1) },
            ...(req.user.role === 'executive' ? { user: req.user._id } : {})
          }
        },
        {
          $group: {
            _id: { $substr: ['$period', 0, 7] },
            total: { $sum: '$dealValue' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id': 1 } }
      ]),
      // sales by vendor (current period)
      Commission.aggregate([
        {
          $match: {
            status: { $in: ['paid', 'approved'] },
            dealDate: { $gte: start, $lte: now }
          }
        },
        {
          $group: {
            _id: '$user',
            total: { $sum: '$dealValue' },
            count: { $sum: 1 }
          }
        },
        { $sort: { total: -1 } },
        { $limit: 8 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'userInfo' } }
      ]),
      // quotes stats
      Quote.aggregate([
        { $match: { createdAt: { $gte: start, $lte: now } } },
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$totalUSD' } } }
      ]),
      // closed won leads for avg close time
      Lead.find({
        ...baseFilter,
        stage: 'closed_won',
        createdAt: { $gte: prevStart }
      }).select('createdAt updatedAt').limit(100).lean(),
      // recent leads
      Lead.find(baseFilter)
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('assignedTo', 'name')
        .select('company contact stage score value source createdAt daysSinceLastContact')
        .lean(),
      // top leads by score
      Lead.find({ ...baseFilter, score: { $gte: 60 } })
        .sort({ score: -1 })
        .limit(5)
        .populate('assignedTo', 'name')
        .select('company contact stage score value')
        .lean(),
      // operations count
      Operation.countDocuments({ status: { $nin: ['delivered'] } }),
    ]);

    // ── Process data ──────────────────────────────────────────────────────
    const stageMap = byStage.reduce((a, s) => { a[s._id] = s; return a; }, {});

    const wonCurrent  = wonCurrentPeriod[0]  || { count: 0, value: 0 };
    const wonPrev     = wonPrevPeriod[0]     || { count: 0, value: 0 };
    const pipeline    = pipelineLeads[0]     || { count: 0, value: 0 };

    // Leads sin seguimiento (no activity in 5+ days, active stages)
    const noContactDate = new Date(now.getTime() - 5 * 86400000);
    const noFollowUpLeads = await Lead.countDocuments({
      ...baseFilter,
      stage: { $nin: ['closed_won', 'closed_lost'] },
      $or: [
        { lastContactDate: { $lt: noContactDate } },
        { lastContactDate: { $exists: false } }
      ]
    });

    // Leads contacted in period
    const contactedLeads = await Lead.countDocuments({
      ...baseFilter,
      lastContactDate: { $gte: start, $lte: now }
    });

    // Average ticket
    const avgTicketCurrent = wonCurrent.count > 0 ? wonCurrent.value / wonCurrent.count : 0;
    const avgTicketPrev    = wonPrev.count    > 0 ? wonPrev.value    / wonPrev.count    : 0;

    // Average close time (days from created to closed_won)
    let avgCloseTimeDays = 0;
    if (closedWonLeads.length > 0) {
      const totalMs = closedWonLeads.reduce((sum, l) => {
        return sum + (new Date(l.updatedAt) - new Date(l.createdAt));
      }, 0);
      avgCloseTimeDays = Math.round(totalMs / closedWonLeads.length / 86400000);
    }

    // Conversion lead → client (won / total in same period)
    const leadsInPeriod = leadsCurrentPeriod || 1;
    const conversionRate = leadsInPeriod > 0
      ? Math.round((wonCurrent.count / leadsInPeriod) * 100)
      : 0;

    // Conversion quote → sale
    const quoteSent     = quotesStats.find(q => q._id === 'sent')?.count     || 0;
    const quoteAccepted = quotesStats.find(q => q._id === 'accepted')?.count || 0;
    const quoteConversion = quoteSent > 0 ? Math.round((quoteAccepted / quoteSent) * 100) : 0;

    // Lost leads in period
    const lostCurrent = stageMap['closed_lost']?.count || 0;

    // Total pipeline value
    const totalPipelineValue = byStage
      .filter(s => !['closed_won', 'closed_lost'].includes(s._id))
      .reduce((sum, s) => sum + (s.value || 0), 0);

    // Sales by month — fill missing months
    const salesByMonthMap = {};
    salesByMonth.forEach(s => { salesByMonthMap[s._id] = { total: s.total, count: s.count }; });

    const last12Months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const shortMonth = d.toLocaleDateString('es-MX', { month: 'short' });
      last12Months.push({
        month: key,
        label: shortMonth,
        total: salesByMonthMap[key]?.total || 0,
        count: salesByMonthMap[key]?.count || 0,
      });
    }

    // Sales by vendor — populate names
    const salesByVendorFormatted = salesByVendor.map(s => ({
      name: s.userInfo?.[0]?.name || 'Desconocido',
      total: s.total,
      count: s.count,
    }));

    // Lead funnel (conversion between stages)
    const STAGES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed_won'];
    const totalLeadsAll = byStage.reduce((sum, s) => sum + s.count, 0);
    const conversionFunnel = STAGES.map(stage => ({
      stage,
      count: stageMap[stage]?.count || 0,
      value: stageMap[stage]?.value || 0,
      pct: totalLeadsAll > 0
        ? Math.round(((stageMap[stage]?.count || 0) / totalLeadsAll) * 100)
        : 0,
    }));

    res.json({
      success: true,
      data: {
        period,
        kpis: {
          // Sales
          salesAmount:      kpi(wonCurrent.value, wonPrev.value),
          salesCount:       kpi(wonCurrent.count, wonPrev.count),
          avgTicket:        kpi(avgTicketCurrent, avgTicketPrev),
          pipelineValue:    { current: totalPipelineValue },
          // Leads
          newLeads:         kpi(leadsCurrentPeriod, leadsPrevPeriod),
          contactedLeads:   { current: contactedLeads },
          noFollowUpLeads:  { current: noFollowUpLeads },
          overdueFollowUps: { current: overdueFollowUps },
          // Opportunities
          activeOpportunities: { current: pipeline.count, value: pipeline.value },
          wonOpportunities:    kpi(wonCurrent.count, wonPrev.count),
          lostOpportunities:   { current: lostCurrent },
          // Conversion
          leadToClientRate:    { current: conversionRate },
          quoteToSaleRate:     { current: quoteConversion },
          avgCloseTime:        { current: avgCloseTimeDays },
          // Activities
          activitiesToday:     { current: activitiesToday },
          pendingTasks:        { current: pendingTasks },
          overdueFollowUpsCount: { current: overdueFollowUps },
          operationsActive:    { current: operationsCount },
        },
        charts: {
          salesByMonth: last12Months,
          salesByVendor: salesByVendorFormatted,
          salesBySource: bySource.map(s => ({ source: s._id, count: s.count })),
          pipelineByStage: byStage.map(s => ({
            stage: s._id, count: s.count, value: s.value || 0
          })),
          conversionFunnel,
        },
        recentLeads,
        topLeads,
        // Legacy support
        summary: {
          totalLeads: byStage.reduce((s, x) => s + x.count, 0),
          activeDeals: pipeline.count,
          pipelineValue: pipeline.value,
          closedWon: wonCurrent.count,
          closedValue: wonCurrent.value,
          activities30d: activitiesToday,
        },
        byStage,
        bySource,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/reports/conversion — tasa de conversión por etapa (funnel)
router.get('/conversion', adminOnly,
  cacheMiddleware(TTL.COMPUTED, () => 'reports:conversion'),
  async (req, res) => {
  try {
    const filter = { isActive: true };
    const stages = ['new','contacted','qualified','proposal','negotiation','closed_won','closed_lost'];

    const byStage = await Lead.aggregate([
      { $match: filter },
      { $group: { _id: '$stage', count: { $sum: 1 }, totalValue: { $sum: '$value' } } }
    ]);

    const stageMap = byStage.reduce((a, s) => { a[s._id] = s; return a; }, {});
    const total = byStage.reduce((a, s) => a + s.count, 0);
    const won   = stageMap['closed_won']?.count || 0;
    const lost  = stageMap['closed_lost']?.count || 0;

    const funnel = stages.map(stage => ({
      stage,
      count: stageMap[stage]?.count || 0,
      value: stageMap[stage]?.totalValue || 0,
      pct: total > 0 ? Math.round(((stageMap[stage]?.count || 0) / total) * 100) : 0,
    }));

    const timeInStage = await Activity.aggregate([
      { $match: { type: 'stage_change', 'stageChange.from': { $exists: true } } },
      {
        $lookup: {
          from: 'activities',
          let: { leadId: '$lead', stage: '$stageChange.from' },
          pipeline: [
            { $match: { $expr: { $and: [
              { $eq: ['$lead', '$$leadId'] },
              { $eq: ['$stageChange.to', '$$stage'] }
            ]}}},
            { $sort: { createdAt: -1 } },
            { $limit: 1 }
          ],
          as: 'prevChange'
        }
      },
      {
        $addFields: {
          daysInStage: {
            $divide: [
              { $subtract: ['$createdAt', { $ifNull: [{ $arrayElemAt: ['$prevChange.createdAt', 0] }, '$createdAt'] }] },
              86400000
            ]
          }
        }
      },
      {
        $group: {
          _id: '$stageChange.from',
          avgDays: { $avg: '$daysInStage' },
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        total, won, lost,
        winRate: total > 0 ? Math.round((won / (won + lost || 1)) * 100) : 0,
        funnel,
        timeInStage: timeInStage.map(t => ({
          stage: t._id,
          avgDays: Math.round(t.avgDays * 10) / 10,
          transitions: t.count
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/reports/team — solo admin
router.get('/team', adminOnly,
  cacheMiddleware(TTL.COMPUTED, () => 'reports:team'),
  async (req, res) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [leadStats, activityStats, executives] = await Promise.all([
      Lead.aggregate([
        { $match: { isActive: true } },
        { $group: {
          _id: { assignedTo: '$assignedTo', stage: '$stage' },
          count: { $sum: 1 },
          value: { $sum: '$value' },
        }},
      ]),
      Activity.aggregate([
        { $match: { createdAt: { $gte: weekAgo } } },
        { $group: { _id: '$user', count: { $sum: 1 } } },
      ]),
      User.find({ role: 'executive', isActive: true }).select('name email avatar').lean(),
    ]);

    const leadsByExec = {};
    for (const row of leadStats) {
      const execId = String(row._id.assignedTo);
      if (!leadsByExec[execId]) leadsByExec[execId] = {};
      leadsByExec[execId][row._id.stage] = { count: row.count, value: row.value };
    }
    const activitiesByUser = {};
    for (const row of activityStats) {
      activitiesByUser[String(row._id)] = row.count;
    }

    const teamData = executives.map(exec => {
      const stages = leadsByExec[String(exec._id)] || {};
      const closedWon  = stages['closed_won']?.count  || 0;
      const closedLost = stages['closed_lost']?.count || 0;
      const closedTotal = closedWon + closedLost;
      const totalLeads = Object.values(stages).reduce((a, s) => a + s.count, 0);
      const activePipeline = Object.entries(stages)
        .filter(([s]) => !['closed_won', 'closed_lost'].includes(s))
        .reduce((a, [, s]) => a + (s.value || 0), 0);

      return {
        executive: { _id: exec._id, name: exec.name, email: exec.email, avatar: exec.avatar },
        stats: {
          totalLeads,
          closedWon,
          closedLost,
          winRate: closedTotal > 0 ? Math.round((closedWon / closedTotal) * 100) : 0,
          closedValue: stages['closed_won']?.value || 0,
          activePipeline,
          activitiesThisWeek: activitiesByUser[String(exec._id)] || 0,
        },
      };
    });

    res.json({ success: true, data: teamData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/reports/ai-insights
router.get('/ai-insights', async (req, res) => {
  try {
    const insights = await analyzePipeline(req.user._id, req.user.role);
    res.json({ success: true, data: insights });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/reports/export — exportar CSV
router.get('/export', async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.user.role === 'executive') filter.assignedTo = req.user._id;
    if (req.query.stage) filter.stage = req.query.stage;

    const leads = await Lead.find(filter)
      .populate('assignedTo', 'name')
      .lean()
      .limit(5000);

    const headers = ['Empresa','Contacto','Email','Telefono','Etapa','Fuente','Score','Valor USD','Ejecutivo','Creado'];
    const rows = leads.map(l => [
      l.company, l.contact, l.email || '', l.phone || '',
      l.stage, l.source, l.score, l.value || 0,
      l.assignedTo?.name || '',
      l.createdAt.toISOString().split('T')[0]
    ]);

    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="acon_leads_${Date.now()}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/reports/operations — operations summary
router.get('/operations', async (req, res) => {
  try {
    const summary = await Operation.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
