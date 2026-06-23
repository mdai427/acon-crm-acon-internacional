/**
 * companyResearch.js
 * Investigación automática de empresas con IA (GPT-4o)
 * Al llegar un lead, investiga: giro, embarques, países, mercancía, tamaño, potencial
 */

const OpenAI = require('openai');

async function researchCompany(lead) {
  if (!process.env.OPENAI_API_KEY) {
    return getFallbackResearch(lead);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `Eres un experto en logística internacional y comercio exterior.
Investiga la siguiente empresa y genera un reporte ejecutivo en español para un ejecutivo de ventas de logística.

Empresa: ${lead.company}
País: ${lead.country || 'México'}
Sitio web: ${lead.website || 'No disponible'}
Servicios de interés: ${(lead.services || []).join(', ') || 'No especificado'}

Genera un JSON con esta estructura exacta (solo JSON, sin markdown):
{
  "giro": "descripción del giro comercial en 1-2 líneas",
  "tamano": "Micro / Pequeña / Mediana / Grande / Corporativo",
  "tipoMercancia": ["tipo1", "tipo2"],
  "paisesOperacion": ["país1", "país2"],
  "embarquesEstimados": "estimado mensual ej: 2-5 contenedores/mes",
  "rutasPrincipales": ["ruta1", "ruta2"],
  "potencialLogistico": "Alto / Medio / Bajo",
  "scoreEmpresa": 75,
  "oportunidades": ["oportunidad1", "oportunidad2"],
  "riesgos": ["riesgo1"],
  "recomendacion": "recomendación de acercamiento en 2-3 líneas para el ejecutivo de ventas",
  "fuentesDatos": "Análisis basado en nombre de empresa, país e industria"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 800,
    });

    const text = response.choices[0].message.content.trim();
    const json = text.replace(/```json|```/g, '').trim();
    return JSON.parse(json);
  } catch (err) {
    console.error('Company research error:', err.message);
    return getFallbackResearch(lead);
  }
}

function getFallbackResearch(lead) {
  return {
    giro: `Empresa dedicada a actividades comerciales en ${lead.country || 'México'}`,
    tamano: 'Por determinar',
    tipoMercancia: ['General'],
    paisesOperacion: [lead.country || 'México'],
    embarquesEstimados: 'Por determinar',
    rutasPrincipales: [],
    potencialLogistico: 'Medio',
    scoreEmpresa: 50,
    oportunidades: ['Ofrecer cotización inicial', 'Agendar reunión de diagnóstico'],
    riesgos: ['Información limitada disponible'],
    recomendacion: 'Solicitar una llamada de diagnóstico para entender sus necesidades logísticas actuales y volumen de operaciones.',
    fuentesDatos: 'Análisis basado en datos del CRM (sin API key de OpenAI)',
  };
}

module.exports = { researchCompany };
