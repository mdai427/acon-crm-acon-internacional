import React, { useMemo, useState } from 'react';
import { X, Send, Plus, Info } from 'lucide-react';
import { createMetaWaTemplate } from '../services/api';
import { PhonePreview, extractVars } from './WaTemplateWizard';

// Creador de plantillas de WhatsApp con vista previa en vivo. La plantilla se
// registra en Meta y queda PENDIENTE hasta que ellos la aprueben; una vez
// aprobada aparece sola en el chat y en los playbooks.

const LANGUAGES = [
  { id: 'es_MX', label: 'Español (México)' },
  { id: 'es',    label: 'Español' },
  { id: 'en_US', label: 'Inglés (EE. UU.)' },
];

const CATEGORIES = [
  { id: 'UTILITY',   label: 'Utilidad',  hint: 'Seguimientos, confirmaciones, avisos de una operación en curso' },
  { id: 'MARKETING', label: 'Marketing', hint: 'Promociones y prospección; Meta la revisa con más lupa' },
];

// Variables predefinidas: al enviar, el sistema las rellena solo con el dato
// del lead. La personalizada pide el texto de ejemplo (Meta lo exige para
// aprobar) y su valor se captura al momento de enviar.
const PRESET_VARS = [
  { id: 'contacto',  label: 'Nombre del contacto', sample: 'Ana López' },
  { id: 'empresa',   label: 'Empresa',             sample: 'Acme SA' },
  { id: 'ejecutivo', label: 'Ejecutivo asignado',  sample: 'Carlos Ruiz' },
  { id: 'etapa',     label: 'Etapa del pipeline',  sample: 'Propuesta' },
  { id: 'custom',    label: 'Personalizada…',      sample: '' },
];

