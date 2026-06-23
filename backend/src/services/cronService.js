const { CronJob } = require('cron');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const User = require('../models/User');
const FollowUpRule = require('../models/FollowUpRule');
const { scoreLeadWithAI } = require('./aiAgent');

const startCronJobs = (io) => {
  // ============================================
  // JOB 1: Alertas de inactividad — cada dia 9am
  // ============================================
  new CronJob('0 9 * * 1-5', async () => {
    console.log('⏰ Cron: Verificando leads inactivos...');
    try {
      const users = await User.find({ isActive: true, role: { $ne: 'viewer' } });

      for (const user of users) {
        const inactiveDays = user.notifications?.inactivity || 3;
        const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);

        const inactiveLeads = await Lead.find({
          assignedTo: user._id,
          isActive: true,
          stage: { $nin: ['closed_won', 'closed_lost'] },
          $or: [
            { lastContactDate: { $lt: cutoff } },
            { lastContactDate: { $exists: false }, createdAt: { $lt: cutoff } }
          ]
        }).select('company contact stage score');

        if (inactiveLeads.length > 0) {
          io?.to(`user_${user._id}`).emit('inactivity_alert', {
            count: inactiveLeads.length,
            leads: inactiveLeads.slice(0, 5),
            message: `Tienes ${inactiveLeads.length} lead(s) sin contactar en más de ${inactiveDays} días`
          });

          // Crear tarea en el sistema
          for (const lead of inactiveLeads.slice(0, 10)) {
            const existingTask = await Activity.findOne({
              lead: lead._id,
              type: 'task',
              'taskData.completed': false,
              createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            });

            if (!existingTask) {
              await Activity.create({
                lead: lead._id,
                type: 'task',
                direction: 'internal',
                subject: `Seguimiento pendiente – ${lead.company}`,
                content: `Este lead lleva más de ${inactiveDays} días sin contacto. Etapa: ${lead.stage}. Score: ${lead.score}`,
                isAuto: true,
                taskData: {
                  dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
                  completed: false
                }
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Cron inactivity error:', error);
    }
  }, null, true, 'America/Mexico_City');

  // ============================================
  // JOB 2: Re-scoring de leads — cada domingo 6am
  // ============================================
  new CronJob('0 6 * * 0', async () => {
    console.log('⏰ Cron: Re-scoring de leads...');
    try {
      const leads = await Lead.find({
        isActive: true,
        stage: { $nin: ['closed_won', 'closed_lost'] }
      }).select('_id').limit(100);

      for (const lead of leads) {
        await scoreLeadWithAI(lead._id);
        await new Promise(r => setTimeout(r, 500)); // Limitar llamadas a API
      }
      console.log(`✅ Re-scored ${leads.length} leads`);
    } catch (error) {
      console.error('Cron scoring error:', error);
    }
  }, null, true, 'America/Mexico_City');

  // ============================================
  // JOB 3: Recordatorio de seguimientos — 8am y 2pm
  // ============================================
  new CronJob('0 8,14 * * 1-5', async () => {
    try {
      const now = new Date();
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59);

      const dueActivities = await Activity.find({
        type: 'task',
        'taskData.completed': false,
        'taskData.dueDate': { $lte: endOfDay }
      }).populate('lead', 'company contact assignedTo');

      // Agrupar por ejecutivo
      const byUser = {};
      for (const act of dueActivities) {
        const userId = act.lead?.assignedTo?.toString();
        if (!userId) continue;
        if (!byUser[userId]) byUser[userId] = [];
        byUser[userId].push(act);
      }

      for (const [userId, tasks] of Object.entries(byUser)) {
        io?.to(`user_${userId}`).emit('tasks_reminder', {
          count: tasks.length,
          tasks: tasks.slice(0, 5),
          message: `Tienes ${tasks.length} tarea(s) de seguimiento para hoy`
        });
      }
    } catch (error) {
      console.error('Cron reminder error:', error);
    }
  }, null, true, 'America/Mexico_City');

  // ============================================
  // JOB 4: Actualizar daysSinceLastContact — cada hora
  // ============================================
  new CronJob('0 * * * *', async () => {
    try {
      const leads = await Lead.find({
        isActive: true,
        stage: { $nin: ['closed_won', 'closed_lost'] }
      });

      for (const lead of leads) {
        const lastDate = lead.lastContactDate || lead.createdAt;
        const days = Math.floor((Date.now() - lastDate) / (1000 * 60 * 60 * 24));
        if (lead.daysSinceLastContact !== days) {
          await Lead.findByIdAndUpdate(lead._id, { daysSinceLastContact: days });
        }
      }
    } catch (error) {
      console.error('Cron days update error:', error);
    }
  }, null, true, 'America/Mexico_City');

  // ============================================
  // JOB 5: Ejecutar reglas de seguimiento auto — cada día 9:30am L-V
  // ============================================
  new CronJob('30 9 * * 1-5', async () => {
    console.log('⏰ Cron: Ejecutando reglas de seguimiento automático...');
    try {
      const rules = await FollowUpRule.find({ isActive: true });
      let totalTasks = 0;

      for (const rule of rules) {
        let leads = [];

        if (rule.trigger.type === 'days_inactive') {
          const cutoff = new Date(Date.now() - rule.trigger.value * 24 * 60 * 60 * 1000);
          const stageFilter = rule.trigger.stages?.length
            ? { stage: { $in: rule.trigger.stages } }
            : { stage: { $nin: ['closed_won', 'closed_lost'] } };
          leads = await Lead.find({ isActive: true, ...stageFilter, $or: [{ lastContactDate: { $lt: cutoff } }, { lastContactDate: { $exists: false }, createdAt: { $lt: cutoff } }] }).populate('assignedTo', 'name').limit(100);
        }

        if (rule.trigger.type === 'score_below') {
          const stageFilter = rule.trigger.stages?.length ? { stage: { $in: rule.trigger.stages } } : { stage: { $nin: ['closed_won', 'closed_lost'] } };
          leads = await Lead.find({ isActive: true, ...stageFilter, score: { $lt: rule.trigger.value } }).populate('assignedTo', 'name').limit(100);
        }

        for (const lead of leads) {
          try {
            // Respetar cooldown
            const cooloffDate = new Date(Date.now() - (rule.cooldownDays || 3) * 24 * 60 * 60 * 1000);
            const recent = await Activity.findOne({ lead: lead._id, isAuto: true, createdAt: { $gte: cooloffDate } });
            if (recent) continue;

            const contact = typeof lead.contact === 'object' ? lead.contact?.name : lead.contact;
            const message = (rule.action.message || `Seguimiento pendiente para ${lead.company}`)
              .replace('{empresa}', lead.company)
              .replace('{contacto}', contact || '')
              .replace('{etapa}', lead.stage);

            // Crear tarea en el sistema
            await Activity.create({
              lead: lead._id,
              user: lead.assignedTo?._id,
              type: 'task',
              direction: 'internal',
              isAuto: true,
              subject: rule.action.taskTitle || `[Auto] Seguimiento: ${lead.company}`,
              content: message,
              taskData: {
                dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
                completed: false,
              },
            });

            // Notificar al ejecutivo asignado vía socket
            io?.to(`user_${lead.assignedTo?._id}`).emit('followup_task', {
              ruleName: rule.name,
              leadId: lead._id,
              company: lead.company,
              message,
            });

            totalTasks++;
            await new Promise(r => setTimeout(r, 150));
          } catch (err) {
            console.error(`Followup rule error for lead ${lead._id}:`, err.message);
          }
        }

        await FollowUpRule.findByIdAndUpdate(rule._id, { lastRun: new Date(), $inc: { executionCount: 1 } });
      }

      console.log(`✅ Seguimientos automáticos: ${totalTasks} tareas creadas`);
    } catch (error) {
      console.error('Cron followup error:', error);
    }
  }, null, true, 'America/Mexico_City');

  // ============================================
  // JOB 6: Reasignación de leads no atendidos en 24h — cada día 10am
  // ============================================
  new CronJob('0 10 * * *', async () => {
    console.log('⏰ Cron: Verificando leads no atendidos en 24h...');
    try {
      const { reassignUnattendedLead } = require('./leadAssignment');
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Leads activos asignados hace más de 24h sin ninguna actividad del ejecutivo
      const leads = await Lead.find({
        isActive: true,
        stage: { $nin: ['closed_won', 'closed_lost'] },
        assignedAt: { $lt: cutoff },
      }).populate('assignedTo', 'name email');

      let reassigned = 0;
      for (const lead of leads) {
        // Verificar si el ejecutivo ha tenido alguna actividad manual en este lead
        const hasActivity = await Activity.findOne({
          lead: lead._id,
          isAuto: false,
          createdAt: { $gte: lead.assignedAt },
        });

        if (!hasActivity) {
          const ok = await reassignUnattendedLead(lead, io);
          if (ok) reassigned++;
          await new Promise(r => setTimeout(r, 200));
        }
      }

      console.log(`✅ Leads reasignados por inactividad 24h: ${reassigned}`);
    } catch (error) {
      console.error('Cron reassignment error:', error);
    }
  }, null, true, 'America/Mexico_City');

  console.log('✅ Cron jobs iniciados (zona: Mexico City)');
};

module.exports = { startCronJobs };
