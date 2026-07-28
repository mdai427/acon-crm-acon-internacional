/**
 * DOF Exchange Rate Service
 * Obtiene el tipo de cambio USD/MXN publicado por el Diario Oficial de la Federación.
 * Fuente: API pública de Banxico (tipo de cambio para solventar obligaciones en MXN).
 * Serie SF43718 = Tipo de cambio FIX determinado por Banxico (publicado en DOF).
 */
const axios = require('axios');
const ExchangeRate = require('../models/ExchangeRate');

const BANXICO_TOKEN = process.env.BANXICO_TOKEN || '';
const BANXICO_SERIE = 'SF43718'; // USD MXN FIX

/**
 * Obtiene el tipo de cambio FIX del día actual desde la API de Banxico.
 * Requiere token de Banxico (gratuito en: https://www.banxico.org.mx/SieAPIRest/service/v1/)
 * Si no hay token configurado, intenta un scrape simple del DOF.
 */
async function fetchFromBanxico() {
  if (!BANXICO_TOKEN) throw new Error('BANXICO_TOKEN no configurado');

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
  const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${BANXICO_SERIE}/datos/${dateStr}/${dateStr}`;

  const { data } = await axios.get(url, {
    headers: { 'Bmx-Token': BANXICO_TOKEN },
    timeout: 8000,
  });

  const obs = data?.bmx?.series?.[0]?.datos?.[0];
  if (!obs || obs.dato === 'N/E') throw new Error('Sin dato disponible para hoy en Banxico');

  return { date: obs.fecha.split('/').reverse().join('-'), rate: parseFloat(obs.dato) };
}

/**
 * Fallback: scrape del tipo de cambio desde el endpoint público del DOF.
 * No requiere token.
 */
async function fetchFromDOFFallback() {
  // El SAT publica el tipo de cambio en un endpoint JSON no oficial pero estable
  const { data } = await axios.get(
    'https://tipodecambio.paginasweb.pro/api',
    { timeout: 6000 }
  );
  if (!data?.precio) throw new Error('Sin dato en fallback DOF');
  const today = new Date().toISOString().split('T')[0];
  return { date: today, rate: parseFloat(data.precio) };
}

/**
 * Obtiene y persiste el tipo de cambio del día.
 * Primero intenta Banxico, luego fallback, luego retorna el último guardado.
 * @returns {Promise<{date: string, rate: number, source: string}>}
 */
async function fetchAndSaveRate() {
  const today = new Date().toISOString().split('T')[0];

  // Si ya tenemos el de hoy, reutilizamos
  const existing = await ExchangeRate.findOne({ date: today });
  if (existing) return { date: existing.date, rate: existing.rate, source: existing.source };

  let result;
  let source = 'dof';

  try {
    result = await fetchFromBanxico();
  } catch {
    try {
      result = await fetchFromDOFFallback();
    } catch {
      // Último recurso: usar el más reciente guardado
      const last = await ExchangeRate.findOne().sort({ date: -1 });
      if (last) {
        console.warn(`[DOF] Sin conexión – usando último tipo de cambio guardado: ${last.rate} (${last.date})`);
        return { date: last.date, rate: last.rate, source: 'cached' };
      }
      // Default de emergencia
      console.warn('[DOF] Sin datos disponibles, usando 17.50 como emergencia');
      return { date: today, rate: 17.50, source: 'default' };
    }
  }

  // Guardar en base de datos
  await ExchangeRate.findOneAndUpdate(
    { date: result.date },
    { rate: result.rate, source },
    { upsert: true, new: true }
  );

  console.log(`✅ Tipo de cambio DOF actualizado: $${result.rate} MXN/USD (${result.date})`);
  return { ...result, source };
}

/**
 * Obtiene el tipo de cambio vigente (del día, o el más reciente).
 */
async function getCurrentRate() {
  const today = new Date().toISOString().split('T')[0];
  let record = await ExchangeRate.findOne({ date: today });
  if (!record) {
    record = await ExchangeRate.findOne().sort({ date: -1 });
  }
  return record ? { date: record.date, rate: record.rate, source: record.source } : { date: today, rate: 17.50, source: 'default' };
}

/**
 * Establece un tipo de cambio manual (sobrescribe el del día).
 */
async function setManualRate(rate, userId) {
  const today = new Date().toISOString().split('T')[0];
  await ExchangeRate.findOneAndUpdate(
    { date: today },
    { rate, source: 'manual', updatedBy: userId },
    { upsert: true, new: true }
  );
  return { date: today, rate, source: 'manual' };
}

/**
 * Historial de tipos de cambio (últimos N días).
 */
async function getRateHistory(days = 30) {
  return ExchangeRate.find().sort({ date: -1 }).limit(days).lean();
}

module.exports = { fetchAndSaveRate, getCurrentRate, setManualRate, getRateHistory };
