// ============================================
// Motor de playbooks — ejecuta acciones de verdad
// ============================================
//
// Cuando un lead entra a una etapa, este motor recorre las acciones de su
// playbook y las EJECUTA con las herramientas del CRM:
//
//   task           → Activity tipo 'task' para el ejecutivo
//   whatsapp       → whatsappMetaService.sendText (mensaje real al lead)
//   email          → mailerService.sendMail (correo real, con buzón del asesor)
//   ai_email_draft → aiAgent redacta y deja el borrador como tarea a aprobar
//   notify         → notificationService al ejecutivo asignado
//
// Reglas de seguridad:
//  - Cada envío real queda como Activity en el timeline (whatsapp_out/email_out).
//  - Si un envío falla (sin número, fuera de ventana de 24 h de Meta, correo
//    bloqueado por rebotes…), la acción SE DEGRADA a tarea para el ejecutivo:
//    la automatización nunca pierde el paso en silencio.
//  - Las acciones con delayDays > 0 se encolan en ScheduledAction y las corre
//    el cron; si el lead ya cambió de etapa cuando vencen, se cancelan.

const Activity = require('../models/Activity');
const Lead = require('../models/Lead');
const Playbook = require('../models/Playbook');
const ScheduledAction = require('../models/ScheduledAction');
const pipelineStages = require('./pipelineStages');

// ── Variables en los textos ──────────────────────────────────────────────────
function render(text, ctx) {
  const { lead, stageLabel, executive } = ctx;
  const contact = typeof lead?.contact === 'object' ? lead.contact?.name : lead?.contact;
  return String(text || '')
    .replaceAll('{empresa}', lead?.company || '')
    .replaceAll('{contacto}', contact || '')
    .replaceAll('{etapa}', stageLabel || lead?.stage || '')
    .replaceAll('{ejecutivo}', executive?.name || 'el equipo ACON');
}

// ¿El lead cumple las condiciones de la acción en este momento? Se evalúa
// también al vencer las diferidas: un lead que subió de score mientras esperaba
// puede activar acciones que al entrar no aplicaban, y viceversa.
function meetsConditions(lead, action) {
  const c = action.onlyIf || {};
  if (c.minScore != null && (lead.score || 0) < c.minScore) return false;
  if (c.maxScore != null && (lead.score || 0) > c.maxScore) return false;
  if (c.minValue != null && (lead.value || 0) < c.minValue) return false;
  return true;
}

// Tarea en el timeline (también es el plan B cuando un envío falla).
async function createTask(lead, userId, { title, message, dueInDays = 2 }, extra = {}) {
  return Activity.create({
    lead: lead._id,
    user: userId || lead.assignedTo?._id || lead.assignedTo,
    type: 'task',
    direction: 'internal',
    subject: title,
    content: message || title,
    isAuto: true,
    taskData: {
      completed: false,
      dueDate: new Date(Date.now() + (dueInDays || 2) * 86400000),
      priority: 'medium',
    },
    metadata: { source: 'playbook', ...extra },
  });
}

// Contenido de la acción: plantilla fija con variables, o redactado por la IA
// si la acción trae instrucciones (el modo híbrido del playbook).
async function buildContent(lead, action, ctx, { channel }) {
  if (!action.aiInstructions) {
    return { body: render(action.message || action.title, ctx), subject: render(action.subject || action.title, ctx) };
  }

  const aiClient = require('./aiClient');
  const contact = typeof lead.contact === 'object' ? lead.contact?.name : lead.contact;
  const formato = 'Responde SOLO con JSON: {"subject": "asunto", "body": "cuerpo del correo en texto plano, máximo 150 palabras"}.';

  const r = await aiClient.chat({
    feature: 'playbook_agent',
    lead: lead._id,
    messages: [{ role: 'user', content: `Eres el asistente comercial de ACON Worldwide Logística.
Redacta un correo para este prospecto.

INSTRUCCIONES DEL PLAYBOOK: ${action.aiInstructions}

CONTEXTO DEL LEAD:
- Empresa: ${lead.company} | Contacto: ${contact || 'desconocido'}
- Etapa: ${ctx.stageLabel} | Servicios: ${(lead.services || []).join(', ') || 'no especificados'}
- Score IA: ${lead.score || 0}/100 | Valor estimado: $${lead.value || 0} USD
- Notas del calificador: ${lead.aiNotes || 'sin análisis previo'}
- Ejecutivo asignado: ${ctx.executive?.name || 'equipo ACON'}

Reglas: español mexicano, nunca inventes precios ni plazos concretos, no prometas nada que no esté en las instrucciones.
${formato}` }],
    max_tokens: 400,
    temperature: 0.5,
  });

  const match = (r.content || '').match(/\{[\s\S]*\}/);
  const parsed = match ? JSON.parse(match[0]) : { subject: render(action.title, ctx), body: r.content };
  return { subject: parsed.subject, body: parsed.body };
}

