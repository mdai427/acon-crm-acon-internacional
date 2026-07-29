// ============================================
// Etapas del pipeline — lectura, caché y validación
// ============================================
//
// Las etapas se consultan en cada movimiento de lead, en el kanban y en varios
// reportes, así que se mantienen en memoria y se refrescan cuando cambian desde
// el panel. La caché es por proceso: al guardar se invalida explícitamente.

const PipelineStage = require('../models/PipelineStage');
const { DEFAULT_STAGES } = require('../models/PipelineStage');

let cache = null;

const invalidate = () => { cache = null; };

/**
 * Todas las etapas activas, ordenadas. Siembra las de fábrica la primera vez.
 * @returns {Promise<Array>}
 */
async function getStages() {
  if (cache) return cache;

  let stages = await PipelineStage.find({ isActive: true }).sort({ order: 1 }).lean();
  if (!stages.length) {
    await PipelineStage.insertMany(DEFAULT_STAGES);
    stages = await PipelineStage.find({ isActive: true }).sort({ order: 1 }).lean();
    console.log(`📊 Pipeline: ${stages.length} etapas iniciales creadas`);
  } else if (stages.some(s => s.emoji === undefined)) {
    // Instalación sembrada antes de que existiera el emoji: se completa una vez
    // con los de fábrica y las etapas propias quedan sin emoji hasta editarlas.
    for (const d of DEFAULT_STAGES) {
      await PipelineStage.updateOne({ key: d.key, emoji: { $exists: false } }, { emoji: d.emoji });
    }
    await PipelineStage.updateMany({ emoji: { $exists: false } }, { emoji: '' });
    stages = await PipelineStage.find({ isActive: true }).sort({ order: 1 }).lean();
  }

  cache = stages;
  return stages;
}

const keys = async () => (await getStages()).map(s => s.key);

const exists = async (key) => (await keys()).includes(key);

// Etiquetas legibles: { new: 'Nuevos', ... }
async function labels() {
  const stages = await getStages();
  return Object.fromEntries(stages.map(s => [s.key, s.label]));
}

// Etapas de cierre, para el código que necesita saber si un lead está ganado o
// perdido sin depender de las claves 'closed_won' / 'closed_lost'.
async function keysByType(type) {
  const stages = await getStages();
  return stages.filter(s => s.type === type).map(s => s.key);
}

// Primera etapa del tablero: la que reciben los leads nuevos.
async function firstKey() {
  const stages = await getStages();
  return stages[0]?.key || 'new';
}

/**
 * Convierte un texto libre en una clave utilizable: minúsculas, sin acentos y
 * con guiones bajos. La clave es lo que se guarda en cada lead, así que debe
 * ser estable y sin caracteres raros.
 */
function slugify(text) {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

// Clave libre a partir de una etiqueta, evitando choques con las existentes.
async function buildKey(label) {
  const base = slugify(label) || 'etapa';
  const usadas = new Set(await PipelineStage.distinct('key'));
  if (!usadas.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidata = `${base}_${i}`;
    if (!usadas.has(candidata)) return candidata;
  }
  return `${base}_${Date.now()}`;
}

module.exports = {
  getStages, keys, exists, labels, keysByType, firstKey,
  slugify, buildKey, invalidate,
};
