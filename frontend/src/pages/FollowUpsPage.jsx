import React, { useState, useEffect } from 'react';
import {
  getFollowUpRules, createFollowUpRule, updateFollowUpRule,
  deleteFollowUpRule, getPendingFollowUps, executeFollowUpRule,
  getSequences, createSequence, updateSequence, deleteSequence,
  enrollInSequence, getSequenceEnrollments, exitSequenceEnrollment,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Zap, Plus, Play, Trash2, ToggleLeft, ToggleRight, Clock, Users, AlertTriangle, X, ChevronRight, RefreshCw, GitBranch, ArrowDown, MessageSquare, Mail, CheckSquare } from 'lucide-react';

const TRIGGER_TYPES = [
  { id: 'days_inactive', label: 'Días sin contacto', Icon: Clock, desc: 'Se activa si un lead lleva N días sin ser contactado' },
  { id: 'score_below',   label: 'Score bajo',        Icon: AlertTriangle, desc: 'Se activa si el score IA de un lead cae por debajo de N' },
];

const ACTION_TYPES = [
  { id: 'task',               label: 'Crear tarea',          desc: 'Genera una tarea de seguimiento al ejecutivo asignado' },
  { id: 'email',              label: 'Enviar email',          desc: 'Envía email automático al lead (requiere SMTP configurado)' },
  { id: 'whatsapp',           label: 'Enviar WhatsApp',       desc: 'Envía mensaje automático (requiere WhatsApp API)' },
  { id: 'whatsapp_and_email', label: 'WhatsApp + Email',      desc: 'Ambos canales a la vez' },
];

const STAGES = [
  { id: 'new', label: 'Nuevos' }, { id: 'contacted', label: 'Contactados' },
  { id: 'qualified', label: 'Calificados' }, { id: 'proposal', label: 'Propuesta' },
  { id: 'negotiation', label: 'Negociación' },
];

const EMPTY_RULE = {
  name: '', description: '', isActive: true,
  trigger: { type: 'days_inactive', value: 5, stages: [] },
  action: { type: 'task', message: 'Dar seguimiento a {empresa} — lleva más de {dias} días sin contacto. Etapa: {etapa}.', taskTitle: 'Seguimiento pendiente: {empresa}', subject: 'Seguimiento a tu consulta — ACON Internacional' },
  cooldownDays: 3,
};

