// ============================================
// ACON CRM - Agentes de Inteligencia Artificial
// ============================================
const OpenAI = require('openai');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');

let openai;
const getOpenAI = () => {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
};

// ============================================
// AGENTE 1: SCORING DE LEADS
// Puntua del 0-100 la probabilidad de cierre
// ============================================
// Heurística base — siempre disponible, sin dependencia de OpenAI
const heuristicScore = (lead) => {
  let score = 20;
  if (lead.email)                  score += 15;
  if (lead.phone || lead.whatsapp) score += 15;
  if (lead.company)                score += 10;
  if (lead.services?.length)       score += Math.min(lead.services.length * 5, 20);
  if (lead.value > 0)              score += 15;
  if (lead.stage === 'qualified')  score += 5;
  if (lead.stage === 'proposal')   score += 5;
  if (lead.country && lead.country !== 'México') score += 5; // internacional = mayor valor
  return Math.min(score, 100);
};

// Detecta si la API key es un placeholder (sk-xxx...) en vez de una clave real
const isPlaceholderKey = (key) => {
  if (!key) return true;
  if (key.startsWith('sk-xxx') || key.startsWith('sk-xxxx')) return true;
  if (/^sk-[x]+$/i.test(key)) return true;
  return false;
};

const scoreLeadWithAI = async (leadId) => {
  const lead = await Lead.findById(leadId);
  if (!lead) return;

  const apiKey = process.env.OPENAI_API_KEY;
  const ai = !isPlaceholderKey(apiKey) ? getOpenAI() : null;

  if (!ai) {
    // Sin clave real: usar heurística
    const score = heuristicScore(lead);
    await Lead.findByIdAndUpdate(leadId, { score });
    console.log(`📊 Lead ${leadId} scored (heuristic): ${score}/100`);
    return { score, source: 'heuristic' };
  }

  try {
    const prompt = `Eres un experto en ventas de logística internacional. Evalúa este prospecto para ACON Worldwide Logística y asígnale un score del 0 al 100 (probabilidad de cierre).

DATOS DEL PROSPECTO:
- Empresa: ${lead.company}
- Contacto: ${lead.contact} (${lead.position || 'cargo desconocido'})
- Email: ${lead.email || 'no disponible'}
- WhatsApp: ${lead.whatsapp || 'no disponible'}
- País: ${lead.country}
- Fuente: ${lead.source}
- Servicios de interés: ${lead.services?.join(', ') || 'no especificados'}
- Valor estimado: USD ${lead.value || 0}
- Etapa actual: ${lead.stage}
- Notas: ${lead.notes || 'ninguna'}

Responde SOLO con JSON: {"score": NUMBER, "reason": "explicacion breve en español", "priority": "low|medium|high|urgent", "suggestedAction": "accion recomendada"}`;

    const response = await ai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 200
    });

    const result = JSON.parse(response.choices[0].message.content);

    await Lead.findByIdAndUpdate(leadId, {
      score: result.score,
      priority: result.priority,
      aiNotes: result.reason,
      aiQualification: result.suggestedAction
    });

    console.log(`🤖 Lead ${leadId} scored (AI): ${result.score}/100`);
    return { ...result, source: 'ai' };
  } catch (error) {
    // OpenAI falló (credenciales inválidas, límite, red) — caer a heurística
    console.error(`⚠️ AI Scoring error para ${leadId}: ${error.message} — usando heurística`);
    const score = heuristicScore(lead);
    await Lead.findByIdAndUpdate(leadId, { score });
    console.log(`📊 Lead ${leadId} scored (heuristic fallback): ${score}/100`);
    return { score, source: 'heuristic_fallback' };
  }
};

