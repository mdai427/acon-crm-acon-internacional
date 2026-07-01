import React, { useState, useEffect } from 'react';
import {
  getFollowUpRules, createFollowUpRule, updateFollowUpRule,
  deleteFollowUpRule, getPendingFollowUps, executeFollowUpRule
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Zap, Plus, Play, Trash2, ToggleLeft, ToggleRight, Clock, Users, AlertTriangle, X, ChevronRight, RefreshCw } from 'lucide-react';

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

export default function FollowUpsPage({ toast }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [rules, setRules] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_RULE);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(null);
  const [tab, setTab] = useState('rules');

  const load = () => {
    setLoading(true);
    Promise.all([
      getFollowUpRules(),
      getPendingFollowUps(),
    ]).then(([r, p]) => {
      setRules(r.data.data || []);
      setPending(p.data.data || []);
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
        {[{ id: 'rules', label: 'Reglas' }, { id: 'pending', label: `Pendientes (${totalPending})` }].map(t => (
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
