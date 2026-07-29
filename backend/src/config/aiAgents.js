// ============================================
// Registro de agentes de IA del CRM
// ============================================
//
// Cada función del CRM que consume IA es un "agente" con su propio identificador
// (`feature`). Este archivo es la fuente única de verdad: de aquí salen las
// etiquetas del panel de consumo, la lista que el super admin configura y el
// modelo por defecto de cada uno.
//
// Al añadir una función nueva que llame a aiClient, regístrala aquí para que
// aparezca en el panel y pueda configurarse su modelo.

const AI_AGENTS = [
  {
    id: 'copilot',
    name: 'Copiloto (chat flotante)',
    description: 'Asistente conversacional que responde dentro del CRM',
    kind: 'chat',
    defaultModel: 'gpt-4o-mini',
    where: 'Botón flotante en todas las pantallas',
  },
  {
    id: 'lead_scoring',
    name: 'Calificador de leads',
    description: 'Puntúa de 0 a 100 la probabilidad de cierre y sugiere acción',
    kind: 'chat',
    defaultModel: 'gpt-4o-mini',
    where: 'Al crear o recalificar un lead',
  },
  {
    id: 'auto_reply',
    name: 'Respuesta automática',
    description: 'Contesta mensajes entrantes de WhatsApp y correo',
    kind: 'chat',
    defaultModel: 'gpt-4o-mini',
    where: 'Mensajes entrantes sin respuesta reciente',
  },
  {
    id: 'email_draft',
    name: 'Redactor de correos',
    description: 'Escribe borradores de correo para el ejecutivo',
    kind: 'chat',
    defaultModel: 'gpt-4o-mini',
    where: 'Ficha del lead y automatizaciones',
  },
  {
    id: 'company_research',
    name: 'Investigador de empresas',
    description: 'Genera el reporte de giro, rutas y potencial logístico',
    kind: 'chat',
    defaultModel: 'gpt-4o-mini',
    where: 'Pestaña “Empresa IA” del lead',
  },
  {
    id: 'quote_suggest',
    name: 'Sugerencia de cotización',
    description: 'Propone precio, carrier y tránsito según el histórico',
    kind: 'chat',
    defaultModel: 'gpt-4o-mini',
    where: 'Cotizador',
  },
  {
    id: 'stage_tasks',
    name: 'Tareas por etapa',
    description: 'Genera el plan de 4 acciones al mover un lead de etapa',
    kind: 'chat',
    defaultModel: 'gpt-4o-mini',
    where: 'Cambio de etapa en el pipeline',
  },
  {
    id: 'pipeline_analysis',
    name: 'Análisis de pipeline',
    description: 'Resume el embudo y señala la acción más urgente',
    kind: 'chat',
    defaultModel: 'gpt-4o-mini',
    where: 'Reportes e insights de IA',
  },
  {
    id: 'call_transcription',
    name: 'Transcripción de llamadas',
    description: 'Convierte a texto la grabación de cada llamada',
    kind: 'audio',
    defaultModel: 'whisper-1',
    where: 'Al terminar una llamada de Twilio',
  },
  {
    id: 'connection_test',
    name: 'Prueba de conexión',
    description: 'Llamada mínima para verificar que la API responde',
    kind: 'chat',
    defaultModel: 'gpt-4o-mini',
    where: 'Botón “Probar conexión” del panel',
  },
];

const AGENTS_BY_ID = Object.fromEntries(AI_AGENTS.map(a => [a.id, a]));

const getAgent = (id) => AGENTS_BY_ID[id] || null;

// Nombre legible de un agente; si llega uno no registrado se devuelve su id para
// que el panel siga mostrando algo útil.
const labelFor = (id) => AGENTS_BY_ID[id]?.name || id;

module.exports = { AI_AGENTS, AGENTS_BY_ID, getAgent, labelFor };