// ============================================
// AGENTE 2: RESPUESTA AUTOMATICA
// Responde mensajes entrantes cuando el ejecutivo no está disponible
// ============================================
const processInboundMessage = async ({ lead, message, channel, io }) => {
  try {
    // Solo responder automaticamente a mensajes nuevos o si lleva >30 min sin respuesta
    const recentActivity = await Activity.findOne({
      lead: lead._id,
      type: `${channel}_out`,
      createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) }
    });

    if (recentActivity) return; // Ya se respondio recientemente

    const ai = getOpenAI();
    if (!ai) return;

    // Obtener historial de conversacion
    const history = await Activity.find({
      lead: lead._id,
      type: { $in: [`${channel}_in`, `${channel}_out`] }
    }).sort({ createdAt: -1 }).limit(10);

    const conversationHistory = history.reverse().map(a => ({
      role: a.direction === 'inbound' ? 'user' : 'assistant',
      content: a.content
    }));

    const systemPrompt = `Eres el asistente virtual de ACON Worldwide Logística, empresa mexicana especializada en logística internacional (flete marítimo, aéreo, terrestre, despacho aduanal).

Tu objetivo es:
1. Dar la bienvenida cordialmente al prospecto
2. Identificar qué tipo de servicio logístico necesita
3. Preguntar origen y destino de sus embarques
4. Obtener datos de contacto si no los tienes
5. Informar que un ejecutivo especializado le contactará en breve

Mantén un tono profesional pero amigable. Respuestas cortas (máx 3 líneas en WhatsApp, párrafo en email).
NUNCA des precios exactos. SIEMPRE ofrece conectar con un ejecutivo.
Empresa: ${lead.company} | Contacto: ${lead.contact}`;

    const response = await ai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: message }
      ],
      max_tokens: 300
    });

    const autoReply = response.choices[0].message.content;

    // Guardar respuesta automatica
    await Activity.create({
      lead: lead._id,
      type: `${channel}_out`,
      direction: 'outbound',
      content: autoReply,
      isAuto: true
    });

    // Enviar la respuesta por el canal correcto
    if (channel === 'whatsapp' && (lead.whatsapp || lead.phone)) {
      const { sendWhatsApp } = require('../routes/whatsapp');
      await sendWhatsApp({
        to: lead.whatsapp || lead.phone,
        message: autoReply
      });
    } else if (channel === 'email' && lead.email) {
      const { sendEmail } = require('../routes/email');
      // Email auto-reply simple
    }

    // Notificar al ejecutivo que hay un mensaje nuevo
    if (lead.assignedTo) {
      io?.to(`user_${lead.assignedTo}`).emit('auto_reply_sent', {
        leadId: lead._id,
        message: autoReply,
        originalMessage: message
      });
    }

    await Lead.findByIdAndUpdate(lead._id, { autoReplySent: true });
    console.log(`🤖 Auto-reply enviado a ${lead.company} via ${channel}`);
    return autoReply;
  } catch (error) {
    console.error('Auto-reply error:', error.message);
  }
};

// ============================================
// AGENTE 3: GENERADOR DE EMAILS
// Genera borradores de emails personalizados
// ============================================
const generateEmailDraft = async ({ lead, purpose, additionalContext }) => {
  try {
    const ai = getOpenAI();
    if (!ai) return null;

    const prompt = `Genera un email profesional para ACON Worldwide Logística.

PROPOSITO: ${purpose}
DESTINATARIO: ${lead.contact} de ${lead.company} (${lead.position || ''})
PAÍS: ${lead.country}
SERVICIOS DE INTERÉS: ${lead.services?.join(', ') || 'logística general'}
CONTEXTO ADICIONAL: ${additionalContext || 'ninguno'}
HISTORIAL: Etapa ${lead.stage}

El email debe ser profesional, conciso (máx 200 palabras), en español mexicano.
Responde con JSON: {"subject": "asunto", "body": "cuerpo del email en HTML simple"}`;

    const response = await ai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 600
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Email draft error:', error.message);
    return null;
  }
};

// ============================================
// AGENTE 4: ANALISIS DE PIPELINE
// Genera insights del equipo comercial
// ============================================
const analyzePipeline = async (userId, role) => {
  try {
    const filter = { isActive: true };
    if (role === 'executive') filter.assignedTo = userId;

    const leads = await Lead.find(filter).select('stage score priority value services country createdAt lastContactDate');

    const ai = getOpenAI();
    if (!ai) return null;

    const stats = {
      total: leads.length,
      byStage: {},
      avgScore: leads.reduce((a, b) => a + b.score, 0) / (leads.length || 1),
      totalValue: leads.reduce((a, b) => a + (b.value || 0), 0),
      inactive: leads.filter(l => {
        const days = (Date.now() - (l.lastContactDate || l.createdAt)) / 86400000;
        return days > 5;
      }).length
    };

    leads.forEach(l => {
      stats.byStage[l.stage] = (stats.byStage[l.stage] || 0) + 1;
    });

    const prompt = `Eres un analista de ventas para ACON Worldwide Logística. Analiza este pipeline y da 3 insights accionables en español.

DATOS: ${JSON.stringify(stats)}

Responde con JSON: {"insights": ["insight1", "insight2", "insight3"], "priority_action": "accion mas urgente"}`;

    const response = await ai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 400
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Pipeline analysis error:', error.message);
    return null;
  }
};

module.exports = {
  scoreLeadWithAI,
  processInboundMessage,
  generateEmailDraft,
  analyzePipeline
};
