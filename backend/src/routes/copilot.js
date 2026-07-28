const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const OpenAI = require('openai');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const { cacheMiddleware } = require('../middleware/cacheMiddleware');
const { TTL } = require('../services/cache');

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'No autorizado' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { return res.status(401).json({ success: false, message: 'Token inválido' }); }
};

const SYSTEM_PROMPT = `Eres el Copilot de ACON Internacional, asistente de IA integrado en el CRM de una empresa de Freight Forwarding con base en México.

ACON Internacional ofrece servicios logísticos internacionales:
• Flete Marítimo FCL/LCL — Importación y Exportación
• Flete Aéreo — Importación y Exportación
• Transporte Terrestre — USA/Canadá y Nacional MX
• Despacho Aduanal — Pedimentos de importación y exportación
• Almacenaje y distribución en México
• Seguro de Carga Internacional

Términos clave del sector que conoces:
- Incoterms: FOB, CIF, EXW, DAP, DDP, FCA
- Documentos: BL (Bill of Lading), AWB (Air Waybill), Pedimento, Carta de Porte, Packing List, Comercial Invoice, Certificado de Origen
- Puertos/aeropuertos MX: Manzanillo, Veracruz, Lázaro Cárdenas, AICM, Monterrey, Guadalajara
- Trade lanes principales: China-México, USA-México, Europa-México

Puedes ayudar con:
✓ Análisis del pipeline de ventas y leads
✓ Redacción de correos, propuestas y mensajes de seguimiento
✓ Estrategias de prospección para importadores/exportadores
✓ Información sobre procesos aduanales y logísticos
✓ Interpretación de métricas y KPIs del CRM
✓ Sugerencias de acciones para cerrar oportunidades

Responde siempre en español, de forma concisa y profesional. Cuando no tengas datos específicos del CRM, ofrece orientación estratégica basada en mejores prácticas de freight forwarding.`;

router.post('/chat', auth, async (req, res) => {
  const { messages, context } = req.body;

  if (!process.env.OPENAI_API_KEY) {
    return res.status(400).json({ success: false, message: 'OPENAI_API_KEY no configurado' });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Build context string from CRM data
    let contextStr = '';
    if (context?.leadId) {
      const lead = await Lead.findById(context.leadId).populate('assignedTo', 'name');
      if (lead) {
        contextStr = `\nContexto del lead actual: ${lead.company}, etapa: ${lead.stage}, valor: $${lead.value || 0} USD, score IA: ${lead.score || 0}, servicios: ${(lead.services || []).join(', ')}, país: ${lead.country}, días sin contacto: ${lead.daysSinceLastContact || 0}.`;
      }
    }
    if (context?.pipelineSummary) {
      contextStr += `\nResumen del pipeline del usuario: ${JSON.stringify(context.pipelineSummary)}`;
    }

    const systemMessage = {
      role: 'system',
      content: SYSTEM_PROMPT + contextStr,
    };

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [systemMessage, ...(messages || [])],
      max_tokens: 800,
      temperature: 0.7,
    });

    const reply = response.choices[0]?.message?.content || 'No pude generar una respuesta.';
    res.json({ success: true, data: { reply, usage: response.usage } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/copilot/suggestions - get context-aware suggestions
// Suggestions: cache 2 min por usuario (evita re-llamar a OpenAI en cada render)
router.get('/suggestions', auth,
  cacheMiddleware(TTL.LIVE, req => `copilot:suggestions:${req.user.id}`),
  async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.user.role === 'executive') filter.assignedTo = req.user._id;

    const [staleLeads, hotLeads, totalLeads] = await Promise.all([
      Lead.find({ ...filter, daysSinceLastContact: { $gte: 7 }, stage: { $nin: ['closed_won', 'closed_lost'] } }).limit(3).select('company stage daysSinceLastContact'),
      Lead.find({ ...filter, score: { $gte: 75 }, stage: { $nin: ['closed_won', 'closed_lost'] } }).limit(3).select('company stage score value'),
      Lead.countDocuments(filter),
    ]);

    const suggestions = [
      ...staleLeads.map(l => ({
        type: 'warning',
        icon: '⏰',
        text: `${l.company} lleva ${l.daysSinceLastContact} días sin contacto`,
        action: 'Redactar follow-up',
        prompt: `Redacta un mensaje de seguimiento para ${l.company} que está en etapa ${l.stage} y lleva ${l.daysSinceLastContact} días sin contacto. Somos ACON Internacional, empresa de freight forwarding.`,
      })),
      ...hotLeads.map(l => ({
        type: 'hot',
        icon: '🔥',
        text: `${l.company} tiene score ${l.score} — lista para cerrar`,
        action: 'Propuesta de cierre',
        prompt: `Redacta una propuesta de cierre para ${l.company} con valor estimado $${l.value || 0} USD, etapa ${l.stage}. Incluye urgencia y valor diferencial de ACON Internacional.`,
      })),
      { type: 'info', icon: '📊', text: `Tienes ${totalLeads} leads activos en el pipeline`, action: 'Analizar pipeline', prompt: 'Analiza mi pipeline de ventas y dame las 3 acciones más importantes que debo tomar esta semana para maximizar mis cierres.' },
    ];

    res.json({ success: true, data: suggestions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
