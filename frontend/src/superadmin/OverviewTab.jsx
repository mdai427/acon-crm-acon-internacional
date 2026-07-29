import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, TrendingUp, AlertTriangle } from 'lucide-react';
import { getSuperOverview, getSuperPeriods } from '../services/api';
import { money, percent, periodLabel, formatDateTime } from './format';

// Métricas de la reventa de IA: costo real del proveedor, precio facturado al
// CRM y la ganancia que queda en medio.

function Metric({ label, value, hint, tone }) {
  return (
    <div className={`sa-card sa-metric${tone ? ` tone-${tone}` : ''}`}>
      <div className="sa-metric-label">{label}</div>
      <div className="sa-metric-value">{value}</div>
      {hint && <div className="sa-metric-hint">{hint}</div>}
    </div>
  );
}

function Table({ columns, rows, empty }) {
  if (!rows.length) return <div className="sa-empty">{empty}</div>;
  return (
    <div className="sa-table-wrap">
      <table className="sa-table">
        <thead>
          <tr>{columns.map(c => (
            <th key={c.key} style={{ textAlign: c.align || 'left' }}>{c.label}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.key || i}>
              {columns.map(c => (
                <td key={c.key} style={{ textAlign: c.align || 'left' }}>{c.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OverviewTab({ toast }) {
  const [periods, setPeriods] = useState([]);
  const [period, setPeriod] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (target) => {
    setLoading(true);
    try {
      const r = await getSuperOverview(target);
      setData(r.data.data);
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudieron cargar las métricas', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    (async () => {
      try {
        const r = await getSuperPeriods();
        const list = r.data.data || [];
        setPeriods(list);
        const first = list[0]?.period;
        setPeriod(first);
        await load(first);
      } catch {
        await load();
      }
    })();
  }, [load]);

  if (loading && !data) return <div className="sa-loading">Cargando métricas…</div>;

  const t = data?.totals || {};
  const marginRate = t.costUsd ? (t.marginUsd / t.costUsd) * 100 : 0;

  return (
    <div className="sa-page">
      <div className="sa-page-head">
        <div>
          <h1>Métricas de consumo de IA</h1>
          <p>Costo real del proveedor, precio facturado al CRM y ganancia del periodo.</p>
        </div>
        <div className="sa-head-actions">
          <select value={period || ''} onChange={e => { setPeriod(e.target.value); load(e.target.value); }}>
            {periods.map(p => (
              <option key={p.period} value={p.period}>
                {periodLabel(p.period)}{p.status === 'closed' ? ' (cerrado)' : ''}
              </option>
            ))}
          </select>
          <button className="sa-btn ghost" onClick={() => load(period)}>
            <RefreshCw size={13} /> Actualizar
          </button>
        </div>
      </div>

      <div className="sa-metrics">
        <Metric label="Costo real (proveedor)" value={money(t.costUsd)} hint={`${t.calls || 0} llamadas`} />
        <Metric label="Facturado al CRM" value={money(t.priceUsd)} hint={`Margen aplicado: ${percent(data?.defaultMarginPct)} por defecto`} />
        <Metric label="Ganancia del periodo" value={money(t.marginUsd)} hint={`${percent(marginRate)} sobre el costo`} tone="profit" />
        <Metric
          label="Acumulado histórico"
          value={money(data?.allTime?.marginUsd)}
          hint={`Facturado ${money(data?.allTime?.priceUsd)} · costo ${money(data?.allTime?.costUsd)}`}
        />
      </div>

      {!!data?.errors && (
        <div className="sa-warn">
          <AlertTriangle size={15} />
          {data.errors} llamada(s) con error en este periodo. No se facturan, pero conviene revisarlas
          (cuota agotada, modelo inválido o clave caducada).
        </div>
      )}

      <div className="sa-card">
        <h2><TrendingUp size={15} /> Por herramienta del CRM</h2>
        <Table
          empty="Sin consumo en este periodo."
          rows={(data?.byFeature || []).map(f => ({ ...f, key: f.feature }))}
          columns={[
            { key: 'feature', label: 'Herramienta', render: r => r.featureLabel },
            { key: 'calls',   label: 'Usos',        align: 'right', render: r => r.calls },
            { key: 'cost',    label: 'Costo',       align: 'right', render: r => money(r.costUsd) },
            { key: 'price',   label: 'Facturado',   align: 'right', render: r => money(r.priceUsd) },
            { key: 'margin',  label: 'Ganancia',    align: 'right', render: r => <strong>{money(r.marginUsd)}</strong> },
          ]}
        />
      </div>

      <div className="sa-card">
        <h2>Por modelo</h2>
        <Table
          empty="Sin consumo en este periodo."
          rows={(data?.byModel || []).map(m => ({ ...m, key: m.model }))}
          columns={[
            { key: 'model',  label: 'Modelo',    render: r => r.model },
            { key: 'calls',  label: 'Llamadas',  align: 'right', render: r => r.calls },
            { key: 'cost',   label: 'Costo',     align: 'right', render: r => money(r.costUsd) },
            { key: 'price',  label: 'Facturado', align: 'right', render: r => money(r.priceUsd) },
            { key: 'margin', label: 'Ganancia',  align: 'right', render: r => <strong>{money(r.marginUsd)}</strong> },
          ]}
        />
      </div>

      <div className="sa-card">
        <h2>Por usuario del CRM</h2>
        <Table
          empty="Sin consumo atribuible a usuarios."
          rows={(data?.byUser || []).map((u, i) => ({ ...u, key: i }))}
          columns={[
            { key: 'user',  label: 'Usuario',   render: r => r.user?.name || '—' },
            { key: 'calls', label: 'Usos',      align: 'right', render: r => r.calls },
            { key: 'cost',  label: 'Costo',     align: 'right', render: r => money(r.costUsd) },
            { key: 'price', label: 'Facturado', align: 'right', render: r => money(r.priceUsd) },
          ]}
        />
      </div>

      {data?.status === 'closed' && (
        <div className="sa-note">
          Periodo cerrado el {formatDateTime(data.closedAt)}. Los importes están congelados.
        </div>
      )}
    </div>
  );
}
