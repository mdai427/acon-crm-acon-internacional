import React, { useEffect, useState } from 'react';
import { X, Trash2, Plus } from 'lucide-react';
import api from '../../services/api';
import { NODE_META, CMP_LABELS, CMP_BY_KIND, WAIT_EVENT_LABELS, UNIT_LABELS, handlesOf } from './flowUtils';

// Panel lateral: edita label + config del nodo seleccionado (o el disparador).
// `catalog` viene de GET /flows/catalog. Todo cambio sube por `onChange(patch)`.

const Field = ({ label, hint, children }) => (
  <div className="form-group">
    <label className="form-label">{label}</label>
    {children}
    {hint && <div className="fl-hint">{hint}</div>}
  </div>
);

function VariablesHint({ variables }) {
  return (
    <div className="fl-hint">
      Variables: {variables.map(v => <code key={v.key} className="fl-var">{`{{${v.key}}}`}</code>)}
    </div>
  );
}

function MultiSelect({ options, value = [], onChange }) {
  const toggle = (k) => onChange(value.includes(k) ? value.filter(v => v !== k) : [...value, k]);
  return (
    <div className="fl-chips">
      {options.map(o => (
        <button type="button" key={o.key} className={`fl-chip${value.includes(o.key) ? ' is-on' : ''}`} onClick={() => toggle(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TriggerForm({ trigger, catalog, onChange }) {
  const def = catalog.triggers.find(t => t.type === trigger.type);
  const p = trigger.params || {};
  const setP = (patch) => onChange({ ...trigger, params: { ...p, ...patch } });
  const has = (k) => def?.params.includes(k);
  return (
    <>
      <Field label="Cuándo arranca">
        <select className="form-input" value={trigger.type} onChange={e => onChange({ type: e.target.value, params: {} })}>
          {catalog.triggers.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
        </select>
      </Field>
      {has('stages') && (
        <Field label={trigger.type === 'lead.stage_entered' ? 'Etapas que disparan' : 'Sólo si está en estas etapas'} hint="Vacío = cualquiera">
          <MultiSelect options={catalog.stages} value={p.stages || []} onChange={stages => setP({ stages })} />
        </Field>
      )}
      {has('sources') && (
        <Field label="Fuentes" hint="Separadas por coma. Vacío = cualquiera">
          <input className="form-input" value={(p.sources || []).join(', ')} onChange={e => setP({ sources: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
        </Field>
      )}
      {has('threshold') && (
        <div className="fl-row">
          <Field label="Score">
            <input type="number" className="form-input" value={p.threshold ?? 70} onChange={e => setP({ threshold: Number(e.target.value) })} />
          </Field>
          <Field label="Dirección">
            <select className="form-input" value={p.direction || 'above'} onChange={e => setP({ direction: e.target.value })}>
              <option value="above">Supera</option><option value="below">Baja de</option>
            </select>
          </Field>
        </div>
      )}
      {has('channel') && (
        <Field label="Canal">
          <select className="form-input" value={p.channel || ''} onChange={e => setP({ channel: e.target.value || undefined })}>
            <option value="">Cualquiera</option><option value="whatsapp">WhatsApp</option><option value="email">Correo</option>
          </select>
        </Field>
      )}
      {has('outcome') && (
        <Field label="Resultado de la llamada" hint="Vacío = cualquiera">
          <input className="form-input" value={p.outcome || ''} onChange={e => setP({ outcome: e.target.value || undefined })} />
        </Field>
      )}
      {has('days') && (
        <Field label="Días sin contacto">
          <input type="number" min="1" className="form-input" value={p.days ?? 7} onChange={e => setP({ days: Number(e.target.value) })} />
        </Field>
      )}
      {has('field') && (
        <div className="fl-row">
          <Field label="Fecha de referencia">
            <select className="form-input" value={p.field || ''} onChange={e => setP({ field: e.target.value })}>
              <option value="">Elige…</option>
              {(catalog.dateFields || []).map(f => <option key={f.key || f} value={f.key || f}>{f.label || f}</option>)}
            </select>
          </Field>
          <Field label="Días después">
            <input type="number" className="form-input" value={p.offsetDays ?? 0} onChange={e => setP({ offsetDays: Number(e.target.value) })} />
          </Field>
        </div>
      )}
    </>
  );
}

function RulesEditor({ condition, catalog, onChange }) {
  const rules = condition?.rules || [];
  const setRules = (r) => onChange({ ...condition, rules: r });
  const kindOf = (f) => catalog.fields.find(x => x.key === f)?.kind || 'text';
  return (
    <>
      <Field label="Se cumple si">
        <select className="form-input" value={condition?.op || 'and'} onChange={e => onChange({ ...condition, op: e.target.value })}>
          <option value="and">Todas las reglas</option><option value="or">Alguna regla</option>
        </select>
      </Field>
      {rules.map((r, i) => {
        const kind = kindOf(r.field);
        const cmps = CMP_BY_KIND[kind] || CMP_BY_KIND.text;
        const noValue = ['exists', 'not_exists'].includes(r.cmp);
        const set = (patch) => setRules(rules.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        return (
          <div className="fl-rule" key={i}>
            <select className="form-input" value={r.field} onChange={e => set({ field: e.target.value, cmp: (CMP_BY_KIND[kindOf(e.target.value)] || ['eq'])[0], value: '' })}>
              {catalog.fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            <select className="form-input" value={r.cmp || 'eq'} onChange={e => set({ cmp: e.target.value })}>
              {cmps.map(c => <option key={c} value={c}>{CMP_LABELS[c]}</option>)}
            </select>
            {!noValue && (r.field === 'stage'
              ? <select className="form-input" value={r.value || ''} onChange={e => set({ value: e.target.value })}>
                  <option value="">Elige…</option>{catalog.stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              : kind === 'bool'
                ? <select className="form-input" value={String(r.value ?? true)} onChange={e => set({ value: e.target.value === 'true' })}><option value="true">Sí</option><option value="false">No</option></select>
                : <input className="form-input" placeholder={['in', 'nin'].includes(r.cmp) ? 'a, b, c' : 'valor'} value={r.value ?? ''} onChange={e => set({ value: e.target.value })} />)}
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => setRules(rules.filter((_, j) => j !== i))} title="Quitar regla"><Trash2 size={14} /></button>
          </div>
        );
      })}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRules([...rules, { field: 'stage', cmp: 'eq', value: '' }])}><Plus size={13} /> Añadir regla</button>
    </>
  );
}

function WhatsAppForm({ c, set, catalog }) {
  const [templates, setTemplates] = useState([]);
  useEffect(() => {
    if (c.mode !== 'template') return;
    api.get('/whatsapp/meta/templates').then(r => setTemplates((r.data?.data || []).filter(t => t.status === 'APPROVED'))).catch(() => setTemplates([]));
  }, [c.mode]);
  return (
    <>
      <Field label="Tipo de envío" hint="Fuera de la ventana de 24 h Meta sólo permite plantillas aprobadas.">
        <select className="form-input" value={c.mode || 'session'} onChange={e => set({ mode: e.target.value })}>
          <option value="session">Mensaje libre (ventana 24 h)</option>
          <option value="template">Plantilla aprobada de Meta</option>
        </select>
      </Field>
      {c.mode === 'template' ? (
        <>
          <Field label="Plantilla">
            <select className="form-input" value={c.metaTemplate?.name || ''} onChange={e => {
              const t = templates.find(x => x.name === e.target.value);
              set({ metaTemplate: t ? { name: t.name, language: t.language, params: c.metaTemplate?.params || [] } : undefined });
            }}>
              <option value="">Elige…</option>
              {templates.map(t => <option key={t.name + t.language} value={t.name}>{t.name} ({t.language})</option>)}
            </select>
          </Field>
          <Field label="Parámetros del cuerpo" hint="Uno por línea, en orden. Admiten variables.">
            <textarea className="form-input" rows={3} value={(c.metaTemplate?.params || []).join('\n')} onChange={e => set({ metaTemplate: { ...(c.metaTemplate || {}), params: e.target.value.split('\n') } })} />
          </Field>
        </>
      ) : (
        <>
          <Field label="Mensaje">
            <textarea className="form-input" rows={5} value={c.text || ''} onChange={e => set({ text: e.target.value })} />
            <VariablesHint variables={catalog.variables} />
          </Field>
          <Field label="O que lo redacte la IA" hint="Si escribes instrucciones aquí, se ignora el texto fijo.">
            <textarea className="form-input" rows={2} placeholder="Ej.: saluda por su nombre y pregunta si recibió la propuesta" value={c.aiInstructions || ''} onChange={e => set({ aiInstructions: e.target.value })} />
          </Field>
        </>
      )}
    </>
  );
}

function EmailForm({ c, set, catalog }) {
  const [templates, setTemplates] = useState([]);
  useEffect(() => { api.get('/templates').then(r => setTemplates(r.data?.data || [])).catch(() => {}); }, []);
  return (
    <>
      <Field label="Plantilla del CRM" hint="Si eliges una, el asunto y cuerpo de abajo se ignoran.">
        <select className="form-input" value={c.templateId || ''} onChange={e => set({ templateId: e.target.value || undefined })}>
          <option value="">Sin plantilla (escribir aquí)</option>
          {templates.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
        </select>
      </Field>
      {!c.templateId && (
        <>
          <Field label="Asunto"><input className="form-input" value={c.subject || ''} onChange={e => set({ subject: e.target.value })} /></Field>
          <Field label="Cuerpo">
            <textarea className="form-input" rows={6} value={c.body || ''} onChange={e => set({ body: e.target.value })} />
            <VariablesHint variables={catalog.variables} />
          </Field>
          <Field label="O que lo redacte la IA">
            <textarea className="form-input" rows={2} value={c.aiInstructions || ''} onChange={e => set({ aiInstructions: e.target.value })} />
          </Field>
        </>
      )}
    </>
  );
}

function UserPicker({ value, onChange }) {
  const [users, setUsers] = useState([]);
  useEffect(() => { api.get('/users').then(r => setUsers(r.data?.data || [])).catch(() => {}); }, []);
  return (
    <select className="form-input" value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">Elige…</option>
      {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
    </select>
  );
}

function ConfigForm({ node, catalog, flows, onChange }) {
  const c = node.config || {};
  const set = (patch) => onChange({ config: { ...c, ...patch } });
  switch (node.type) {
    case 'wait':
      return (
        <>
          <Field label="Tipo de espera">
            <select className="form-input" value={c.mode || 'for'} onChange={e => set({ mode: e.target.value })}>
              <option value="for">Un tiempo fijo</option><option value="until">Hasta que pase algo</option>
            </select>
          </Field>
          {c.mode === 'until' ? (
            <>
              <Field label="Esperar a que…">
                <select className="form-input" value={c.until?.event || ''} onChange={e => set({ until: { ...(c.until || {}), event: e.target.value } })}>
                  <option value="">Elige…</option>
                  {catalog.waitEvents.map(ev => <option key={ev} value={ev}>{WAIT_EVENT_LABELS[ev] || ev}</option>)}
                </select>
              </Field>
              <div className="fl-row">
                <Field label="Como máximo"><input type="number" min="1" className="form-input" value={c.maxAmount ?? 7} onChange={e => set({ maxAmount: Number(e.target.value) })} /></Field>
                <Field label="Unidad">
                  <select className="form-input" value={c.maxUnit || 'days'} onChange={e => set({ maxUnit: e.target.value })}>
                    {Object.entries(UNIT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </Field>
              </div>
              <div className="fl-hint">Si se agota el tiempo, el flujo sigue por la salida «Se agotó el tiempo».</div>
            </>
          ) : (
            <div className="fl-row">
              <Field label="Cantidad"><input type="number" min="1" className="form-input" value={c.amount ?? 1} onChange={e => set({ amount: Number(e.target.value) })} /></Field>
              <Field label="Unidad">
                <select className="form-input" value={c.unit || 'days'} onChange={e => set({ unit: e.target.value })}>
                  {Object.entries(UNIT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
            </div>
          )}
        </>
      );
    case 'condition':
      return <RulesEditor condition={c.condition || { op: 'and', rules: [] }} catalog={catalog} onChange={condition => set({ condition })} />;
    case 'split':
      return (
        <>
          <Field label="Campo">
            <select className="form-input" value={c.field || ''} onChange={e => set({ field: e.target.value, values: [] })}>
              {catalog.fields.filter(f => ['enum', 'text'].includes(f.kind)).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </Field>
          <Field label="Valores (una rama por cada uno)" hint="Lo que no coincida sale por «Otro».">
            {c.field === 'stage'
              ? <MultiSelect options={catalog.stages} value={c.values || []} onChange={values => set({ values })} />
              : <input className="form-input" placeholder="a, b, c" value={(c.values || []).join(', ')} onChange={e => set({ values: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />}
          </Field>
        </>
      );
    case 'send_whatsapp': return <WhatsAppForm c={c} set={set} catalog={catalog} />;
    case 'send_email':    return <EmailForm c={c} set={set} catalog={catalog} />;
    case 'create_task':
      return (
        <>
          <Field label="Título"><input className="form-input" value={c.title || ''} onChange={e => set({ title: e.target.value })} /></Field>
          <Field label="Detalle"><textarea className="form-input" rows={3} value={c.message || ''} onChange={e => set({ message: e.target.value })} /><VariablesHint variables={catalog.variables} /></Field>
          <div className="fl-row">
            <Field label="Vence en (días)"><input type="number" min="0" className="form-input" value={c.dueInDays ?? 1} onChange={e => set({ dueInDays: Number(e.target.value) })} /></Field>
            <Field label="Prioridad">
              <select className="form-input" value={c.priority || 'medium'} onChange={e => set({ priority: e.target.value })}>
                <option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option>
              </select>
            </Field>
          </div>
        </>
      );
    case 'notify':
      return (
        <>
          <Field label="Para">
            <select className="form-input" value={c.to || 'assigned'} onChange={e => set({ to: e.target.value })}>
              <option value="assigned">El ejecutivo asignado</option><option value="user">Un usuario fijo</option>
            </select>
          </Field>
          {c.to === 'user' && <Field label="Usuario"><UserPicker value={c.userId} onChange={userId => set({ userId })} /></Field>}
          <Field label="Título"><input className="form-input" value={c.title || ''} onChange={e => set({ title: e.target.value })} /></Field>
          <Field label="Mensaje"><textarea className="form-input" rows={3} value={c.message || ''} onChange={e => set({ message: e.target.value })} /><VariablesHint variables={catalog.variables} /></Field>
        </>
      );
    case 'ai_email_draft':
      return (
        <>
          <Field label="Qué debe redactar" hint="Genera un borrador y crea una tarea para que el ejecutivo lo revise antes de enviar.">
            <textarea className="form-input" rows={3} value={c.purpose || ''} onChange={e => set({ purpose: e.target.value })} />
          </Field>
          <Field label="Tarea de revisión vence en (días)"><input type="number" min="0" className="form-input" value={c.dueInDays ?? 1} onChange={e => set({ dueInDays: Number(e.target.value) })} /></Field>
        </>
      );
    case 'change_stage':
      return (
        <Field label="Etapa destino">
          <select className="form-input" value={c.stage || ''} onChange={e => set({ stage: e.target.value })}>
            <option value="">Elige…</option>{catalog.stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
      );
    case 'assign':
      return (
        <>
          <Field label="Cómo asignar">
            <select className="form-input" value={c.mode || 'round_robin'} onChange={e => set({ mode: e.target.value })}>
              <option value="round_robin">Round-robin entre ejecutivos</option>
              <option value="by_country">Por país del lead</option>
              <option value="user">A un usuario fijo</option>
            </select>
          </Field>
          {c.mode === 'user' && <Field label="Usuario"><UserPicker value={c.userId} onChange={userId => set({ userId })} /></Field>}
        </>
      );
    case 'tag':
      return (
        <>
          <Field label="Etiqueta"><input className="form-input" value={c.tag || ''} onChange={e => set({ tag: e.target.value })} /></Field>
          <label className="fl-check"><input type="checkbox" checked={!!c.remove} onChange={e => set({ remove: e.target.checked })} /> Quitar en vez de añadir</label>
        </>
      );
    case 'update_field':
      return (
        <>
          <Field label="Campo">
            <select className="form-input" value={c.field || 'priority'} onChange={e => set({ field: e.target.value, value: e.target.value === 'priority' ? 'high' : '' })}>
              <option value="priority">Prioridad</option><option value="value">Valor estimado (USD)</option><option value="notes">Notas (añade al final)</option>
            </select>
          </Field>
          <Field label="Valor">
            {c.field === 'priority'
              ? <select className="form-input" value={c.value || 'high'} onChange={e => set({ value: e.target.value })}><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select>
              : c.field === 'value'
                ? <input type="number" className="form-input" value={c.value ?? ''} onChange={e => set({ value: e.target.value })} />
                : <textarea className="form-input" rows={3} value={c.value || ''} onChange={e => set({ value: e.target.value })} />}
          </Field>
        </>
      );
    case 'enroll_flow':
      return (
        <Field label="Flujo destino" hint="Máximo 3 niveles de anidación; el motor corta cadenas más largas.">
          <select className="form-input" value={c.flowId || ''} onChange={e => set({ flowId: e.target.value })}>
            <option value="">Elige…</option>
            {flows.map(f => <option key={f._id} value={f._id}>{f.name}{f.status !== 'published' ? ' (borrador)' : ''}</option>)}
          </select>
        </Field>
      );
    case 'exit':
      return <Field label="Motivo (opcional)"><input className="form-input" value={c.reason || ''} onChange={e => set({ reason: e.target.value })} /></Field>;
    case 'note':
      return <Field label="Texto"><textarea className="form-input" rows={4} value={c.text || ''} onChange={e => set({ text: e.target.value })} /></Field>;
    default:
      return null;
  }
}

export default function NodeEditor({ node, flow, catalog, flows, errors = [], onChange, onTriggerChange, onDelete, onClose }) {
  if (!node) return null;
  const isTrigger = node.type === 'trigger';
  const meta = NODE_META[node.type];
  return (
    <aside className="fl-panel">
      <div className="fl-panel-head">
        <div>
          <div className="fl-panel-kicker">{meta?.label}</div>
          {!isTrigger && (
            <input className="fl-panel-title" value={node.label || ''} placeholder="Nombre del paso" onChange={e => onChange({ label: e.target.value })} />
          )}
        </div>
        <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
      </div>
      {errors.length > 0 && (
        <div className="fl-errors">{errors.map((e, i) => <div key={i}>• {e.message}</div>)}</div>
      )}
      <div className="fl-panel-body">
        {isTrigger
          ? <TriggerForm trigger={flow.trigger} catalog={catalog} onChange={onTriggerChange} />
          : <ConfigForm node={node} catalog={catalog} flows={flows.filter(f => f._id !== flow._id)} onChange={onChange} />}
        {!isTrigger && handlesOf(node).length > 1 && (
          <div className="fl-hint">Este paso tiene varias salidas; conecta cada una en el lienzo.</div>
        )}
      </div>
      {!isTrigger && (
        <div className="fl-panel-foot">
          <button className="btn btn-danger btn-sm" onClick={onDelete}><Trash2 size={13} /> Quitar paso</button>
        </div>
      )}
    </aside>
  );
}