// ── Ejecutores por tipo de acción ────────────────────────────────────────────

async function runWhatsApp(lead, action, ctx) {
  const wa = require('./whatsappMetaService');
  const phone = lead.whatsapp || lead.phone
    || (typeof lead.contact === 'object' ? lead.contact?.whatsapp : null);
  if (!phone) throw new Error('El lead no tiene número de WhatsApp');

  // Solo plantillas aprobadas de Meta: el texto libre no entrega fuera de la
  // ventana de 24 h, así que en automatizaciones no tiene sentido.
  if (!action.metaTemplate?.name) {
    throw new Error('La acción no tiene plantilla de Meta seleccionada');
  }

  await wa.sendTemplate(phone, action.metaTemplate.name, action.metaTemplate.language || 'es_MX');
  await Activity.create({
    lead: lead._id, user: ctx.userId, type: 'whatsapp_out', direction: 'outbound',
    content: `[Plantilla Meta] ${action.metaTemplate.name}`, isAuto: true,
    metadata: { source: 'playbook', action: action.title, metaTemplate: action.metaTemplate.name },
  });
  return `Plantilla "${action.metaTemplate.name}" enviada a ${phone}`;
}

async function runEmail(lead, action, ctx) {
  if (!lead.email) throw new Error('El lead no tiene correo');
  const suppression = require('./suppressionService');
  await suppression.assertSendable(lead.email);

  const mailer = require('./mailerService');
  const mailboxService = require('./mailboxService');

  // Se envía desde el buzón del ejecutivo asignado si existe; si no, el global.
  const mailbox = ctx.executive ? await mailboxService.defaultFor(ctx.executive) : null;

  // Con plantilla elegida, el contenido sale de la sección Plantillas (con las
  // mismas variables); si no, plantilla inline o redacción de la IA.
  let subject, body;
  if (action.templateId) {
    const Template = require('../models/Template');
    const tpl = await Template.findById(action.templateId).lean();
    if (!tpl) throw new Error('La plantilla del playbook ya no existe');
    subject = render(tpl.subject || action.title, ctx);
    body = render(tpl.body || '', ctx);
  } else {
    ({ subject, body } = await buildContent(lead, action, ctx, { channel: 'email' }));
  }

  const info = await mailer.sendMail({
    from: mailbox ? mailbox.fromHeader() : undefined,
    to: lead.email,
    replyTo: mailbox ? mailboxService.buildReplyTo(mailbox, lead._id) : undefined,
    subject,
    html: body.replace(/\n/g, '<br>'),
  });

  await Activity.create({
    lead: lead._id, user: ctx.userId, type: 'email_out', direction: 'outbound',
    subject, content: body.slice(0, 500), isAuto: true,
    emailData: { messageId: info.messageId, to: [lead.email] },
    metadata: { source: 'playbook', action: action.title },
  });
  return `Correo enviado a ${lead.email}`;
}

async function runAiEmailDraft(lead, action, ctx) {
  const { generateEmailDraft } = require('./aiAgent');
  const draft = await generateEmailDraft({
    lead,
    purpose: render(action.message || action.title, ctx),
  });
  if (!draft) throw new Error('La IA no pudo generar el borrador');

  // El borrador queda como tarea: lo revisa un humano antes de salir.
  await createTask(lead, ctx.userId, {
    title: `Revisar y enviar: ${draft.subject}`,
    message: `Borrador generado por IA para ${lead.company}:\n\nAsunto: ${draft.subject}\n\n${draft.body.replace(/<[^>]*>/g, '')}`,
    dueInDays: action.dueInDays || 1,
  }, { aiDraft: { subject: draft.subject, body: draft.body } });
  return 'Borrador de correo listo para revisión';
}

async function runNotify(lead, action, ctx) {
  const { notifyUser } = require('./notificationService');
  const assigneeId = lead.assignedTo?._id || lead.assignedTo;
  if (!assigneeId) throw new Error('El lead no tiene ejecutivo asignado');
  await notifyUser({
    io: ctx.io,
    userId: assigneeId,
    type: 'playbook',
    title: render(action.title, ctx),
    body: render(action.message || '', ctx) || `${lead.company} entró a ${ctx.stageLabel}`,
    meta: { leadId: lead._id },
  });
  return 'Ejecutivo notificado';
}

const EXECUTORS = {
  whatsapp: runWhatsApp,
  email: runEmail,
  ai_email_draft: runAiEmailDraft,
  notify: runNotify,
};

/**
 * Ejecuta una acción concreta. Si un envío real falla, degrada a tarea.
 */
