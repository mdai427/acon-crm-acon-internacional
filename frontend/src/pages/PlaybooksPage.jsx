import React, { useEffect, useState } from 'react';
import { getPlaybooks, updatePlaybook, getTemplates2, getMetaWaTemplates } from '../services/api';
import {
  Sparkles, Plus, Trash2, Save, ChevronDown, Zap, MessageSquare,
  Mail, Bell, CheckSquare, Bot, Clock, Filter,
} from 'lucide-react';

// Playbooks por etapa. Las etapas vienen del pipeline (son configurables): si
// se crea una etapa nueva, su playbook aparece aquí solo.
//
// Cada acción se EJECUTA de verdad al entrar el lead a la etapa: enviar
// WhatsApp o correo, crear tarea, avisar al ejecutivo o pedirle a la IA un
// borrador. Ver services/playbookRunner en el backend.

const KINDS = [
  { id: 'task',           label: 'Crear tarea',        Icon: CheckSquare,
    hint: 'Deja un pendiente al ejecutivo (no envía nada)' },
  { id: 'whatsapp',       label: 'Enviar WhatsApp',    Icon: MessageSquare,
    hint: 'Envía una plantilla aprobada de Meta al lead' },
  { id: 'email',          label: 'Enviar correo',      Icon: Mail,
    hint: 'Envía el correo real al lead desde el buzón del asesor' },
  { id: 'ai_email_draft', label: 'Borrador IA',        Icon: Bot,
    hint: 'La IA redacta un correo y lo deja como tarea para aprobar' },
  { id: 'notify',         label: 'Avisar al ejecutivo', Icon: Bell,
    hint: 'Notificación in-app al asignado del lead' },
];

const kindOf = (id) => KINDS.find(k => k.id === id) || KINDS[0];

// Variables {{1}}, {{2}}… del cuerpo de una plantilla de Meta.
const tplVars = (tpl) => {
  const body = tpl?.components?.find(c => c.type === 'BODY');
  const found = [...String(body?.text || '').matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]));
  return [...new Set(found)].sort((a, b) => a - b);
};

const EMPTY_ACTION = {
  kind: 'task', title: '', message: '', subject: '', aiInstructions: '',
  dueInDays: 2, delayDays: 0, onlyIf: { minScore: '', maxScore: '', minValue: '' },
};