export default function WaTemplateCreator({ onClose, onCreated, toast }) {
  const [form, setForm] = useState({
    name: '', language: 'es_MX', category: 'UTILITY',
    headerText: '', bodyText: '', footerText: '',
  });
  // Qué representa cada variable {{n}}: predefinida o personalizada con su texto.
  const [varMeta, setVarMeta] = useState([]);
  const [saving, setSaving] = useState(false);

  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  const vars = useMemo(() => extractVars(form.bodyText), [form.bodyText]);

  // Meta exige minúsculas y guiones bajos; se muestra en vivo cómo quedará.
  const metaName = form.name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');

  const addVariable = () => {
    const next = vars.length + 1;
    set('bodyText', `${form.bodyText}${form.bodyText && !form.bodyText.endsWith(' ') ? ' ' : ''}{{${next}}}`);
    setVarMeta(m => [...m, { kind: 'contacto', custom: '' }]);
  };

  const setVarKind = (i, kind) =>
    setVarMeta(m => vars.map((_, idx) => (idx === i ? { ...(m[idx] || {}), kind } : (m[idx] || { kind: 'contacto', custom: '' }))));
  const setVarCustom = (i, custom) =>
    setVarMeta(m => vars.map((_, idx) => (idx === i ? { ...(m[idx] || { kind: 'custom' }), custom } : (m[idx] || { kind: 'contacto', custom: '' }))));

  // Texto de ejemplo de cada variable (para la vista previa y para Meta).
  const sampleFor = (i) => {
    const meta = varMeta[i] || { kind: 'contacto' };
    if (meta.kind === 'custom') return meta.custom || `Ejemplo ${i + 1}`;
    return PRESET_VARS.find(v => v.id === meta.kind)?.sample || `Ejemplo ${i + 1}`;
  };

  // La vista previa reutiliza el formato de componentes de Meta.
  const previewTemplate = {
    components: [
      ...(form.headerText.trim() ? [{ type: 'HEADER', format: 'TEXT', text: form.headerText }] : []),
      { type: 'BODY', text: form.bodyText || 'Escribe el mensaje para verlo aquí…' },
      ...(form.footerText.trim() ? [{ type: 'FOOTER', text: form.footerText }] : []),
    ],
  };

  const handleCreate = async () => {
    if (!metaName) return toast('La plantilla necesita nombre', 'error');
    if (!form.bodyText.trim()) return toast('Escribe el cuerpo del mensaje', 'error');
    setSaving(true);
    try {
      const r = await createMetaWaTemplate({
        ...form,
        // Meta exige un ejemplo por variable para aprobar la plantilla.
        examples: vars.map((n, i) => sampleFor(i)),
      });
      toast(r.data.message, 'success');
      onCreated?.();
      onClose();
    } catch (e) {
      toast(e.response?.data?.message || 'No se pudo crear la plantilla', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal waw-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Nueva plantilla de WhatsApp</div>
            <div className="stage-modal-sub">
              Se registra en Meta y queda pendiente hasta que la aprueben (minutos a horas).
            </div>
          </div>
          <button className="modal-close" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="waw-map">
          <div className="waw-map-form">
            <label className="waw-field">
              <span>Nombre</span>
              <input value={form.name} placeholder="Ej. Bienvenida ACON"
                onChange={e => set('name', e.target.value)} />
              {metaName && metaName !== form.name && (
                <div className="pb-tpl-hint">En Meta quedará como: <code>{metaName}</code></div>
              )}
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label className="waw-field">
                <span>Idioma</span>
                <select className="form-select" value={form.language} onChange={e => set('language', e.target.value)}>
                  {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </label>
              <label className="waw-field">
                <span>Categoría</span>
                <select className="form-select" value={form.category} onChange={e => set('category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
            </div>
            <div className="pb-tpl-hint" style={{ marginTop: -6, marginBottom: 10 }}>
              {CATEGORIES.find(c => c.id === form.category)?.hint}
            </div>

            <label className="waw-field">
              <span>Encabezado (opcional)</span>
              <input value={form.headerText} maxLength={60}
                placeholder="Texto en negrita arriba del mensaje"
                onChange={e => set('headerText', e.target.value)} />
            </label>

            <label className="waw-field">
              <span>Cuerpo del mensaje</span>
              <textarea
                className="pb-field" rows={5}
                value={form.bodyText}
                placeholder={'Hola {{1}}, soy del equipo de ACON. Vimos el interés de {{2}} en nuestros servicios…'}
                onChange={e => set('bodyText', e.target.value)}
              />
              <div className="waw-body-tools">
                <button type="button" className="waw-chip" onClick={addVariable}>
                  <Plus size={11} /> Insertar variable {'{{'}{vars.length + 1}{'}}'}
                </button>
              </div>

              {/* Qué representa cada variable */}
              {vars.length > 0 && (
                <div className="waw-vars">
                  {vars.map((n, i) => {
                    const meta = varMeta[i] || { kind: 'contacto', custom: '' };
                    return (
                      <div key={n} className="waw-var-row">
                        <code className="waw-var-tag">{'{{'}{n}{'}}'}</code>
                        <select
                          className="form-select"
                          value={meta.kind}
                          onChange={e => setVarKind(i, e.target.value)}
                        >
                          {PRESET_VARS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </select>
                        {meta.kind === 'custom' && (
                          <input
                            className="waw-var-custom"
                            placeholder="Texto de ejemplo (ej. 20% de descuento)"
                            value={meta.custom || ''}
                            onChange={e => setVarCustom(i, e.target.value)}
                          />
                        )}
                      </div>
                    );
                  })}
                  <div className="pb-tpl-hint">
                    Las predefinidas se rellenan solas con el dato del lead al enviar; la
                    personalizada se captura en cada envío.
                  </div>
                </div>
              )}
            </label>

            <label className="waw-field">
              <span>Pie (opcional)</span>
              <input value={form.footerText} maxLength={60}
                placeholder="Texto pequeño al final (ej. ACON Worldwide Logística)"
                onChange={e => set('footerText', e.target.value)} />
            </label>

            <div className="sa-hint" style={{ color: 'var(--gray-500)' }}>
              <Info size={13} />
              Meta rechaza plantillas con solo variables, saludos vacíos o contenido engañoso.
              Escribe el mensaje completo y usa variables solo donde cambie el dato.
            </div>
          </div>

          <div>
            <PhonePreview
              template={previewTemplate}
              values={vars.map((n, i) => sampleFor(i))}
              contactName="Cliente"
            />
            <div className="pb-tpl-hint" style={{ textAlign: 'center', marginTop: 8 }}>
              Vista previa con datos de ejemplo
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
            <Send size={14} /> {saving ? 'Enviando a Meta…' : 'Crear y enviar a aprobación'}
          </button>
        </div>
      </div>
    </div>
  );
}