async function executeAction(lead, action, ctx) {
  if (action.kind === 'task' || !EXECUTORS[action.kind]) {
    await createTask(lead, ctx.userId, {
      title: render(action.title, ctx),
      message: render(action.message || '', ctx),
      dueInDays: action.dueInDays,
    });
    return { ok: true, detail: 'Tarea creada' };
  }

  try {
    const detail = await EXECUTORS[action.kind](lead, action, ctx);
    return { ok: true, detail };
  } catch (err) {
    // Plan B: la acción no se pierde, se convierte en tarea con el motivo.
    await createTask(lead, ctx.userId, {
      title: `[Manual] ${render(action.title, ctx)}`,
      message: `La automatización no pudo ejecutarse (${err.message}). Hazlo manualmente:\n\n${render(action.message || action.title, ctx)}`,
      dueInDays: 1,
    }, { failedKind: action.kind, failedReason: err.message });
    return { ok: false, detail: err.message };
  }
}

/**
 * Punto de entrada: el lead acaba de entrar a `stageKey`.
 * Las acciones inmediatas se ejecutan ya; las diferidas se encolan.
 */
async function runStageEntry({ leadId, stageKey, userId, io }) {
  const playbook = await Playbook.findOne({ stage: stageKey, isActive: true }).lean();
  const lead = await Lead.findById(leadId).populate('assignedTo', 'name email');
  if (!lead) return { executed: 0 };

  // Lo primero: un cambio de etapa cancela lo que dejó encolado la anterior —
  // esos mensajes ya no aplican al nuevo contexto de la venta. Va antes de
  // cualquier salida temprana (p. ej. la rama de tareas IA).
  await ScheduledAction.updateMany(
    { lead: lead._id, status: 'pending', stage: { $ne: stageKey } },
    { status: 'canceled' }
  );

  // Documentos de la época anterior: tasks planas equivalen a acciones task.
  const actions = playbook?.actions?.length
    ? playbook.actions
    : (playbook?.tasks || []).map(t => ({ kind: 'task', title: t.title, dueInDays: t.dueInDays }));

  const labels = await pipelineStages.labels();

  // Sin acciones definidas: si la IA está activa, sugiere tareas para la etapa
  // (comportamiento histórico del playbook).
  if (!actions.length) {
    if (playbook && playbook.useAI === false) return { executed: 0, empty: true };
    const { generateStageTasks } = require('./aiTasks');
    const suggested = await generateStageTasks(lead, stageKey);
    for (const t of suggested) {
      await createTask(lead, userId, { title: t.title, dueInDays: t.dueInDays });
    }
    return { executed: suggested.length, source: 'ai' };
  }

  const ctx = {
    userId,
    io,
    lead,
    stageLabel: labels[stageKey] || stageKey,
    executive: lead.assignedTo,
  };

  let executed = 0;
  let skipped = 0;
  for (const action of [...actions].sort((a, b) => (a.order || 0) - (b.order || 0))) {
    if (!meetsConditions(lead, action)) { skipped++; continue; }
    if ((action.delayDays || 0) > 0) {
      await ScheduledAction.create({
        lead: lead._id, user: userId, stage: stageKey, action,
        runAt: new Date(Date.now() + action.delayDays * 86400000),
      });
    } else {
      const r = await executeAction(lead, action, ctx);
      if (r.ok) executed++;
    }
  }

  return {
    executed,
    skipped,
    queued: actions.filter(a => (a.delayDays || 0) > 0 && meetsConditions(lead, a)).length,
  };
}

/**
 * Ejecuta las acciones diferidas vencidas. Lo llama el cron cada 10 minutos.
 */
async function processDue(io) {
  const due = await ScheduledAction.find({ status: 'pending', runAt: { $lte: new Date() } })
    .limit(50);

  let done = 0;
  for (const item of due) {
    try {
      const lead = await Lead.findById(item.lead).populate('assignedTo', 'name email');
      // El lead cambió de etapa mientras la acción esperaba → ya no aplica.
      if (!lead || !lead.isActive || lead.stage !== item.stage) {
        item.status = 'canceled';
        await item.save();
        continue;
      }
      // Las condiciones se revalúan con los datos de hoy, no los de cuando se encoló.
      if (!meetsConditions(lead, item.action)) {
        item.status = 'canceled';
        item.error = 'Condición no cumplida al vencer';
        await item.save();
        continue;
      }

      const labels = await pipelineStages.labels();
      const r = await executeAction(lead, item.action, {
        userId: item.user, io, lead,
        stageLabel: labels[item.stage] || item.stage,
        executive: lead.assignedTo,
      });

      item.status = r.ok ? 'done' : 'failed';
      item.error = r.ok ? undefined : r.detail;
      item.executedAt = new Date();
      await item.save();
      done++;
    } catch (err) {
      item.status = 'failed';
      item.error = err.message;
      await item.save();
    }
  }
  if (done) console.log(`⚙️  Playbooks: ${done} acción(es) diferidas ejecutadas`);
  return done;
}

module.exports = { runStageEntry, processDue, executeAction, render };
