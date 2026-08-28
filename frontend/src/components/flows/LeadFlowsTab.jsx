import React, { useCallback, useEffect, useState } from 'react';
import { Zap, Plus, XCircle, SkipForward } from 'lucide-react';
import { getLeadFlowRuns, getFlows, enrollLeadInFlow, cancelFlowRun, skipFlowRunWait } from '../../services/api';

const RUN_LABEL = { running: 'En curso', waiting: 'Esperando', completed: 'Terminó', exited: 'Salió', failed: 'Falló', paused: 'Pausado' };
const STEP_LABEL = { ok: 'ok', skipped: 'omitido', failed: 'falló', degraded: 'degradado', postponed: 'pospuesto', waiting: 'esperando', resumed: 'reanudado' };
const ACTIVE = new Set(['running', 'waiting', 'paused']);
const errMsg = (e, fb) => e?.response?.data?.message || fb;

export default function LeadFlowsTab({ lead, toast }) {
  const [runs, setRuns] = useState(null);
  const [flows, setFlows] = useState([]);
  const [pick, setPick] = useState('');
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    getLeadFlowRuns(lead._id).then(r => setRuns(r.data.data || [])).catch(() => setRuns([]));
  }, [lead._id]);
  useEffect(() => { load(); getFlows().then(r => setFlows((r.data.data || []).filter(f => f.isActive && f.settings?.allowManualEnroll))).catch(() => {}); }, [load]);

  const enroll = async () => {
    if (!pick) return;
    try { const r = await enrollLeadInFlow(pick, lead._id); toast?.(r.data.message || 'Listo', 'success'); setPick(''); load(); }
    catch (e) { toast?.(errMsg(e, 'No se pudo meter al flujo'), 'error'); }
  };
  const cancel = async (run) => {
    if (!window.confirm('¿Sacar al lead de este flujo?')) return;
    try { await cancelFlowRun(run._id); toast?.('Ejecución cancelada', 'success'); load(); }
    catch (e) { toast?.(errMsg(e, 'No se pudo cancelar'), 'error'); }
  };
  const skip = async (run) => {
    try { await skipFlowRunWait(run._id); toast?.('Espera saltada', 'success'); load(); }
    catch (e) { toast?.(errMsg(e, 'No se pudo saltar'), 'error'); }
  };

  return (
    <div>
      <div className="fl-enroll">
        <select className="form-input" value={pick} onChange={e => setPick(e.target.value)}>
          <option value="">Meter en un flujo…</option>
          {flows.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
        </select>
        <button className="btn btn-navy btn-sm" disabled={!pick} onClick={enroll}><Plus size={13} /> Inscribir</button>
      </div>
      {!runs ? <div className="spinner" /> : runs.length === 0 ? (
        <div className="empty-state"><Zap size={28} /><p>Este lead no ha pasado por ningún flujo.</p></div>
      ) : runs.map(r => (
        <div key={r._id} className="card card-sm fl-run" style={{ marginBottom: 10 }}>
          <div className="fl-run-head" style={{ cursor: 'pointer' }} onClick={() => setOpen(open === r._id ? null : r._id)}>
            <strong>{r.flow?.name || 'Flujo'}</strong>
            <span className={`badge fl-run-${r.status}`}>{RUN_LABEL[r.status] || r.status}</span>
          </div>
          <div className="fl-muted">
            {new Date(r.createdAt).toLocaleString('es-MX')}
            {r.status === 'waiting' && r.nextRunAt && ` · sigue el ${new Date(r.nextRunAt).toLocaleString('es-MX')}`}
            {r.status === 'waiting' && r.waitingFor?.kind === 'event' && ` · esperando ${r.waitingFor.event}`}
            {r.exitReason && ` · ${r.exitReason}`}
          </div>
          {ACTIVE.has(r.status) && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {r.status === 'waiting' && <button className="btn btn-ghost btn-sm" onClick={() => skip(r)}><SkipForward size={12} /> Saltar espera</button>}
              <button className="btn btn-danger btn-sm" onClick={() => cancel(r)}><XCircle size={12} /> Sacar del flujo</button>
            </div>
          )}
          {open === r._id && (
            <ol className="fl-steps" style={{ marginTop: 10 }}>
              {(r.stepLog || []).map((s, i) => (
                <li key={i} className={`fl-step fl-step-${s.result || 'ok'}`}>
                  <div className="fl-step-title">{s.label || s.type} <span className="fl-muted">· {STEP_LABEL[s.result] || s.result} · {new Date(s.at).toLocaleString('es-MX')}</span></div>
                  {s.detail && <div className="fl-muted">{s.detail}</div>}
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </div>
  );
}