function RuleCard({ rule, onToggle, onDelete, onExecute, executing }) {
  const triggerDef = TRIGGER_TYPES.find(t => t.id === rule.trigger?.type);
  const TriggerIcon = triggerDef?.Icon || Clock;

  return (
    <div className="card" style={{ marginBottom: 12, position: 'relative', borderLeft: `4px solid ${rule.isActive ? 'var(--orange-500)' : 'var(--gray-200)'}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: rule.isActive ? 'var(--orange-light)' : 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TriggerIcon size={17} style={{ color: rule.isActive ? 'var(--orange-500)' : 'var(--gray-400)' }} strokeWidth={1.75} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy-900)' }}>{rule.name}</span>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: rule.isActive ? '#DCFCE7' : '#F4F5F7', color: rule.isActive ? '#16A34A' : '#9AA3AE' }}>
                {rule.isActive ? 'Activa' : 'Pausada'}
              </span>
            </div>
            {rule.description && <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 6 }}>{rule.description}</div>}

            {/* Condición → Acción */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, flexWrap: 'wrap' }}>
              <span style={{ background: 'var(--gray-100)', color: 'var(--gray-700)', padding: '3px 9px', borderRadius: 6, fontWeight: 500 }}>
                Si {rule.trigger?.type === 'days_inactive' ? `sin contacto ≥ ${rule.trigger.value} días` : `score < ${rule.trigger?.value}`}
              </span>
              {rule.trigger?.stages?.length > 0 && (
                <span style={{ color: 'var(--gray-400)', fontSize: 11 }}>
                  en {rule.trigger.stages.join(', ')}
                </span>
              )}
              <ChevronRight size={12} style={{ color: 'var(--gray-400)' }} />
              <span style={{ background: 'var(--orange-light)', color: 'var(--orange-500)', padding: '3px 9px', borderRadius: 6, fontWeight: 600 }}>
                {ACTION_TYPES.find(a => a.id === rule.action?.type)?.label || rule.action?.type}
              </span>
              <span style={{ color: 'var(--gray-400)', fontSize: 11 }}>· cooldown {rule.cooldownDays}d</span>
            </div>

            <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 11, color: 'var(--gray-400)' }}>
              <span>Ejecutada {rule.executionCount || 0} veces</span>
              {rule.lastRun && <span>Última ejecución: {new Date(rule.lastRun).toLocaleDateString('es-MX')}</span>}
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onExecute(rule._id)} disabled={executing === rule._id} title="Ejecutar ahora" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {executing === rule._id ? <RefreshCw size={13} className="spin" /> : <Play size={13} />}
            Ejecutar
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onToggle(rule)} title={rule.isActive ? 'Pausar' : 'Activar'}>
            {rule.isActive ? <ToggleRight size={16} style={{ color: 'var(--orange-500)' }} /> : <ToggleLeft size={16} />}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onDelete(rule._id)} style={{ color: 'var(--red)', padding: '5px 8px' }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

const EMPTY_SEQUENCE = {
  name: '', description: '', isActive: true,
  steps: [{ order: 0, delayHours: 0, channel: 'whatsapp', message: 'Hola {contacto}, soy de ACON Internacional. ¿Pudiste revisar nuestra propuesta para {empresa}?', skipIf: { type: 'none', stages: [] } }],
  autoEnrollTrigger: { type: 'none', stages: [] },
  cooldownDays: 7,
};

function SequenceStepEditor({ step, index, onChange, onDelete }) {
  const CHANNELS = [{ v: 'whatsapp', label: '💬 WhatsApp' }, { v: 'email', label: '📧 Email' }, { v: 'task', label: '✅ Tarea' }];
  const SKIP_TYPES = [{ v: 'none', label: 'Siempre enviar' }, { v: 'stage_is', label: 'Si etapa ES...' }, { v: 'stage_not', label: 'Si etapa NO ES...' }];
  const STAGES = ['new','contacted','qualified','proposal','negotiation','closed_won','closed_lost'];

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--gray-50)', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Paso {index + 1}</div>
        {index > 0 && (
          <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--red)' }} onClick={onDelete}><Trash2 size={12} /></button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Canal</label>
          <select className="form-select" value={step.channel} onChange={e => onChange('channel', e.target.value)}>
            {CHANNELS.map(c => <option key={c.v} value={c.v}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>
            {index === 0 ? 'Retraso desde el enroll (horas)' : 'Retraso desde paso anterior (horas)'}
          </label>
          <input type="number" className="form-input" min={0} value={step.delayHours}
            onChange={e => onChange('delayHours', Number(e.target.value))} />
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>
          {step.channel === 'task' ? 'Descripción de la tarea' : 'Mensaje'}
        </label>
        <textarea className="form-input" rows={2} value={step.message}
          onChange={e => onChange('message', e.target.value)}
          placeholder="Variables: {empresa} {contacto} {etapa}" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Condición para omitir paso</label>
          <select className="form-select" value={step.skipIf?.type || 'none'}
            onChange={e => onChange('skipIf', { ...step.skipIf, type: e.target.value, stages: [] })}>
            {SKIP_TYPES.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
        </div>
        {step.skipIf?.type !== 'none' && (
          <div>
            <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Etapas</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {STAGES.map(s => (
                <button key={s} type="button"
                  className={`btn btn-sm ${(step.skipIf?.stages || []).includes(s) ? 'btn-navy' : 'btn-ghost'}`}
                  style={{ padding: '2px 8px', fontSize: 10 }}
                  onClick={() => {
                    const cur = step.skipIf?.stages || [];
                    onChange('skipIf', { ...step.skipIf, stages: cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s] });
                  }}>{s}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FollowUpsPage({ toast }) {
  const { user } = useAuth();
  const isAdmin = ['admin', 'gerencia', 'direccion'].includes(user?.role);

  const [rules, setRules] = useState([]);
  const [pending, setPending] = useState([]);
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showSeqModal, setShowSeqModal] = useState(false);
  const [seqForm, setSeqForm] = useState(EMPTY_SEQUENCE);
  const [editingSeq, setEditingSeq] = useState(null);
  const [form, setForm] = useState(EMPTY_RULE);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(null);
  const [tab, setTab] = useState('rules');
  const [viewEnrollSeq, setViewEnrollSeq] = useState(null);
  const [enrollments, setEnrollments] = useState([]);

  const load = () => {
    setLoading(true);
    Promise.all([
      getFollowUpRules(),
      getPendingFollowUps(),
      getSequences(),
    ]).then(([r, p, s]) => {
      setRules(r.data.data || []);
      setPending(p.data.data || []);
      setSequences(s.data.data || []);
    }).catch(() => toast('Error al cargar', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const f = (path, val) => {
    setForm(prev => {
      const parts = path.split('.');
      if (parts.length === 1) return { ...prev, [path]: val };
      return { ...prev, [parts[0]]: { ...prev[parts[0]], [parts[1]]: val } };
    });
  };

  const toggleStage = (stage) => {
    const stages = form.trigger.stages || [];
    f('trigger.stages', stages.includes(stage) ? stages.filter(s => s !== stage) : [...stages, stage]);
  };

  const handleCreate = async () => {
    if (!form.name) return toast('El nombre de la regla es requerido', 'error');
    setSaving(true);
    try {
      await createFollowUpRule(form);
      toast('Regla creada', 'success');
      setShowModal(false);
      setForm(EMPTY_RULE);
      load();
    } catch (e) {
      toast(e.response?.data?.message || 'Error al crear regla', 'error');
    } finally { setSaving(false); }
  };

  const handleToggle = async (rule) => {
    try {
      await updateFollowUpRule(rule._id, { isActive: !rule.isActive });
      toast(rule.isActive ? 'Regla pausada' : 'Regla activada', 'success');
      load();
    } catch { toast('Error', 'error'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta regla?')) return;
    try {
      await deleteFollowUpRule(id);
      toast('Regla eliminada', 'success');
      load();
    } catch { toast('Error al eliminar', 'error'); }
  };

  const handleExecute = async (ruleId) => {
    const rule = rules.find(r => r._id === ruleId);
    const affectedCount = pending.length;
    const msg = affectedCount > 0
      ? `¿Ejecutar la regla "${rule?.name}"?\n\nEl sistema procesará todos los leads que cumplan los criterios (${affectedCount} leads en el sistema pendientes de reglas activas).`
      : `¿Ejecutar la regla "${rule?.name}" ahora?`;
    if (!window.confirm(msg)) return;
    setExecuting(ruleId);
    try {
      const r = await executeFollowUpRule(ruleId);
      const { executed, failed, total } = r.data.data;
      toast(`Ejecutada: ${executed} tareas creadas de ${total} leads (${failed} errores)`, 'success');
      load();
    } catch (e) {
      toast(e.response?.data?.message || 'Error al ejecutar', 'error');
    } finally { setExecuting(null); }
  };

  // Sequence handlers
  const handleSaveSequence = async () => {
    if (!seqForm.name) return toast('El nombre es requerido', 'error');
    setSaving(true);
    try {
      if (editingSeq) {
        await updateSequence(editingSeq, seqForm);
        toast('Secuencia actualizada', 'success');
      } else {
        await createSequence(seqForm);
        toast('Secuencia creada', 'success');
      }
      setShowSeqModal(false);
      setEditingSeq(null);
      setSeqForm(EMPTY_SEQUENCE);
      load();
    } catch (e) { toast(e.response?.data?.message || 'Error', 'error'); }
    finally { setSaving(false); }
  };

  const handleDeleteSequence = async (id) => {
    if (!window.confirm('¿Eliminar esta secuencia?')) return;
    try { await deleteSequence(id); toast('Eliminada', 'success'); load(); }
    catch { toast('Error', 'error'); }
  };

  const handleViewEnrollments = async (seq) => {
    setViewEnrollSeq(seq);
    try {
      const r = await getSequenceEnrollments(seq._id);
      setEnrollments(r.data.data || []);
    } catch { setEnrollments([]); }
  };

  const addStep = () => {
    const steps = [...seqForm.steps];
    steps.push({ order: steps.length, delayHours: 48, channel: 'whatsapp', message: '', skipIf: { type: 'none', stages: [] } });
    setSeqForm(f => ({ ...f, steps }));
  };

  const updateStep = (idx, key, val) => {
    const steps = seqForm.steps.map((s, i) => i === idx ? { ...s, [key]: val } : s);
    setSeqForm(f => ({ ...f, steps }));
  };

  const removeStep = (idx) => {
    const steps = seqForm.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i }));
    setSeqForm(f => ({ ...f, steps }));
  };

  const activeRules = rules.filter(r => r.isActive).length;
  const totalPending = pending.reduce((s, p) => s + p.leads.length, 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Seguimientos Automáticos</div>
          <div className="page-sub">{activeRules} reglas activas · {totalPending} leads pendientes de seguimiento</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Nueva Regla
          </button>
        )}
      </div>

      {/* KPI mini */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Reglas activas', value: activeRules, Icon: Zap, color: '#F2641E' },
          { label: 'Leads pendientes', value: totalPending, Icon: Users, color: '#2563EB' },
          { label: 'Reglas totales', value: rules.length, Icon: RefreshCw, color: '#16A34A' },
        ].map(({ label, value, Icon, color }) => (
          <div key={label} className="card card-sm" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={17} style={{ color }} strokeWidth={1.75} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy-900)', lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--gray-200)' }}>
        {[
          { id: 'rules', label: 'Reglas Simples' },
          { id: 'sequences', label: `Secuencias (${sequences.length})` },
          { id: 'pending', label: `Pendientes (${totalPending})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: 'transparent', color: tab === t.id ? 'var(--navy-900)' : 'var(--gray-400)',
            borderBottom: tab === t.id ? '2px solid var(--orange-500)' : '2px solid transparent',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── REGLAS ── */}
      {tab === 'rules' && (
        loading ? <div className="loading"><div className="spinner" /></div> :
        rules.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <Zap size={44} />
              <p>No hay reglas configuradas. Crea la primera para automatizar seguimientos.</p>
              {isAdmin && <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}><Plus size={13} /> Nueva Regla</button>}
            </div>
          </div>
        ) : (
          rules.map(rule => (
            <RuleCard key={rule._id} rule={rule} onToggle={handleToggle} onDelete={handleDelete} onExecute={handleExecute} executing={executing} />
          ))
        )
      )}

      {/* ── SECUENCIAS ── */}
      {tab === 'sequences' && (
        <div>
          {isAdmin && (
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => { setEditingSeq(null); setSeqForm(EMPTY_SEQUENCE); setShowSeqModal(true); }}>
                <Plus size={14} /> Nueva Secuencia
              </button>
            </div>
          )}
          {sequences.length === 0 ? (
            <div className="card"><div className="empty-state"><GitBranch size={44} /><p>No hay secuencias configuradas. Crea una para automatizar flujos multi-paso.</p></div></div>
          ) : sequences.map(seq => (
            <div key={seq._id} className="card" style={{ marginBottom: 12, borderLeft: `4px solid ${seq.isActive ? 'var(--blue)' : 'var(--gray-200)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>{seq.name}</div>
                  {seq.description && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>{seq.description}</div>}
                  {/* Step preview */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    {(seq.steps || []).sort((a,b)=>a.order-b.order).map((step, i) => (
                      <React.Fragment key={i}>
                        <span style={{ fontSize: 11, background: 'var(--gray-100)', padding: '2px 8px', borderRadius: 12, color: 'var(--text2)', fontWeight: 500 }}>
                          {step.channel === 'whatsapp' ? '💬' : step.channel === 'email' ? '📧' : '✅'} +{step.delayHours}h
                        </span>
                        {i < (seq.steps.length - 1) && <ChevronRight size={12} style={{ color: 'var(--text3)', flexShrink: 0 }} />}
                      </React.Fragment>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)' }}>
                    {seq.steps?.length} pasos · cooldown {seq.cooldownDays}d
                    {seq.autoEnrollTrigger?.type !== 'none' && ` · Auto-enroll: ${seq.autoEnrollTrigger.type}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleViewEnrollments(seq)}>
                    <Users size={13} /> Enrollments
                  </button>
                  {isAdmin && <>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditingSeq(seq._id); setSeqForm({ name: seq.name, description: seq.description || '', isActive: seq.isActive, steps: seq.steps, autoEnrollTrigger: seq.autoEnrollTrigger || EMPTY_SEQUENCE.autoEnrollTrigger, cooldownDays: seq.cooldownDays }); setShowSeqModal(true); }}>Editar</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleDeleteSequence(seq._id)}><Trash2 size={13} /></button>
                  </>}
                </div>
              </div>
            </div>
          ))}

          {/* Enrollments drawer */}
          {viewEnrollSeq && (
            <div className="modal-overlay" onClick={() => setViewEnrollSeq(null)}>
              <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <div className="modal-title">Enrollments — {viewEnrollSeq.name}</div>
                  <button className="modal-close" onClick={() => setViewEnrollSeq(null)}><X size={16} /></button>
                </div>
                {enrollments.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 30, color: 'var(--text3)' }}>Sin leads enrolados aún</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                        {['Lead', 'Estado', 'Paso', 'Próxima ejecución', 'Enrolado por', ''].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text3)', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {enrollments.map(en => (
                        <tr key={en._id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>{en.lead?.company || '—'}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, fontWeight: 600,
                              background: en.status === 'active' ? '#DCFCE7' : en.status === 'completed' ? '#DBEAFE' : '#F4F5F7',
                              color: en.status === 'active' ? '#16A34A' : en.status === 'completed' ? '#1D4ED8' : '#9AA3AE' }}>
                              {en.status}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', color: 'var(--text2)' }}>{en.currentStep + 1}/{viewEnrollSeq.steps?.length}</td>
                          <td style={{ padding: '8px 12px', color: 'var(--text3)' }}>{en.nextRunAt ? new Date(en.nextRunAt).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                          <td style={{ padding: '8px 12px', color: 'var(--text3)' }}>{en.enrolledBy?.name || '—'}</td>
                          <td style={{ padding: '8px 12px' }}>
                            {en.status === 'active' && (
                              <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}
                                onClick={async () => { await exitSequenceEnrollment(en._id, 'Manual'); handleViewEnrollments(viewEnrollSeq); }}>
                                Salir
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Sequence builder modal */}
          {showSeqModal && (
            <div className="modal-overlay" onClick={() => setShowSeqModal(false)}>
              <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <div className="modal-title"><GitBranch size={16} style={{ color: 'var(--blue)' }} /> {editingSeq ? 'Editar Secuencia' : 'Nueva Secuencia'}</div>
                  <button className="modal-close" onClick={() => setShowSeqModal(false)}><X size={16} /></button>
                </div>

                <div className="form-group">
                  <label className="form-label">Nombre *</label>
                  <input className="form-input" value={seqForm.name} onChange={e => setSeqForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Seguimiento post-propuesta 4 pasos" />
                </div>
                <div className="form-group">
                  <label className="form-label">Descripción</label>
                  <input className="form-input" value={seqForm.description} onChange={e => setSeqForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Cooldown (días mínimo entre enrollments del mismo lead)</label>
                  <input type="number" className="form-input" style={{ maxWidth: 100 }} value={seqForm.cooldownDays}
                    onChange={e => setSeqForm(f => ({ ...f, cooldownDays: Number(e.target.value) }))} min={1} />
                </div>

                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', margin: '16px 0 12px' }}>Pasos de la secuencia</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {seqForm.steps.sort((a,b) => a.order - b.order).map((step, i) => (
                    <React.Fragment key={i}>
                      <SequenceStepEditor
                        step={step} index={i}
                        onChange={(key, val) => updateStep(i, key, val)}
                        onDelete={() => removeStep(i)}
                      />
                      {i < seqForm.steps.length - 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <ArrowDown size={16} style={{ color: 'var(--text3)' }} />
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 12, width: '100%' }} onClick={addStep}>
                  <Plus size={13} /> Agregar paso
                </button>

                <div className="modal-actions" style={{ marginTop: 20 }}>
                  <button className="btn btn-ghost" onClick={() => setShowSeqModal(false)}>Cancelar</button>
                  <button className="btn btn-primary" onClick={handleSaveSequence} disabled={saving}>
                    {saving ? 'Guardando...' : editingSeq ? 'Actualizar' : 'Crear Secuencia'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PENDIENTES ── */}
      {tab === 'pending' && (
        pending.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <Users size={44} />
              <p>No hay leads pendientes de seguimiento en este momento.</p>
            </div>
          </div>
        ) : (
          pending.map(({ rule, leads }) => (
            <div key={rule._id} className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--navy-900)', fontSize: 14 }}>{rule.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>Acción: {ACTION_TYPES.find(a => a.id === rule.action?.type)?.label}</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => handleExecute(rule._id)} disabled={executing === rule._id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {executing === rule._id ? <RefreshCw size={13} className="spin" /> : <Play size={13} />}
                  Ejecutar ({leads.length})
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Empresa</th><th>Etapa</th><th>Score</th><th>Asignado a</th><th>Último contacto</th></tr>
                  </thead>
                  <tbody>
                    {leads.map(l => (
                      <tr key={l._id}>
                        <td style={{ fontWeight: 600 }}>{l.company}</td>
                        <td><span className={`badge badge-${l.stage}`}>{l.stage}</span></td>
                        <td style={{ fontWeight: 700, color: l.score >= 70 ? '#16A34A' : l.score >= 40 ? '#CA8A04' : '#DC2626' }}>{l.score || 0}</td>
                        <td style={{ fontSize: 12, color: 'var(--gray-500)' }}>{l.assignedTo?.name || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                          {l.lastContactDate ? new Date(l.lastContactDate).toLocaleDateString('es-MX') : 'Nunca'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )
      )}

      {/* ── Modal nueva regla ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={18} style={{ color: 'var(--orange-500)' }} /> Nueva Regla de Seguimiento
              </div>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>

            <div className="form-group">
              <label className="form-label">Nombre de la regla *</label>
              <input className="form-input" value={form.name} onChange={e => f('name', e.target.value)} placeholder="Ej: Recordatorio 5 días sin contacto" />
            </div>
            <div className="form-group">
              <label className="form-label">Descripción</label>
              <input className="form-input" value={form.description} onChange={e => f('description', e.target.value)} placeholder="Para qué sirve esta regla..." />
            </div>

            <div className="section-title"><span>Condición disparadora</span></div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Tipo de condición</label>
                <select className="form-select" value={form.trigger.type} onChange={e => f('trigger.type', e.target.value)}>
                  {TRIGGER_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{form.trigger.type === 'days_inactive' ? 'Días sin contacto' : 'Score mínimo'}</label>
                <input className="form-input" type="number" value={form.trigger.value} onChange={e => f('trigger.value', Number(e.target.value))} min={1} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Aplicar a etapas (vacío = todas)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {STAGES.map(s => (
                  <button key={s.id} type="button"
                    className={`service-chip ${(form.trigger.stages || []).includes(s.id) ? 'selected' : ''}`}
                    onClick={() => toggleStage(s.id)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="section-title"><span>Acción a ejecutar</span></div>

            <div className="form-group">
              <label className="form-label">Tipo de acción</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ACTION_TYPES.map(a => (
                  <label key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', borderRadius: 8, border: `2px solid ${form.action.type === a.id ? 'var(--orange-500)' : 'var(--gray-200)'}`, cursor: 'pointer', background: form.action.type === a.id ? 'var(--orange-light)' : '#fff' }}>
                    <input type="radio" name="actionType" value={a.id} checked={form.action.type === a.id} onChange={() => f('action.type', a.id)} style={{ marginTop: 2 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy-900)' }}>{a.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{a.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {form.action.type === 'task' && (
              <div className="form-group">
                <label className="form-label">Título de la tarea</label>
                <input className="form-input" value={form.action.taskTitle} onChange={e => f('action.taskTitle', e.target.value)} placeholder="Seguimiento: {empresa}" />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Mensaje / Descripción</label>
              <textarea className="form-input" rows={3} value={form.action.message} onChange={e => f('action.message', e.target.value)} />
              <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 4 }}>Variables: {'{empresa}'} {'{contacto}'} {'{etapa}'}</div>
            </div>

            <div className="form-group">
              <label className="form-label">Cooldown entre ejecuciones (días)</label>
              <input className="form-input" type="number" value={form.cooldownDays} onChange={e => f('cooldownDays', Number(e.target.value))} min={1} style={{ maxWidth: 120 }} />
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>Mínimo días entre ejecuciones para el mismo lead</div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
                {saving ? 'Guardando...' : 'Crear Regla'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin 1s linear infinite}`}</style>
    </div>
  );
}
