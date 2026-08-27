import React, { useMemo, useState } from 'react';
import { X, Send, Plus, Info, Trash2, Upload, Link2, Phone, MessageSquare } from 'lucide-react';
import { createMetaWaTemplate, uploadWaTemplateHeader } from '../services/api';
import { PhonePreview, extractVars } from './WaTemplateWizard';
import { LEAD_VARS, sampleOf } from './waVars';

// Creador de plantillas de WhatsApp con vista previa en vivo. La plantilla se
// registra en Meta y queda PENDIENTE hasta que ellos la aprueben; una vez
// aprobada aparece sola en el chat, en las campañas y en los playbooks.
//
// Cubre todo lo que Meta admite en una plantilla estándar: encabezado de texto
// o con archivo, cuerpo con variables, pie y hasta diez botones.

const LANGUAGES = [
  { id: 'es_MX', label: 'Español (México)' },
  { id: 'es',    label: 'Español' },
  { id: 'en_US', label: 'Inglés (EE. UU.)' },
];

const CATEGORIES = [
  { id: 'UTILITY',   label: 'Utilidad',  hint: 'Seguimientos, confirmaciones, avisos de una operación en curso' },
  { id: 'MARKETING', label: 'Marketing', hint: 'Promociones y prospección; Meta la revisa con más lupa' },
];

const HEADER_KINDS = [
  { id: 'none',  label: 'Sin encabezado' },
  { id: 'TEXT',  label: 'Texto' },
  { id: 'IMAGE', label: 'Imagen', accept: 'image/jpeg,image/png' },
  { id: 'VIDEO', label: 'Video',  accept: 'video/mp4' },
  { id: 'DOCUMENT', label: 'Documento (PDF)', accept: 'application/pdf' },
];

const BUTTON_TYPES = [
  { id: 'QUICK_REPLY',  label: 'Respuesta rápida', hint: 'El cliente responde con un toque y abre la ventana de 24 h' },
  { id: 'URL',          label: 'Abrir enlace',     hint: 'Lleva a una página (cotización, sitio, seguimiento)' },
  { id: 'PHONE_NUMBER', label: 'Llamar',           hint: 'Marca a un número tuyo' },
];

const MAX_BUTTONS = 10;

// Una variable nueva arranca apuntando al nombre del contacto, que es el uso
// más común, y se cambia con el selector.
const newVariable = () => ({ kind: 'field', source: 'contact', label: '', sample: '' });

