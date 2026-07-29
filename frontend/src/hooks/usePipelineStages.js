import { useEffect, useState } from 'react';
import { getPipelineStages } from '../services/api';

// Etapas del pipeline, que ahora son configurables. Se cachean en memoria del
// módulo porque cambian muy poco y varias pantallas las piden a la vez.
let cache = null;
let inFlight = null;

// Respaldo por si la petición falla: mejor mostrar las etapas de fábrica que
// dejar un selector vacío.
const FALLBACK = [
  { key: 'new',         label: 'Nuevos',      color: '#6366F1', type: 'open' },
  { key: 'contacted',   label: 'Contactados', color: '#3B82F6', type: 'open' },
  { key: 'qualified',   label: 'Calificados', color: '#F59E0B', type: 'open' },
  { key: 'proposal',    label: 'Propuesta',   color: '#F97316', type: 'open' },
  { key: 'negotiation', label: 'Negociación', color: '#8B5CF6', type: 'open' },
  { key: 'closed_won',  label: 'Ganado',      color: '#16A34A', type: 'won' },
  { key: 'closed_lost', label: 'Perdido',     color: '#DC2626', type: 'lost' },
];

async function fetchStages() {
  if (cache) return cache;
  if (!inFlight) {
    inFlight = getPipelineStages()
      .then(r => { cache = r.data.data || FALLBACK; return cache; })
      .catch(() => FALLBACK)
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

// Fuerza la próxima lectura a ir al servidor (tras editar las etapas).
export const invalidateStages = () => { cache = null; };

/**
 * @returns {{stages: Array, labels: Object, labelFor: Function, loading: boolean}}
 */
export function usePipelineStages() {
  const [stages, setStages] = useState(cache || FALLBACK);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let vivo = true;
    fetchStages().then(list => {
      if (!vivo) return;
      setStages(list);
      setLoading(false);
    });
    return () => { vivo = false; };
  }, []);

  const labels = Object.fromEntries(stages.map(s => [s.key, s.label]));
  // Una etapa borrada puede seguir en algún lead viejo: se muestra su clave en
  // lugar de dejar la celda vacía.
  const labelFor = (key) => labels[key] || key;

  return { stages, labels, labelFor, loading };
}
