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

// Valores de ejemplo para que la vista previa se lea natural.
const SAMPLES = ['Ana López', 'Acme SA', 'flete marítimo', 'Shanghái', 'Manzanillo'];

export default function WaTemplateCreator({ onClose, onCreated, toast }) {
  const [form, setForm] = useState({
    name: '', language: 'es_MX', category: 'UTILITY',
    headerText: '', bodyText: '', footerText: '',
  });
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
      const r = await createMetaWaTemplate(form);
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
                {vars.length > 0 && (
                  <span className="pb-tpl-hint">{vars.length} variable(s): al enviarla se rellenan con datos del lead.</span>
                )}
              </div>
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
              values={vars.map((n, i) => SAMPLES[i] || `Ejemplo ${n}`)}
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
