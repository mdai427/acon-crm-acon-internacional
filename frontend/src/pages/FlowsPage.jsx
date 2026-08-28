import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, ArrowLeft, Save, Upload, Play, Power, Trash2, Zap, Search, Settings2, FlaskConical, Activity } from 'lucide-react';
import {
  getFlows, getFlow, createFlow, updateFlow, deleteFlow, publishFlow, toggleFlow, simulateFlow, testFlow, getFlowCatalog, getFlowRuns, getLeads,
} from '../services/api';
import FlowCanvas from '../components/flows/FlowCanvas';
import NodeEditor from '../components/flows/NodeEditor';
import { emptyFlow, insertNode, removeNode, updateNode, nodeById, describeTrigger } from '../components/flows/flowUtils';

const STATUS_LABEL = { draft: 'Borrador', published: 'Publicado', archived: 'Archivado' };
const RUN_LABEL = { running: 'En curso', waiting: 'Esperando', completed: 'Terminó', exited: 'Salió', failed: 'Falló', paused: 'Pausado' };
const errMsg = (e, fb) => e?.response?.data?.message || e?.message || fb;

// ─── Lista ──────────────────────────────────────────────────────────
function FlowList({ flows, catalog, loading, onOpen, onCreate, onToggle, onDelete }) {
  const [q, setQ] = useState('');
  const ctx = useMemo(() => ({ stageLabel: k => catalog?.stages.find(s => s.key === k)?.label }), [catalog]);
  const list = flows.filter(f => !q || f.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Flujos de automatización</h1>
          <p className="page-sub">Un solo motor: disparador → pasos → salida. Sustituye a playbooks, reglas, secuencias y automatizaciones.</p>
        </div>
        <button className="btn btn-primary" onClick={onCreate}><Plus size={15} /> Nuevo flujo</button>
      </div>
      <div className="fl-toolbar">
        <div className="fl-search"><Search size={14} /><input placeholder="Buscar flujo…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <span className="fl-muted">{flows.filter(f => f.isActive).length} activos · {flows.length} en total</span>
      </div>
      {loading ? <div className="spinner" /> : list.length === 0 ? (
        <div className="empty-state"><Zap size={32} /><p>Todavía no hay flujos. Crea el primero.</p></div>
      ) : (
        <div className="fl-list">
          {list.map(f => (
            <div key={f._id} className={`card fl-card${f.isActive ? '' : ' is-off'}`} onClick={() => onOpen(f._id)}>
              <div className="fl-card-main">
                <div className="fl-card-name">{f.name}</div>
                <div className="fl-card-trigger">{describeTrigger(f.trigger, ctx)}</div>
                <div className="fl-card-meta">
                  <span className={`badge fl-status-${f.status}`}>{STATUS_LABEL[f.status] || f.status}{f.version ? ` v${f.version}` : ''}</span>
                  {f.status === 'published' && f.hasDraftChanges && <span className="badge badge-source">Cambios sin publicar</span>}
                  {f.stats && <span className="fl-muted">{f.stats.runsTotal || 0} ejecuciones · {f.stats.runsActive || 0} en curso</span>}
                </div>
              </div>
              <div className="fl-card-actions" onClick={e => e.stopPropagation()}>
                <button className={`btn btn-sm ${f.isActive ? 'btn-navy' : 'btn-ghost'}`} disabled={f.status !== 'published'} title={f.status !== 'published' ? 'Publica primero' : (f.isActive ? 'Desactivar' : 'Activar')} onClick={() => onToggle(f)}>
                  <Power size={13} /> {f.isActive ? 'Activo' : 'Inactivo'}
                </button>
                <button className="btn btn-ghost btn-icon" title="Eliminar" onClick={() => onDelete(f)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Ajustes del flujo (modal) ──────────────────────────────────────
function SettingsModal({ flow, onChange, onClose }) {
  const s = flow.settings || {};
  const set = (patch) => onChange({ ...flow, settings: { ...s, ...patch } });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><div className="modal-title">Ajustes del flujo</div><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="form-group"><label className="form-label">Nombre</label><input className="form-input" value={flow.name} onChange={e => onChange({ ...flow, name: e.target.value })} /></div>
        <div className="form-group"><label className="form-label">Descripción</label><textarea className="form-input" rows={2} value={flow.description || ''} onChange={e => onChange({ ...flow, description: e.target.value })} /></div>
        <label className="fl-check"><input type="checkbox" checked={!!s.businessHoursOnly} onChange={e => set({ businessHoursOnly: e.target.checked })} /> Enviar sólo en horario laboral (L–V 9–18, hora de México)</label>
        <label className="fl-check"><input type="checkbox" checked={!!s.allowManualEnroll} onChange={e => set({ allowManualEnroll: e.target.checked })} /> Permitir meter leads a mano desde la ficha</label>
        <label className="fl-check"><input type="checkbox" checked={!!s.allowReentry} onChange={e => set({ allowReentry: e.target.checked })} /> Un lead puede volver a entrar después del cooldown</label>
        <div className="form-group" style={{ marginTop: 10 }}>
          <label className="form-label">Cooldown entre entradas (días)</label>
          <input type="number" min="0" className="form-input" value={s.cooldownDays ?? 30} onChange={e => set({ cooldownDays: Number(e.target.value) })} />
        </div>
        <div className="modal-actions"><button className="btn btn-primary" onClick={onClose}>Listo</button></div>
      </div>
    </div>
  );
}

// ─── Simulador / pruebas ────────────────────────────────────────────
function LeadPicker({ value, onChange }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState([]);
  useEffect(() => {
    const t = setTimeout(() => {
      getLeads({ search: q, limit: 8 }).then(r => setOpts(r.data?.data?.leads || r.data?.data || [])).catch(() => setOpts([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="fl-leadpicker">
      <input className="form-input" placeholder="Buscar lead de prueba…" value={q} onChange={e => setQ(e.target.value)} />
      <div className="fl-leadpicker-list">
        {opts.map(l => (
          <button type="button" key={l._id} className={value === l._id ? 'is-on' : ''} onClick={() => onChange(l._id)}>{l.company} <span className="fl-muted">{l.stage}</span></button>
        ))}
      </div>
    </div>
  );
}

function SimulatePanel({ flowId, onHits, toast, onClose }) {
  const [leadId, setLeadId] = useState('');
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!leadId) return toast?.('Elige un lead de prueba', 'error');
    setBusy(true);
    try {
      const r = await simulateFlow(flowId, { leadId, answers });
      setResult(r.data.data);
      onHits((r.data.data.steps || []).map(s => s.nodeId));
    } catch (e) { toast?.(errMsg(e, 'No se pudo simular'), 'error'); } finally { setBusy(false); }
  };
  const testReal = async () => {
    if (!leadId) return toast?.('Elige un lead de prueba', 'error');
    if (!window.confirm('Esto ejecuta el flujo DE VERDAD sobre ese lead (envíos incluidos). ¿Seguro?')) return;
    try { const r = await testFlow(flowId, leadId); toast?.(r.data.message || 'Ejecución iniciada', 'success'); }
    catch (e) { toast?.(errMsg(e, 'No se pudo iniciar'), 'error'); }
  };
  return (
    <aside className="fl-panel">
      <div className="fl-panel-head"><div><div className="fl-panel-kicker">Probar</div><div className="fl-panel-title">Simulación con un lead</div></div><button className="modal-close" onClick={onClose}>×</button></div>
      <div className="fl-panel-body">
        <LeadPicker value={leadId} onChange={setLeadId} />
        {result?.questions?.length > 0 && (
          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">Supuestos para las esperas por evento</label>
            {result.questions.map(qn => (
              <label key={qn.nodeId} className="fl-check">
                <input type="checkbox" checked={answers[qn.nodeId] !== false} onChange={e => setAnswers({ ...answers, [qn.nodeId]: e.target.checked })} /> {qn.label}
              </label>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-navy btn-sm" disabled={busy} onClick={run}><Play size={13} /> Simular</button>
          <button className="btn btn-ghost btn-sm" onClick={testReal}><FlaskConical size={13} /> Ejecutar de verdad</button>
        </div>
        {result && (
          <ol className="fl-steps">
            {(result.steps || []).map((s, i) => (
              <li key={i} className={`fl-step fl-step-${s.result || 'ok'}`}>
                <div className="fl-step-title">{s.label || s.type}{s.handle && s.handle !== 'next' ? <span className="fl-muted"> → {s.handle}</span> : null}</div>
                {s.preview && <div className="fl-step-preview">{typeof s.preview === 'string' ? s.preview : JSON.stringify(s.preview)}</div>}
                {s.detail && <div className="fl-muted">{s.detail}</div>}
              </li>
            ))}
            {result.exitReason && <li className="fl-step"><div className="fl-muted">{result.exitReason}</div></li>}
          </ol>
        )}
      </div>
    </aside>
  );
}

function RunsPanel({ flowId, onClose }) {
  const [runs, setRuns] = useState(null);
  useEffect(() => { getFlowRuns(flowId, { limit: 50 }).then(r => setRuns(r.data.data)).catch(() => setRuns([])); }, [flowId]);
  return (
    <aside className="fl-panel">
      <div className="fl-panel-head"><div><div className="fl-panel-kicker">Ejecuciones</div><div className="fl-panel-title">Últimas 50</div></div><button className="modal-close" onClick={onClose}>×</button></div>
      <div className="fl-panel-body">
        {!runs ? <div className="spinner" /> : runs.length === 0 ? <div className="fl-muted">Ningún lead ha pasado por aquí todavía.</div> : runs.map(r => (
          <div key={r._id} className="fl-run">
            <div className="fl-run-head"><strong>{r.lead?.company || '—'}</strong><span className={`badge fl-run-${r.status}`}>{RUN_LABEL[r.status] || r.status}</span></div>
            <div className="fl-muted">{new Date(r.createdAt).toLocaleString('es-MX')} · v{r.flowVersion || '?'}{r.exitReason ? ` · ${r.exitReason}` : ''}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ─── Editor ─────────────────────────────────────────────────────────
function FlowEditor({ id, catalog, flows, toast, onBack, onSaved }) {
  const [flow, setFlow] = useState(null);
  const [saved, setSaved] = useState(null);
  const [selected, setSelected] = useState(null);
  const [side, setSide] = useState('node'); // node | simulate | runs
  const [errors, setErrors] = useState([]);
  const [hits, setHits] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (id === 'new') { const f = emptyFlow(); setFlow(f); setSaved(JSON.stringify(f)); setSelected('start'); return; }
    getFlow(id).then(r => { setFlow(r.data.data); setSaved(JSON.stringify(r.data.data)); setErrors(r.data.data.validation?.errors || []); })
      .catch(e => toast?.(errMsg(e, 'No se pudo cargar el flujo'), 'error'));
  }, [id, toast]);

  const dirty = flow && JSON.stringify(flow) !== saved;
  const ctx = useMemo(() => ({
    stageLabel: k => catalog.stages.find(s => s.key === k)?.label,
    fieldLabel: k => catalog.fields.find(f => f.key === k)?.label,
    flowName: fid => flows.find(f => f._id === fid)?.name,
  }), [catalog, flows]);

  const save = useCallback(async () => {
    setBusy(true);
    try {
      const body = { name: flow.name, description: flow.description, trigger: flow.trigger, settings: flow.settings, nodes: flow.nodes, edges: flow.edges };
      const r = flow._id ? await updateFlow(flow._id, body) : await createFlow(body);
      const next = r.data.data;
      setFlow(next); setSaved(JSON.stringify(next)); setErrors(next.validation?.errors || r.data.validation?.errors || []);
      toast?.('Guardado', 'success'); onSaved(next);
      return next;
    } catch (e) { toast?.(errMsg(e, 'No se pudo guardar'), 'error'); return null; } finally { setBusy(false); }
  }, [flow, toast, onSaved]);

  const publish = async () => {
    const f = dirty ? await save() : flow;
    if (!f?._id) return;
    setBusy(true);
    try {
      const r = await publishFlow(f._id, true);
      setFlow(r.data.data); setSaved(JSON.stringify(r.data.data)); setErrors([]);
      toast?.(r.data.message || 'Publicado', 'success'); onSaved(r.data.data);
    } catch (e) {
      const v = e?.response?.data?.validation;
      if (v) { setErrors(v.errors || []); if (v.errors?.[0]?.nodeId) { setSelected(v.errors[0].nodeId); setSide('node'); } }
      toast?.(errMsg(e, 'No se pudo publicar'), 'error');
    } finally { setBusy(false); }
  };

  const onAdd = (fromId, handle, type) => {
    const { flow: next, node } = insertNode(flow, fromId, handle, type);
    setFlow(next); setSelected(node.id); setSide('node');
  };
  const onDeleteNode = () => { setFlow(removeNode(flow, selected)); setSelected(null); };

  if (!flow) return <div className="spinner" />;
  const node = selected ? nodeById(flow, selected) : null;
  const nodeErrors = errors.filter(e => e.nodeId === selected);

  return (
    <div className="fl-editor">
      <div className="fl-editbar">
        <button className="btn btn-ghost btn-sm" onClick={() => { if (!dirty || window.confirm('Hay cambios sin guardar. ¿Salir igual?')) onBack(); }}><ArrowLeft size={14} /> Flujos</button>
        <div className="fl-editbar-name">
          <strong>{flow.name}</strong>
          <span className={`badge fl-status-${flow.status || 'draft'}`}>{STATUS_LABEL[flow.status] || 'Borrador'}{flow.version ? ` v${flow.version}` : ''}</span>
          {dirty && <span className="badge badge-source">Sin guardar</span>}
          {errors.length > 0 && <span className="badge badge-score-low">{errors.length} pendiente{errors.length > 1 ? 's' : ''}</span>}
        </div>
        <div className="fl-editbar-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowSettings(true)}><Settings2 size={14} /> Ajustes</button>
          <button className="btn btn-ghost btn-sm" disabled={!flow._id} onClick={() => setSide(side === 'runs' ? 'node' : 'runs')}><Activity size={14} /> Ejecuciones</button>
          <button className="btn btn-ghost btn-sm" disabled={!flow._id} onClick={() => setSide(side === 'simulate' ? 'node' : 'simulate')}><Play size={14} /> Probar</button>
          <button className="btn btn-navy btn-sm" disabled={busy || !dirty} onClick={save}><Save size={14} /> Guardar</button>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={publish}><Upload size={14} /> Publicar</button>
        </div>
      </div>
      <div className="fl-body">
        <FlowCanvas flow={flow} ctx={ctx} selectedId={selected} errors={errors} hits={hits} onSelect={id => { setSelected(id); setSide('node'); setHits([]); }} onAdd={onAdd} />
        {side === 'simulate' && flow._id && <SimulatePanel flowId={flow._id} onHits={setHits} toast={toast} onClose={() => setSide('node')} />}
        {side === 'runs' && flow._id && <RunsPanel flowId={flow._id} onClose={() => setSide('node')} />}
        {side === 'node' && node && (
          <NodeEditor node={node} flow={flow} catalog={catalog} flows={flows} errors={nodeErrors}
            onChange={patch => setFlow(updateNode(flow, node.id, patch))}
            onTriggerChange={trigger => setFlow({ ...flow, trigger })}
            onDelete={onDeleteNode} onClose={() => setSelected(null)} />
        )}
      </div>
      {showSettings && <SettingsModal flow={flow} onChange={setFlow} onClose={() => setShowSettings(false)} />}
    </div>
  );
}

// ─── Página ─────────────────────────────────────────────────────────
export default function FlowsPage({ toast }) {
  const [flows, setFlows] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getFlows(), catalog ? Promise.resolve(null) : getFlowCatalog()])
      .then(([f, c]) => { setFlows(f.data.data || []); if (c) setCatalog(c.data.data); })
      .catch(e => toast?.(errMsg(e, 'No se pudieron cargar los flujos'), 'error'))
      .finally(() => setLoading(false));
  }, [catalog, toast]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onToggle = async (f) => {
    try { const r = await toggleFlow(f._id); setFlows(fs => fs.map(x => (x._id === f._id ? { ...x, isActive: r.data.data.isActive } : x))); toast?.(r.data.message || 'Listo', 'success'); }
    catch (e) { toast?.(errMsg(e, 'No se pudo cambiar'), 'error'); }
  };
  const onDelete = async (f) => {
    if (!window.confirm(`¿Eliminar «${f.name}»? Las ejecuciones en curso se cancelan.`)) return;
    try { await deleteFlow(f._id); setFlows(fs => fs.filter(x => x._id !== f._id)); toast?.('Flujo eliminado', 'success'); }
    catch (e) { toast?.(errMsg(e, 'No se pudo eliminar'), 'error'); }
  };
  const onSaved = useCallback((f) => {
    setFlows(fs => (fs.some(x => x._id === f._id) ? fs.map(x => (x._id === f._id ? { ...x, ...f } : x)) : [f, ...fs]));
    setOpenId(f._id);
  }, []);

  if (!catalog) return <div className="spinner" />;
  if (openId) return <FlowEditor id={openId} catalog={catalog} flows={flows} toast={toast} onBack={() => { setOpenId(null); load(); }} onSaved={onSaved} />;
  return <FlowList flows={flows} catalog={catalog} loading={loading} onOpen={setOpenId} onCreate={() => setOpenId('new')} onToggle={onToggle} onDelete={onDelete} />;
}
