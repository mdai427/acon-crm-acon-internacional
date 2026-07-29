import React, { useCallback, useEffect, useState } from 'react';
import { Lock, Unlock, RefreshCw } from 'lucide-react';
import { getSuperPeriods, closeSuperPeriod, reopenSuperPeriod } from '../services/api';
import { money, periodLabel, formatDateTime } from './format';

// Cierre mensual: al cerrar un periodo sus totales quedan congelados y el CRM
// los ve como lo facturado de ese mes, aunque después cambien las tarifas.

export default function PeriodsTab({ toast }) {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getSuperPeriods();
      setPeriods(r.data.data || []);
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudieron cargar los periodos', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleClose = async (period) => {
    if (!window.confirm(
      `¿Cerrar ${periodLabel(period)}? Los importes quedarán congelados y es lo que se le factura al CRM.`
    )) return;
    setWorking(period);
    try {
      const r = await closeSuperPeriod(period);
      toast(r.data.message, 'success');
      await load();
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudo cerrar', 'error');
    } finally {
      setWorking(null);
    }
  };

  const handleReopen = async (period) => {
    if (!window.confirm(`¿Reabrir ${periodLabel(period)}? Los totales volverán a calcularse en vivo.`)) return;
    setWorking(period);
    try {
      const r = await reopenSuperPeriod(period);
      toast(r.data.message, 'success');
      await load();
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudo reabrir', 'error');
    } finally {
      setWorking(null);
    }
  };

  if (loading) return <div className="sa-loading">Cargando periodos…</div>;

  return (
    <div className="sa-page">
      <div className="sa-page-head">
        <div>
          <h1>Periodos de facturación</h1>
          <p>Un periodo por mes. Al cerrarlo se congela lo que el CRM debe pagar por ese mes.</p>
        </div>
        <button className="sa-btn ghost" onClick={load}>
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      <div className="sa-card">
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Periodo</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Usos</th>
                <th style={{ textAlign: 'right' }}>Costo</th>
                <th style={{ textAlign: 'right' }}>Facturado</th>
                <th style={{ textAlign: 'right' }}>Ganancia</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {periods.map(p => (
                <tr key={p.period}>
                  <td>
                    <strong>{periodLabel(p.period)}</strong>
                    {p.closedAt && <div className="sa-sub">Cerrado el {formatDateTime(p.closedAt)}</div>}
                  </td>
                  <td>
                    <span className={`sa-pill${p.status === 'closed' ? ' closed' : ''}`}>
                      {p.status === 'closed' ? 'Cerrado' : 'Abierto'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{p.totals.calls}</td>
                  <td style={{ textAlign: 'right' }}>{money(p.totals.costUsd)}</td>
                  <td style={{ textAlign: 'right' }}>{money(p.totals.priceUsd)}</td>
                  <td style={{ textAlign: 'right' }}><strong>{money(p.totals.marginUsd)}</strong></td>
                  <td style={{ textAlign: 'right' }}>
                    {p.status === 'closed' ? (
                      <button className="sa-btn ghost sm" disabled={working === p.period}
                        onClick={() => handleReopen(p.period)}>
                        <Unlock size={13} /> Reabrir
                      </button>
                    ) : (
                      <button className="sa-btn sm" disabled={working === p.period}
                        onClick={() => handleClose(p.period)}>
                        <Lock size={13} /> Cerrar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
