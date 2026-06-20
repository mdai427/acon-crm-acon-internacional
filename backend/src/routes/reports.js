const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const User = require('../models/User');
const { auth, adminOnly } = require('../middleware/auth');
const { analyzePipeline } = require('../services/aiAgent');

router.use(auth);

// GET /api/reports/dashboard — KPIs principales
router.get('/dashboard', async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.user.role === 'executive') filter.assignedTo = req.user._id;

    const [
      totalLeads,
      byStage,
      bySource,
      recentLeads,
      activities30d,
      topLeads
    ] = await Promise.all([
      Lead.countDocuments(filter),
      Lead.aggregate([{ $match: filter }, { $group: { _id: '$stage', count: { $sum: 1 }, value: { $sum: '$value' } } }]),
      Lead.aggregate([{ $match: filter }, { $group: { _id: '$source', count: { $sum: 1 } } }]),
      Lead.find(filter).sort({ createdAt: -1 }).limit(5).populate('assignedTo', 'name'),
      Activity.countDocuments({ createdAt: { $gte: new Date(Date.now() - 30*24*60*60*1000) } }),
      Lead.find({ ...filter, score: { $gte: 70 } }).sort({ score: -1 }).limit(5).populate('assignedTo', 'name')
    ]);

    const pipeline = byStage.reduce((acc, s) => { acc[s._id] = s; return acc; }, {});
    const wonDeals = pipeline['closed_won'] || { count: 0, value: 0 };
    const activeDeals = byStage
      .filter(s => !['closed_won','closed_lost'].includes(s._id))
      .reduce((a, s) => ({ count: a.count + s.count, value: a.value + s.value }), { count: 0, value: 0 });

    res.json({
      success: true,
      data: {
        summary: {
          totalLeads,
          activeDeals: activeDeals.count,
          pipelineValue: activeDeals.value,
          closedWon: wonDeals.count,
          closedValue: wonDeals.value,
          activities30d
        },
        byStage,
        bySource,
        recentLeads,
        topLeads
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/reports/conversion — tasa de conversión por etapa (funnel)
router.get('/conversion', adminOnly, async (req, res) => {
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

    // Tiempo promedio entre stage_changes por etapa de origen
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
          prevDate: { $arrayElemAt: ['$prevChange.createdAt', 0] },
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
// Optimizado: 2 aggregations en lugar de N*3 queries (N=# ejecutivos)
router.get('/team', adminOnly, async (req, res) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // 1) Leads agrupados por ejecutivo + etapa en una sola aggregation
    const [leadStats, activityStats, executives] = await Promise.all([
      Lead.aggregate([
        { $match: { isActive: true } },
        { $group: {
          _id: { assignedTo: '$assignedTo', stage: '$stage' },
          count: { $sum: 1 },
          value: { $sum: '$value' },
        }},
      ]),
      // 2) Actividades de esta semana agrupadas por usuario
      Activity.aggregate([
        { $match: { createdAt: { $gte: weekAgo } } },
        { $group: { _id: '$user', count: { $sum: 1 } } },
      ]),
      // 3) Lista de ejecutivos (tabla pequeña, OK)
      User.find({ role: 'executive', isActive: true }).select('name email avatar').lean(),
    ]);

    // Indexar resultados en memoria para O(1) lookup
    const leadsByExec = {}; // { execId: { stage: { count, value } } }
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

// GET /api/reports/ai-insights — analisis con IA
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
      .limit(5000); // guard para colecciones grandes

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
    res.send('\uFEFF' + csv); // BOM para Excel
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
