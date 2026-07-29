import React, { useCallback, useEffect, useState } from 'react';
import { Sparkles, RefreshCw, Lock, CalendarDays } from 'lucide-react';
import { getAiUsageSummary, getAiUsagePeriods, getAiUsageDetail } from '../services/api';

// Consumo de IA que se le factura al CRM. Cada fila es una llamada real a la IA:
// qué herramienta la pidió, cuándo, quién y cuánto costó.

const money = (usd) => `$${(Number(usd) || 0).toFixed(Math.abs(Number(usd)) < 1 ? 4 : 2)}`;

const periodLabel = (period) => {
  const [year, month] = String(period).split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  const text = date.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const formatDate = (iso) => new Date(iso).toLocaleString('es-MX', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
});

const consumption = (item) => item.kind === 'audio'
  ? `${Math.round(item.audioSeconds || 0)} s de audio`
  : `${(item.inputTokens || 0) + (item.outputTokens || 0)} tokens`;

function StatCard({ label, value, hint }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 190 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: .4 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginTop: 6 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

export default function AiUsagePage({ toast }) {
  const [periods, setPeriods] = useState([]);
  const [period, setPeriod] = useState(null);
  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (target) => {
    setLoading(true);
    try {
      const [sRes, dRes] = await Promise.all([
        getAiUsageSummary(target),
        getAiUsageDetail({ period: target, limit: 200 }),
      ]);
      setSummary(sRes.data.data);
      setItems(dRes.data.data || []);
      setTotal(dRes.data.meta?.total || 0);
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudo cargar el consumo de IA', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    (async () => {
      try {
        const r = await getAiUsagePeriods();
        const list = r.data.data || [];
        setPeriods(list);
        const first = list[0]?.period;
        setPeriod(first);
        if (first) await load(first);
        else setLoading(false);
      } catch {
        setLoading(false);
      }
    })();
  }, [load]);

  const changePeriod = (value) => {
    setPeriod(value);
    load(value);
  };

  if (loading && !summary) return <div className="loading"><div className="spinner" />Cargando consumo de IA…</div>;

  const isClosed = summary?.status === 'closed';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Consumo de IA</div>
          <div className="page-sub">Lo que el CRM consume en inteligencia artificial, herramienta por herramienta</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="form-select" value={period || ''} onChange={e => changePeriod(e.target.value)}
            style={{ width: 'auto', minWidth: 170 }}>
            {periods.map(p => (
              <option key={p.period} value={p.period}>
                {periodLabel(p.period)}{p.status === 'closed' ? ' (cerrado)' : ''}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => load(period)}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <RefreshCw size={13} /> Actualizar
          </button>
        </div>
      </div>

      {/* Totales del periodo */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <StatCard
          label={isClosed ? 'Total facturado' : 'Total a pagar'}
          value={money(summary?.amountUsd)}
          hint={isClosed
            ? `Periodo cerrado el ${summary.closedAt ? formatDate(summary.closedAt) : '—'}`
            : 'Periodo en curso — sigue sumando'}
        />
        <StatCard label="Llamadas a la IA" value={summary?.calls ?? 0} />
        <StatCard
          label="Tokens procesados"
          value={((summary?.inputTokens || 0) + (summary?.outputTokens || 0)).toLocaleString('es-MX')}
          hint={summary?.audioSeconds ? `+ ${Math.round(summary.audioSeconds / 60)} min de audio` : undefined}
        />
      </div>

      {isClosed && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '11px 14px', marginBottom: 18,
          borderRadius: 10, background: 'var(--gray-50)', border: '1px solid var(--border)',
        }}>
          <Lock size={15} color="var(--text3)" />
          <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>
            Este periodo está cerrado: los importes ya no cambian aunque después se ajusten tarifas.
          </div>
        </div>
      )}

      {/* Desglose por herramienta */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 12 }}>
          <Sparkles size={15} color="var(--orange)" /> Gasto por herramienta
        </div>
        {!summary?.byFeature?.length ? (
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Sin consumo registrado en este periodo.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {summary.byFeature.map(f => {
              const share = summary.amountUsd ? (f.amountUsd / summary.amountUsd) * 100 : 0;
              return (
                <div key={f.feature}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{f.featureLabel}</span>
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>{f.calls} usos</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text)' }}>{money(f.amountUsd)}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: 'var(--gray-100)', marginTop: 5 }}>
                    <div style={{ width: `${share}%`, height: '100%', borderRadius: 3, background: 'var(--orange)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detalle de cada uso */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 12 }}>
          <CalendarDays size={15} color="var(--text3)" /> Detalle de usos
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text3)' }}>
            {items.length} de {total}
          </span>
        </div>

        {!items.length ? (
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Todavía no hay usos de IA en este periodo.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text3)' }}>
                  <th style={{ padding: '8px 10px', fontWeight: 600 }}>Fecha</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600 }}>Herramienta</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600 }}>Usuario</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600 }}>Lead</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600 }}>Consumo</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item._id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{formatDate(item.createdAt)}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text)', fontWeight: 600 }}>{item.featureLabel}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text2)' }}>{item.user?.name || '—'}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text2)' }}>{item.lead?.company || '—'}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                      {consumption(item)} · {item.model}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {money(item.amountUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
