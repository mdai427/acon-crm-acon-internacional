const { CronJob } = require('cron');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const User = require('../models/User');
const FollowUpRule = require('../models/FollowUpRule');
const { scoreLeadWithAI } = require('./aiAgent');
const { fetchAndSaveRate } = require('./dofService');

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
  // Acciones de playbook con retraso (delayDays): se ejecutan al vencer.
  new CronJob('*/10 * * * *', async () => {
    try {
      await require('./playbookRunner').processDue(io);
    } catch (err) {
      console.error('[cron] playbook diferido:', err.message);
    }
  }, null, true, 'America/Mexico_City');

  // Flujos de automatización: esperas vencidas (cada minuto) y disparadores
  // por reloj —N días sin contacto, fecha alcanzada— (cada 10 minutos).
  new CronJob('* * * * *', async () => {
    try {
      await require('./flows/engine').processDue(io);
    } catch (err) {
      console.error('[cron] flujos:', err.message);
    }
  }, null, true, 'America/Mexico_City');

  new CronJob('*/10 * * * *', async () => {
    try {
      await require('./flows/triggers').runClockTriggers(io);
    } catch (err) {
      console.error('[cron] flujos por reloj:', err.message);
    }
  }, null, true, 'America/Mexico_City');

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

  // ============================================
  // JOB 7: Tipo de cambio DOF — cada día 9:05am L-V
  // ============================================
  new CronJob('5 9 * * 1-5', async () => {
    console.log('⏰ Cron: Actualizando tipo de cambio DOF...');
    try {
      const result = await fetchAndSaveRate();
      console.log(`✅ Tipo de cambio: $${result.rate} MXN/USD (${result.source})`);
    } catch (err) {
      console.error('Cron DOF rate error:', err.message);
    }
  }, null, true, 'America/Mexico_City');

  // Ejecutar inmediatamente al iniciar el servidor (carga inicial)
  fetchAndSaveRate().catch(err => console.warn('[DOF] Carga inicial:', err.message));

  // ============================================
  // JOB 8: Procesar pasos de secuencias WA — cada 30 min
  // ============================================
  new CronJob('*/30 * * * *', async () => {
    console.log('⏰ Cron: Procesando secuencias WhatsApp...');
    try {
      const SequenceEnrollment = require('../models/SequenceEnrollment');
      const Sequence = require('../models/Sequence');
      const now = new Date();
      const due = await SequenceEnrollment.find({ status: 'active', nextRunAt: { $lte: now } })
        .populate({ path: 'sequence', select: 'steps cooldownDays' })
        .populate({ path: 'lead', select: 'company contact whatsapp email stage' })
        .limit(200);

      let processed = 0;
      for (const enroll of due) {
        try {
          const seq = enroll.sequence;
          if (!seq) { await SequenceEnrollment.findByIdAndUpdate(enroll._id, { status: 'exited', exitReason: 'Sequence deleted' }); continue; }
          const steps = seq.steps.sort((a, b) => a.order - b.order);
          const step = steps[enroll.currentStep];
          if (!step) { await SequenceEnrollment.findByIdAndUpdate(enroll._id, { status: 'completed' }); continue; }

          const contact = typeof enroll.lead.contact === 'object' ? enroll.lead.contact?.name : enroll.lead.contact;
          const message = (step.message || '').replace('{empresa}', enroll.lead.company || '').replace('{contacto}', contact || '').replace('{etapa}', enroll.lead.stage || '');

          let shouldSkip = false;
          if (step.skipIf?.type === 'stage_is') shouldSkip = step.skipIf.stages?.includes(enroll.lead?.stage);
          else if (step.skipIf?.type === 'stage_not') shouldSkip = !step.skipIf.stages?.includes(enroll.lead?.stage);

          if (!shouldSkip && message) {
            const actType = step.channel === 'task' ? 'task' : step.channel === 'email' ? 'email_out' : 'whatsapp_out';
            const act = { lead: enroll.lead._id, type: actType, direction: step.channel === 'task' ? 'internal' : 'outbound', isAuto: true, content: message };
            if (step.channel === 'task') act.taskData = { completed: false, dueDate: new Date(Date.now() + 24 * 3600000) };
            await Activity.create(act);
          }

          const nextIdx = enroll.currentStep + 1;
          const nextStep = steps[nextIdx];
          await SequenceEnrollment.findByIdAndUpdate(enroll._id, {
            currentStep: nextIdx, status: nextStep ? 'active' : 'completed',
            nextRunAt: nextStep ? new Date(Date.now() + (nextStep.delayHours || 24) * 3600000) : null,
            $push: { log: { step: enroll.currentStep, executedAt: now, channel: step.channel, result: shouldSkip ? 'skipped' : 'sent' } },
          });
          processed++;
        } catch (err) { console.error('[Seq] step error:', err.message); }
      }
      if (processed > 0) console.log(`✅ Secuencias: ${processed} pasos ejecutados`);
    } catch (err) { console.error('Cron sequences error:', err.message); }
  }, null, true, 'America/Mexico_City');

  console.log('✅ Cron jobs iniciados (zona: Mexico City)');
};

module.exports = { startCronJobs };
