import React, { useEffect, useState } from 'react';
import { Plus, Save, Trash2, Info } from 'lucide-react';
import { getSuperPricing, saveSuperPricing } from '../services/api';
import { money } from './format';

// Configuración de la reventa: cuánto cuesta cada modelo y qué margen se le
// suma antes de facturárselo al CRM.

const EMPTY_MODEL = {
  provider: 'openai', model: '', kind: 'chat',
  inputPer1M: 0, outputPer1M: 0, perMinute: 0, marginPct: '', priceSource: 'manual',
};

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'openrouter', name: 'OpenRouter' },
  { id: 'deepseek', name: 'DeepSeek' },
];

// Ejemplo de referencia para que se entienda qué se está cobrando.
const EXAMPLE_TOKENS = { input: 500_000, output: 150_000 };

export default function PricingTab({ toast }) {
  const [config, setConfig] = useState(null);
  const [margin, setMargin] = useState(40);
  const [models, setModels] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await getSuperPricing();
        const data = r.data.data;
        setConfig(data);
        setMargin(data.defaultMarginPct);
        setModels((data.models || []).map(m => ({ ...m, marginPct: m.marginPct ?? '' })));
      } catch (err) {
        toast(err.response?.data?.message || 'No se pudieron cargar las tarifas', 'error');
      }
    })();
  }, [toast]);

  // Tocar un precio a mano lo marca como manual: a partir de ahí la
  // sincronización con OpenRouter respeta ese valor.
  const PRICE_FIELDS = ['inputPer1M', 'outputPer1M', 'perMinute'];
  const setModelField = (index, field, value) => {
    setModels(list => list.map((m, i) => {
      if (i !== index) return m;
      const next = { ...m, [field]: value };
      if (PRICE_FIELDS.includes(field)) next.priceSource = 'manual';
      return next;
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await saveSuperPricing({ defaultMarginPct: Number(margin), models });
      setConfig(r.data.data);
      toast('Tarifas y margen guardados', 'success');
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudo guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!config) return <div className="sa-loading">Cargando tarifas…</div>;

  // Cálculo de ejemplo con el primer modelo de chat configurado.
  const sample = models.find(m => m.kind === 'chat');
  const sampleCost = sample
    ? (EXAMPLE_TOKENS.input / 1e6) * Number(sample.inputPer1M || 0)
      + (EXAMPLE_TOKENS.output / 1e6) * Number(sample.outputPer1M || 0)
    : 0;
  const sampleMargin = sample?.marginPct === '' || sample?.marginPct === null || sample?.marginPct === undefined
    ? Number(margin)
    : Number(sample.marginPct);
  const samplePrice = sampleCost * (1 + sampleMargin / 100);

  return (
    <div className="sa-page">
      <div className="sa-page-head">
        <div>
          <h1>Tarifas y margen de reventa</h1>
          <p>El CRM paga el costo del proveedor más el margen que definas aquí.</p>
        </div>
        <button className="sa-btn" onClick={handleSave} disabled={saving}>
          <Save size={14} /> {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>

      <div className="sa-card">
        <h2>Margen por defecto</h2>
        <div className="sa-margin-row">
          <input
            type="number" min="0" max="1000" step="1"
            value={margin}
            onChange={e => setMargin(e.target.value)}
          />
          <span className="sa-margin-unit">% sobre el costo real</span>
        </div>
        <div className="sa-hint">
          <Info size={13} />
          Se aplica a todos los modelos que no tengan un margen propio. Con {margin}%, un consumo
          que te cuesta $1.00 se le factura al CRM en {money(1 * (1 + Number(margin) / 100))}.
        </div>
      </div>

      <div className="sa-card">
        <h2>Precios por modelo</h2>
        <p className="sa-card-sub">
          Precios de costo del proveedor: por millón de tokens en los modelos de chat, por minuto en
          los de audio. Revísalos cuando el proveedor cambie su lista.
        </p>

        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Modelo</th>
                <th>Tipo</th>
                <th style={{ textAlign: 'right' }}>Entrada /1M</th>
                <th style={{ textAlign: 'right' }}>Salida /1M</th>
                <th style={{ textAlign: 'right' }}>Por minuto</th>
                <th style={{ textAlign: 'right' }}>Margen propio</th>
                <th>Precio</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {models.map((m, i) => (
                <tr key={i}>
                  <td>
                    <select value={m.provider || 'openai'} onChange={e => setModelField(i, 'provider', e.target.value)}>
                      {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <input value={m.model} placeholder="gpt-4o-mini"
                      onChange={e => setModelField(i, 'model', e.target.value)} />
                  </td>
                  <td>
                    <select value={m.kind} onChange={e => setModelField(i, 'kind', e.target.value)}>
                      <option value="chat">Chat (tokens)</option>
                      <option value="audio">Audio (minutos)</option>
                    </select>
                  </td>
                  <td>
                    <input type="number" step="0.01" min="0" value={m.inputPer1M} disabled={m.kind === 'audio'}
                      onChange={e => setModelField(i, 'inputPer1M', e.target.value)} />
                  </td>
                  <td>
                    <input type="number" step="0.01" min="0" value={m.outputPer1M} disabled={m.kind === 'audio'}
                      onChange={e => setModelField(i, 'outputPer1M', e.target.value)} />
                  </td>
                  <td>
                    <input type="number" step="0.001" min="0" value={m.perMinute} disabled={m.kind === 'chat'}
                      onChange={e => setModelField(i, 'perMinute', e.target.value)} />
                  </td>
                  <td>
                    <input type="number" step="1" min="0" value={m.marginPct} placeholder={`${margin} (global)`}
                      onChange={e => setModelField(i, 'marginPct', e.target.value)} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`sa-pill${m.priceSource === 'manual' ? ' closed' : ''}`}
                      title={m.priceSource === 'manual'
                        ? 'Fijado a mano: la sincronización no lo toca. Clic para volver a automático.'
                        : 'Se actualiza desde OpenRouter'}
                      onClick={() => setModels(list => list.map((x, idx) =>
                        idx === i ? { ...x, priceSource: x.priceSource === 'manual' ? 'auto' : 'manual' } : x))}
                      style={{ cursor: 'pointer', border: 'none', font: 'inherit' }}
                    >
                      {m.priceSource === 'manual' ? 'Manual' : 'Automático'}
                    </button>
                  </td>
                  <td>
                    <button className="sa-icon-btn danger" title="Quitar modelo"
                      onClick={() => setModels(list => list.filter((_, idx) => idx !== i))}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button className="sa-btn ghost" style={{ marginTop: 12 }}
          onClick={() => setModels(list => [...list, { ...EMPTY_MODEL }])}>
          <Plus size={14} /> Añadir modelo
        </button>

        <div className="sa-hint" style={{ marginTop: 14 }}>
          <Info size={13} />
          Los precios marcados como automáticos se bajan del catálogo de OpenRouter desde
          “Proveedores y agentes”. Un modelo que la IA use y no esté en esta lista se registra
          igual, pero con costo cero hasta que le pongas tarifa.
        </div>
      </div>

      {sample && (
        <div className="sa-card">
          <h2>Ejemplo con {sample.model}</h2>
          <div className="sa-example">
            <div>
              <span>Consumo</span>
              <strong>{EXAMPLE_TOKENS.input.toLocaleString('es-MX')} tokens de entrada + {EXAMPLE_TOKENS.output.toLocaleString('es-MX')} de salida</strong>
            </div>
            <div><span>Te cuesta</span><strong>{money(sampleCost)}</strong></div>
            <div><span>Margen aplicado</span><strong>{sampleMargin}%</strong></div>
            <div className="highlight"><span>Se le factura al CRM</span><strong>{money(samplePrice)}</strong></div>
            <div><span>Tu ganancia</span><strong>{money(samplePrice - sampleCost)}</strong></div>
          </div>
        </div>
      )}
    </div>
  );
}