export default function WaTemplateCreator({ onClose, onCreated, toast }) {
  const [form, setForm] = useState({
    name: '', language: 'es_MX', category: 'UTILITY',
    headerKind: 'none', headerText: '', headerHandle: '', headerFileName: '',
    bodyText: '', footerText: '',
  });
  // Qué representa cada variable {{n}}: dato del CRM o personalizada.
  const [variables, setVariables] = useState([]);
  const [buttons, setButtons] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  const vars = useMemo(() => extractVars(form.bodyText), [form.bodyText]);

  // Meta exige minúsculas y guiones bajos; se muestra en vivo cómo quedará.
  const metaName = form.name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');

  // El mapeo se mantiene del largo exacto que pide el cuerpo: si se borra una
  // variable del texto, su fila desaparece sola.
  const varAt = (i) => variables[i] || newVariable();
  const setVarAt = (i, cambios) =>
    setVariables(() => vars.map((_, idx) => (idx === i ? { ...varAt(idx), ...cambios } : varAt(idx))));

  const addVariable = () => {
    const next = vars.length + 1;
    set('bodyText', `${form.bodyText}${form.bodyText && !form.bodyText.endsWith(' ') ? ' ' : ''}{{${next}}}`);
    setVariables(v => [...v, newVariable()]);
  };

  // ── Encabezado con archivo ────────────────────────────────────────
  const headerKind = HEADER_KINDS.find(h => h.id === form.headerKind);
  const headerIsMedia = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(form.headerKind);

  const handleHeaderFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const r = await uploadWaTemplateHeader(file);
      setForm(f => ({ ...f, headerHandle: r.data.data.headerHandle, headerFileName: file.name }));
      toast('Archivo subido', 'success');
    } catch (e) {
      toast(e.response?.data?.message || 'No se pudo subir el archivo', 'error');
    } finally {
      setUploading(false);
    }
  };

  // ── Botones ───────────────────────────────────────────────────────
  const addButton = () => setButtons(b => [...b, { type: 'QUICK_REPLY', text: '', url: '', phone: '' }]);
  const setButtonAt = (i, cambios) =>
    setButtons(b => b.map((btn, idx) => (idx === i ? { ...btn, ...cambios } : btn)));
  const removeButton = (i) => setButtons(b => b.filter((_, idx) => idx !== i));

  const buttonIsValid = (b) => b.text.trim()
    && (b.type !== 'URL' || b.url.trim())
    && (b.type !== 'PHONE_NUMBER' || b.phone.trim());

  // ── Vista previa ──────────────────────────────────────────────────
  const previewTemplate = {
    components: [
      ...(form.headerKind === 'TEXT' && form.headerText.trim()
        ? [{ type: 'HEADER', format: 'TEXT', text: form.headerText }] : []),
      ...(headerIsMedia ? [{ type: 'HEADER', format: form.headerKind }] : []),
      { type: 'BODY', text: form.bodyText || 'Escribe el mensaje para verlo aquí…' },
      ...(form.footerText.trim() ? [{ type: 'FOOTER', text: form.footerText }] : []),
      ...(buttons.filter(buttonIsValid).length
        ? [{ type: 'BUTTONS', buttons: buttons.filter(buttonIsValid) }] : []),
    ],
  };

  const handleCreate = async () => {
    if (!metaName) return toast('La plantilla necesita nombre', 'error');
    if (!form.bodyText.trim()) return toast('Escribe el cuerpo del mensaje', 'error');
    if (headerIsMedia && !form.headerHandle) {
      return toast('Sube el archivo del encabezado o elige otro tipo', 'error');
    }
    const invalidos = buttons.filter(b => !buttonIsValid(b)).length;
    if (invalidos) return toast(`Completa los ${invalidos} botón(es) incompletos`, 'error');

    setSaving(true);
    try {
      const r = await createMetaWaTemplate({
        name: form.name,
        language: form.language,
        category: form.category,
        bodyText: form.bodyText,
        footerText: form.footerText,
        headerFormat: form.headerKind === 'none' ? undefined : form.headerKind,
        headerText: form.headerKind === 'TEXT' ? form.headerText : '',
        headerHandle: headerIsMedia ? form.headerHandle : '',
        buttons,
        // El mapeo de variables se guarda en el CRM: es lo que permite
        // rellenarlas solas al enviar y no volver a pedir el nombre del contacto.
        variables: vars.map((_, i) => {
          const v = varAt(i);
          return { ...v, sample: sampleOf(v, i) };
        }),
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
              Te avisamos aquí cuando respondan.
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

            {/* ── Encabezado: texto o archivo ── */}
            <label className="waw-field">
              <span>Encabezado (opcional)</span>
              <select className="form-select" value={form.headerKind}
                onChange={e => set('headerKind', e.target.value)}>
                {HEADER_KINDS.map(h => <option key={h.id} value={h.id}>{h.label}</option>)}
              </select>
            </label>

            {form.headerKind === 'TEXT' && (
              <label className="waw-field">
                <span>Texto del encabezado</span>
                <input value={form.headerText} maxLength={60}
                  placeholder="Texto en negrita arriba del mensaje"
                  onChange={e => set('headerText', e.target.value)} />
              </label>
            )}

            {headerIsMedia && (
              <div className="waw-field">
                <span>Archivo del encabezado</span>
                <div className="waw-body-tools">
                  <label className="waw-chip" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
                    <Upload size={11} /> {uploading ? 'Subiendo…' : 'Elegir archivo'}
                    <input type="file" hidden accept={headerKind?.accept} disabled={uploading}
                      onChange={e => handleHeaderFile(e.target.files?.[0])} />
                  </label>
                  {form.headerFileName && (
                    <span className="pb-tpl-hint" style={{ marginLeft: 8 }}>{form.headerFileName}</span>
                  )}
                </div>
                <div className="pb-tpl-hint">
                  Máximo 5 MB. Es solo la muestra que revisa Meta: al enviar, cada mensaje
                  puede llevar su propio archivo.
                </div>
              </div>
            )}

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
                    const v = varAt(i);
                    return (
                      <div key={n} className="waw-var-row">
                        <code className="waw-var-tag">{'{{'}{n}{'}}'}</code>
                        <select
                          className="form-select"
                          value={v.kind === 'custom' ? 'custom' : v.source}
                          onChange={e => setVarAt(i, e.target.value === 'custom'
                            ? { kind: 'custom', label: '', sample: '' }
                            : { kind: 'field', source: e.target.value })}
                        >
                          <optgroup label="Datos del CRM (se rellenan solos)">
                            {LEAD_VARS.map(lv => <option key={lv.id} value={lv.id}>{lv.label}</option>)}
                          </optgroup>
                          <option value="custom">Personalizada (la escribes al enviar)</option>
                        </select>
                        {v.kind === 'custom' && (
                          <>
                            <input
                              className="waw-var-custom"
                              placeholder="Qué se pide (ej. Nº de embarque)"
                              value={v.label || ''}
                              onChange={e => setVarAt(i, { label: e.target.value })}
                            />
                            <input
                              className="waw-var-custom"
                              placeholder="Ejemplo para Meta (ej. ACN-4471)"
                              value={v.sample || ''}
                              onChange={e => setVarAt(i, { sample: e.target.value })}
                            />
                          </>
                        )}
                      </div>
                    );
                  })}
                  <div className="pb-tpl-hint">
                    Las de <strong>datos del CRM</strong> se rellenan solas con la información del
                    lead al enviar. Las <strong>personalizadas</strong> se te piden en cada envío,
                    con la etiqueta que escribas aquí.
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

            {/* ── Botones ── */}
            <div className="waw-field">
              <span>Botones (opcional)</span>
              {buttons.map((b, i) => (
                <div key={i} className="waw-var-row" style={{ alignItems: 'flex-start' }}>
                  <select className="form-select" value={b.type}
                    onChange={e => setButtonAt(i, { type: e.target.value })}>
                    {BUTTON_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  <input className="waw-var-custom" maxLength={25} placeholder="Texto del botón"
                    value={b.text} onChange={e => setButtonAt(i, { text: e.target.value })} />
                  {b.type === 'URL' && (
                    <input className="waw-var-custom" placeholder="https://…"
                      value={b.url} onChange={e => setButtonAt(i, { url: e.target.value })} />
                  )}
                  {b.type === 'PHONE_NUMBER' && (
                    <input className="waw-var-custom" placeholder="+52 55 1234 5678"
                      value={b.phone} onChange={e => setButtonAt(i, { phone: e.target.value })} />
                  )}
                  <button type="button" className="modal-close" onClick={() => removeButton(i)}
                    title="Quitar botón"><Trash2 size={14} /></button>
                </div>
              ))}
              {buttons.length < MAX_BUTTONS && (
                <div className="waw-body-tools">
                  <button type="button" className="waw-chip" onClick={addButton}>
                    <Plus size={11} /> Agregar botón
                  </button>
                </div>
              )}
              <div className="pb-tpl-hint">
                {BUTTON_TYPES.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {t.id === 'URL' ? <Link2 size={10} /> : t.id === 'PHONE_NUMBER' ? <Phone size={10} /> : <MessageSquare size={10} />}
                    <strong>{t.label}:</strong> {t.hint}
                  </div>
                ))}
              </div>
            </div>

            <div className="sa-hint" style={{ color: 'var(--gray-500)' }}>
              <Info size={13} />
              Meta rechaza plantillas con solo variables, saludos vacíos o contenido engañoso.
              Escribe el mensaje completo y usa variables solo donde cambie el dato.
            </div>
          </div>

          <div>
            <PhonePreview
              template={previewTemplate}
              values={vars.map((_, i) => sampleOf(varAt(i), i))}
              headerUrl={form.headerHandle ? form.headerFileName : ''}
              contactName="Cliente"
            />
            <div className="pb-tpl-hint" style={{ textAlign: 'center', marginTop: 8 }}>
              Vista previa con datos de ejemplo
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving || uploading}>
            <Send size={14} /> {saving ? 'Enviando a Meta…' : 'Crear y enviar a aprobación'}
          </button>
        </div>
      </div>
    </div>
  );
}