// ── Editor de una acción ─────────────────────────────────────────────────────
function ActionEditor({ action, onChange, onRemove, emailTemplates, waTemplates }) {
  const [showConditions, setShowConditions] = useState(
    action.onlyIf && (action.onlyIf.minScore ?? '') !== '' && action.onlyIf.minScore !== null
  );
  const kind = kindOf(action.kind);
  const set = (campo, valor) => onChange({ ...action, [campo]: valor });
  const setCond = (campo, valor) => onChange({ ...action, onlyIf: { ...(action.onlyIf || {}), [campo]: valor } });

  const usesAI = action.kind === 'email';
  const isDraft = action.kind === 'ai_email_draft';

  return (
    <div className="pb-action">
      <div className="pb-action-top">
        <select className="pb-kind" value={action.kind} onChange={e => set('kind', e.target.value)}>
          {KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <input
          className="pb-title"
          placeholder="Nombre de la acción (ej. Bienvenida por WhatsApp)"
          value={action.title}
          onChange={e => set('title', e.target.value)}
        />
        <label className="pb-delay" title="Días de espera tras entrar a la etapa (0 = inmediato)">
          <Clock size={12} />
          <input type="number" min="0" max="60" value={action.delayDays}
            onChange={e => set('delayDays', e.target.value)} />
          <span>días</span>
        </label>
        <button className="pb-remove" onClick={onRemove} title="Quitar acción"><Trash2 size={13} /></button>
      </div>

      <div className="pb-kind-hint">{kind.hint}</div>

      {/* WhatsApp: plantilla aprobada de Meta o texto libre (ventana 24 h) */}
      {action.kind === 'whatsapp' && (
        <div className="pb-tpl-row">
          <select
            className="pb-field"
            value={action.metaTemplate?.name || ''}
            onChange={e => onChange({
              ...action,
              metaTemplate: { ...(action.metaTemplate || {}), name: e.target.value, language: waTemplates.find(t => t.name === e.target.value)?.language || 'es_MX' },
              aiInstructions: '', _useAi: false, message: '',
            })}
          >
            <option value="">Selecciona una plantilla aprobada…</option>
            {waTemplates.map(t => (
              <option key={t.name + t.language} value={t.name}>
                {t.name} ({t.language})
              </option>
            ))}
          </select>
          <span className="pb-tpl-hint">
            WhatsApp automático solo envía plantillas aprobadas de Meta
            {!waTemplates.length && ' — se crean en Meta Business y aparecen aquí'}.
          </span>
          {(() => {
            const tpl = waTemplates.find(t => t.name === action.metaTemplate?.name);
            const vars = tplVars(tpl);
            if (!vars.length) return null;
            const params = action.metaTemplate?.params || [];
            return (
              <div className="pb-tpl-vars">
                {vars.map((n, i) => (
                  <input
                    key={n}
                    className="pb-field"
                    placeholder={`{{${n}}} — admite {empresa} {contacto} {etapa} {ejecutivo}`}
                    value={params[i] || ''}
                    onChange={e => onChange({
                      ...action,
                      metaTemplate: {
                        ...action.metaTemplate,
                        params: vars.map((_, idx) => (idx === i ? e.target.value : (params[idx] || ''))),
                      },
                    })}
                  />
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Correo: plantilla de la sección Plantillas o contenido propio */}
      {action.kind === 'email' && (
        <div className="pb-tpl-row">
          <select
            className="pb-field"
            value={action.templateId || ''}
            onChange={e => onChange({
              ...action,
              templateId: e.target.value || null,
              ...(e.target.value ? { aiInstructions: '', _useAi: false } : {}),
            })}
          >
            <option value="">Contenido propio (o redactado por la IA)</option>
            {emailTemplates.map(t => (
              <option key={t._id} value={t._id}>Plantilla: {t.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Contenido según el tipo */}
      {action.kind === 'email' && !action.templateId && (
        <input
          className="pb-field"
          placeholder="Asunto del correo — admite {empresa} {contacto} {etapa} {ejecutivo}"
          value={action.subject || ''}
          onChange={e => set('subject', e.target.value)}
        />
      )}

      {(usesAI || isDraft) && !(action.kind === 'email' && action.templateId) && (
        <div className="pb-ai-row">
          <label className="pb-ai-toggle">
            <input
              type="checkbox"
              checked={isDraft ? true : !!action._useAi || !!action.aiInstructions}
              disabled={isDraft}
              onChange={e => onChange({
                ...action,
                _useAi: e.target.checked,
                aiInstructions: e.target.checked ? action.aiInstructions : '',
              })}
            />
            <Bot size={12} /> La IA redacta el contenido
          </label>
        </div>
      )}

      {action.kind === 'whatsapp' || (action.kind === 'email' && action.templateId) ? null
        : (isDraft || action._useAi || action.aiInstructions) && (usesAI || isDraft) ? (
        <textarea
          className="pb-field"
          rows={2}
          placeholder="Instrucciones para la IA (ej. saluda, menciona nuestros servicios marítimos y propone una llamada esta semana)"
          value={action.aiInstructions || ''}
          onChange={e => set('aiInstructions', e.target.value)}
        />
      ) : action.kind !== 'notify' && (
        <textarea
          className="pb-field"
          rows={2}
          placeholder={action.kind === 'task'
            ? 'Descripción de la tarea (opcional)'
            : 'Texto del mensaje — admite {empresa} {contacto} {etapa} {ejecutivo}'}
          value={action.message || ''}
          onChange={e => set('message', e.target.value)}
        />
      )}

      {action.kind === 'notify' && (
        <input
          className="pb-field"
          placeholder="Texto del aviso (opcional) — admite {empresa} {contacto} {etapa}"
          value={action.message || ''}
          onChange={e => set('message', e.target.value)}
        />
      )}

      {/* Condiciones */}
      <button className="pb-cond-toggle" onClick={() => setShowConditions(v => !v)}>
        <Filter size={11} /> Condiciones {showConditions ? '▾' : '▸'}
      </button>
      {showConditions && (
        <div className="pb-conds">
          <label>Score mínimo
            <input type="number" min="0" max="100" placeholder="—"
              value={action.onlyIf?.minScore ?? ''}
              onChange={e => setCond('minScore', e.target.value)} />
          </label>
          <label>Score máximo
            <input type="number" min="0" max="100" placeholder="—"
              value={action.onlyIf?.maxScore ?? ''}
              onChange={e => setCond('maxScore', e.target.value)} />
          </label>
          <label>Valor mínimo (USD)
            <input type="number" min="0" placeholder="—"
              value={action.onlyIf?.minValue ?? ''}
              onChange={e => setCond('minValue', e.target.value)} />
          </label>
          <span className="pb-conds-hint">Si el lead no cumple, la acción se omite.</span>
        </div>
      )}
    </div>
  );
}

// ── Tarjeta por etapa ────────────────────────────────────────────────────────
function PlaybookCard({ playbook, onSave, toast, emailTemplates, waTemplates }) {
  const [open, setOpen] = useState(false);
  const [pb, setPb] = useState(playbook);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setPb(playbook); setDirty(false); }, [playbook]);

  const patch = (cambios) => { setPb(p => ({ ...p, ...cambios })); setDirty(true); };
  const setAction = (i, next) => patch({ actions: pb.actions.map((a, idx) => (idx === i ? next : a)) });

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(pb.stage, { actions: pb.actions, isActive: pb.isActive, useAI: pb.useAI });
      toast(`Playbook de "${pb.stageLabel}" guardado`, 'success');
      setDirty(false);
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudo guardar', 'error');
    } finally { setSaving(false); }
  };

  const resumen = pb.actions.length
    ? `${pb.actions.length} acción(es)`
    : (pb.useAI ? 'Tareas sugeridas por IA' : 'Sin acciones');

  return (
    <div className="card" style={{ borderLeft: `3px solid ${pb.stageColor}` }}>
      <div className="pb-head" onClick={() => setOpen(o => !o)}>
        <span className="pb-stage" style={{ color: pb.stageColor }}>
          {pb.stageEmoji && `${pb.stageEmoji} `}{pb.stageLabel}
        </span>
        <span className="pb-summary">{resumen}</span>
        {!pb.isActive && <span className="pb-off">Desactivado</span>}
        <ChevronDown size={15} style={{
          marginLeft: 'auto', transition: 'transform .15s',
          transform: open ? 'rotate(180deg)' : 'none', color: 'var(--gray-400)',
        }} />
      </div>

      {open && (
        <div className="pb-body">
          <div className="pb-switches">
            <label>
              <input type="checkbox" checked={pb.isActive}
                onChange={e => patch({ isActive: e.target.checked })} />
              Playbook activo
            </label>
            <label title="Si no hay acciones definidas, la IA sugiere tareas según el perfil del lead">
              <input type="checkbox" checked={pb.useAI}
                onChange={e => patch({ useAI: e.target.checked })} />
              <Sparkles size={12} /> IA sugiere tareas cuando no hay acciones
            </label>
          </div>

          <div className="pb-actions">
            {pb.actions.map((action, i) => (
              <ActionEditor
                key={i}
                action={action}
                emailTemplates={emailTemplates}
                waTemplates={waTemplates}
                onChange={next => setAction(i, next)}
                onRemove={() => patch({ actions: pb.actions.filter((_, idx) => idx !== i) })}
              />
            ))}
            {!pb.actions.length && (
              <div className="pb-empty">
                Sin acciones. {pb.useAI
                  ? 'La IA sugerirá tareas al entrar un lead a esta etapa.'
                  : 'No pasará nada al entrar un lead a esta etapa.'}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-ghost btn-sm"
              onClick={() => patch({ actions: [...pb.actions, { ...EMPTY_ACTION }] })}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Plus size={13} /> Agregar acción
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleSave}
              disabled={saving || !dirty}
              style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
              <Save size={13} /> {saving ? 'Guardando…' : 'Guardar playbook'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlaybooksPage({ toast }) {
  const [playbooks, setPlaybooks] = useState([]);
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [waTemplates, setWaTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await getPlaybooks();
      setPlaybooks(r.data.data || []);
    } catch { toast('Error al cargar playbooks', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    // Catálogos para los selectores; si fallan, el editor sigue funcionando
    // con contenido propio.
    getTemplates2({ channel: 'email' })
      .then(r => setEmailTemplates(r.data.data || []))
      .catch(() => setEmailTemplates([]));
    getMetaWaTemplates()
      .then(r => setWaTemplates((r.data.data || []).filter(t => t.status === 'APPROVED')))
      .catch(() => setWaTemplates([]));
  }, []); // eslint-disable-line

  const handleSave = async (stage, data) => {
    await updatePlaybook(stage, data);
    await load();
  };

  if (loading) return <div className="loading"><div className="spinner" />Cargando playbooks…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Playbooks por etapa</div>
          <div className="page-sub">Acciones que se ejecutan automáticamente cuando un lead entra a cada etapa</div>
        </div>
      </div>

      <div style={{
        background: 'linear-gradient(135deg, rgba(124,58,237,.06), rgba(11,37,69,.04))',
        border: '1px solid rgba(124,58,237,.2)', borderRadius: 12,
        padding: '14px 18px', marginBottom: 20,
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <Zap size={19} color="#7C3AED" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: 'var(--gray-500)', lineHeight: 1.65 }}>
          <strong style={{ color: '#5B21B6' }}>Estas acciones se ejecutan de verdad</strong>: los
          WhatsApp y correos se envían al lead, no son recordatorios. Cada acción puede esperar unos
          días, activarse solo si el lead cumple condiciones (score, valor) y dejar que la IA
          redacte el contenido con tus instrucciones. Si un envío falla, se convierte en tarea para
          el ejecutivo — nada se pierde en silencio. Las etapas de esta lista siguen a tu pipeline.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {playbooks.map(pb => (
          <PlaybookCard key={pb.stage} playbook={pb} onSave={handleSave} toast={toast}
            emailTemplates={emailTemplates} waTemplates={waTemplates} />
        ))}
      </div>
    </div>
  );
}
