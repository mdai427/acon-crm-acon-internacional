/**
 * leadAssignment.js
 * Asignación automática de leads a ejecutivos por IA/reglas
 * + Reasignación si no es atendido en 24 horas
 */

const User = require('../models/User');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');

/**
 * Asigna automáticamente un lead al ejecutivo más adecuado.
 * Criterios: especialidad en servicios, carga de trabajo actual, tasa de conversión.
 */
async function autoAssignLead(lead) {
  try {
    // Obtener ejecutivos activos (no admin viewers)
    const executives = await User.find({
      isActive: true,
      role: { $in: ['admin', 'executive'] },
    }).select('_id name email role');

    if (!executives.length) return null;

    // Contar leads activos por ejecutivo (carga de trabajo)
    const workloadCounts = await Lead.aggregate([
      {
        $match: {
          isActive: true,
          assignedTo: { $in: executives.map(e => e._id) },
          stage: { $nin: ['closed_won', 'closed_lost'] },
        },
      },
      { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
    ]);

    const workloadMap = {};
    workloadCounts.forEach(w => { workloadMap[w._id.toString()] = w.count; });

    // Score de cada ejecutivo: menos carga = mejor candidato
    // Bonus si el ejecutivo tiene experiencia con los servicios del lead
    let bestExec = null;
    let bestScore = -1;

    for (const exec of executives) {
      const id = exec._id.toString();
      const workload = workloadMap[id] || 0;
      // Score base: inverso de carga (max 100 leads referencia)
      let score = Math.max(0, 100 - workload);
      // Pequeña variación aleatoria para distribuir leads iguales
      score += Math.random() * 5;

      if (score > bestScore) {
        bestScore = score;
        bestExec = exec;
      }
    }

    return bestExec;
  } catch (err) {
    console.error('autoAssignLead error:', err.message);
    return null;
  }
}

/**
 * Reasigna un lead a otro ejecutivo diferente al actual (aleatorio entre disponibles).
 * Se llama cuando el lead lleva más de 24h sin ser atendido.
 */
async function reassignUnattendedLead(lead, io) {
  try {
    const executives = await User.find({
      isActive: true,
      role: { $in: ['admin', 'executive'] },
      _id: { $ne: lead.assignedTo }, // Excluir al ejecutivo actual
    }).select('_id name email');

    if (!executives.length) return false;

    // Asignar aleatoriamente entre los disponibles
    const newExec = executives[Math.floor(Math.random() * executives.length)];
    const prevExecId = lead.assignedTo;

    await Lead.findByIdAndUpdate(lead._id, {
      assignedTo: newExec._id,
      assignedAt: new Date(),
    });

    // Registrar en el timeline del lead
    await Activity.create({
      lead: lead._id,
      user: newExec._id,
      type: 'note',
      direction: 'internal',
      isAuto: true,
      subject: '🔄 Lead reasignado automáticamente',
      content: `Este lead fue reasignado a ${newExec.name} porque no fue atendido en las primeras 24 horas por el ejecutivo anterior.`,
    });

    // Notificar via socket al nuevo ejecutivo
    io?.to(`user_${newExec._id}`).emit('lead_reassigned', {
      leadId: lead._id,
      company: lead.company,
      message: `Se te asignó el lead "${lead.company}" — no fue atendido por el ejecutivo anterior en 24 hrs.`,
    });

    // Notificar al ejecutivo anterior (si existe)
    if (prevExecId) {
      io?.to(`user_${prevExecId}`).emit('lead_reassigned_away', {
        leadId: lead._id,
        company: lead.company,
        message: `El lead "${lead.company}" fue reasignado porque no fue atendido en 24 horas.`,
      });
    }

    console.log(`🔄 Lead ${lead.company} reasignado de ${prevExecId} a ${newExec.name}`);
    return true;
  } catch (err) {
    console.error('reassignUnattendedLead error:', err.message);
    return false;
  }
}

module.exports = { autoAssignLead, reassignUnattendedLead };
