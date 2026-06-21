// ============================================
// ACON CRM — AI Task Suggestions per Stage
// Generates 4 specific tasks for a lead based
// on its current stage, services and context.
// ============================================
const OpenAI = require('openai');

const STAGE_LABELS = {
  new:         'Nuevo',
  contacted:   'Contactado',
  qualified:   'Calificado',
  proposal:    'Propuesta',
  negotiation: 'Negociación',
  closed_won:  'Ganado',
  closed_lost: 'Perdido',
};

// Default playbook tasks (used as fallback if OpenAI not configured)
const DEFAULT_PLAYBOOKS = {
  new: [
    'Investigar la empresa en LinkedIn y página web',
    'Identificar al decisor de compra (Gerente de Importaciones / Logística)',
    'Enviar mensaje de primer contacto por WhatsApp',
    'Agendar llamada de descubrimiento de necesidades',
  ],
  contacted: [
    'Enviar correo de presentación con brochure de servicios ACON',
    'Preguntar por rutas actuales, volumen mensual e Incoterms usados',
    'Identificar agente aduanal actual y si hay insatisfacción',
    'Calificar con criterios BANT (Budget, Authority, Need, Timeline)',
  ],
  qualified: [
    'Solicitar detalle de operaciones: orígenes, destinos, frecuencia',
    'Cotizar al menos 2 opciones (FCL y LCL si aplica)',
    'Validar si requiere despacho aduanal o seguro de carga',
    'Preparar comparativa de tiempos de tránsito vs competencia',
  ],
  proposal: [
    'Dar seguimiento 48 horas después de enviar la cotización',
    'Resolver objeciones de precio con argumentos de valor ACON',
    'Ofrecer comparativa detallada de tiempos y costos totales',
    'Involucrar al Director Comercial si el valor supera $50,000 USD',
  ],
  negotiation: [
    'Enviar términos finales con fecha límite de validez',
    'Ofrecer beneficio de cierre: descuento primer embarque o seguro gratis',
    'Solicitar Carta de Intención o Purchase Order',
    'Coordinar con operaciones para confirmar disponibilidad y rutas',
  ],
  closed_won: [
    'Enviar bienvenida formal y presentar al equipo operativo',
    'Solicitar documentos del primer embarque (Invoice, Packing List)',
    'Crear operación en el sistema y asignar agente aduanal',
    'Programar check-in a los 30 días como seguimiento post-venta',
  ],
  closed_lost: [
    'Registrar razón de pérdida en las notas del lead',
    'Enviar mensaje de cierre cordial agradeciendo el tiempo',
    'Programar recontacto automático en 3 meses',
    'Analizar qué ofreció la competencia para mejorar propuestas futuras',
  ],
};

/**
 * Generate AI task suggestions for a lead at a given stage.
 * Returns array of { title, dueInDays } objects.
 * Falls back to default playbook if OpenAI not configured.
 */
async function generateStageTasks(lead, stage) {
  const fallback = DEFAULT_PLAYBOOKS[stage] || DEFAULT_PLAYBOOKS['new'];

  if (!process.env.OPENAI_API_KEY) {
    return fallback.map((title, i) => ({ title, dueInDays: (i + 1) * 2 }));
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `Eres un experto en ventas de freight forwarding internacional.
Genera exactamente 4 tareas concretas y accionables para un ejecutivo de ventas de ACON Internacional.

Datos del prospecto:
- Empresa: ${lead.company}
- Contacto: ${lead.contact || 'No especificado'}
- Servicios de interés: ${(lead.services || []).join(', ') || 'No especificado'}
- País: ${lead.country || 'México'}
- Valor estimado: $${lead.value || 0} USD
- Score IA: ${lead.score || 0}/100
- Días sin contacto: ${lead.daysSinceLastContact || 0}
- Etapa actual: ${STAGE_LABELS[stage] || stage}

Responde SOLO con un JSON array de 4 objetos con esta estructura exacta:
[
  { "title": "Acción concreta y específica", "dueInDays": 2 },
  { "title": "Segunda acción", "dueInDays": 3 },
  { "title": "Tercera acción", "dueInDays": 5 },
  { "title": "Cuarta acción", "dueInDays": 7 }
]

Las tareas deben ser específicas para la etapa "${STAGE_LABELS[stage]}", relevantes al sector logístico/aduanal y adaptadas al perfil del prospecto. No incluyas texto fuera del JSON.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      temperature: 0.4,
    });

    const text = response.choices[0]?.message?.content?.trim() || '';
    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array in response');
    const tasks = JSON.parse(match[0]);
    if (!Array.isArray(tasks) || !tasks.length) throw new Error('Empty tasks array');
    return tasks.slice(0, 4);
  } catch (err) {
    console.error('[aiTasks] Fallback to default playbook:', err.message);
    return fallback.map((title, i) => ({ title, dueInDays: (i + 1) * 2 }));
  }
}

module.exports = { generateStageTasks, DEFAULT_PLAYBOOKS, STAGE_LABELS };
