import React, { useMemo, useState } from 'react';
import { X, Check, ChevronRight, ChevronLeft, Send, Phone, ExternalLink } from 'lucide-react';
import { sendMetaTemplate } from '../services/api';

// Asistente de envío de plantillas de WhatsApp, al estilo de las plataformas
// grandes: 1) elegir plantilla → 2) llenar variables → 3) vista previa en un
// teléfono y enviar. Las plantillas llegan aprobadas desde Meta con sus
// componentes (header, body, botones) y aquí solo se rellenan las variables.

const STEPS = ['Elegir plantilla', 'Llenar variables', 'Vista previa y envío'];

// Variables {{1}}, {{2}}… de un texto de plantilla, en orden y sin duplicar.
const extractVars = (text) => {
  const found = [...String(text || '').matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]));
  return [...new Set(found)].sort((a, b) => a - b);
};

// Sustituye {{n}} por los valores capturados (o deja el marcador si falta).
const fill = (text, values) =>
  String(text || '').replace(/\{\{(\d+)\}\}/g, (_, n) => values[n - 1] || `{{${n}}}`);

// Campos del lead que se pueden insertar con un clic en cualquier variable.
const LEAD_CHIPS = (lead) => [
  { label: 'Empresa', value: lead?.company || '' },
  { label: 'Contacto', value: (typeof lead?.contact === 'object' ? lead.contact?.name : lead?.contact) || '' },
].filter(c => c.value);

function Stepper({ step }) {
  return (
    <div className="waw-steps">
      {STEPS.map((label, i) => (
        <React.Fragment key={label}>
          {i > 0 && <div className={`waw-step-line${step > i - 1 ? ' done' : ''}`} />}
          <div className={`waw-step${step === i ? ' active' : ''}${step > i ? ' done' : ''}`}>
            <span className="waw-step-dot">{step > i ? <Check size={11} /> : i + 1}</span>
            <span className="waw-step-label">{label}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// Vista previa estilo WhatsApp del contenido ya rellenado.
function PhonePreview({ template, values, headerUrl, contactName }) {
  const header = template?.components?.find(c => c.type === 'HEADER');
  const body = template?.components?.find(c => c.type === 'BODY');
  const footer = template?.components?.find(c => c.type === 'FOOTER');
  const buttons = template?.components?.find(c => c.type === 'BUTTONS')?.buttons || [];

  return (
    <div className="waw-phone">
      <div className="waw-phone-bar">
        <ChevronLeft size={15} />
        <span className="waw-phone-avatar">{(contactName || 'C').slice(0, 1).toUpperCase()}</span>
        <span className="waw-phone-name">{contactName || 'Cliente'}</span>
        <Phone size={13} style={{ marginLeft: 'auto' }} />
      </div>
      <div className="waw-phone-body">
        <div className="waw-phone-day">Hoy</div>
        <div className="waw-bubble">
          {header?.format === 'TEXT' && (
            <div className="waw-bubble-header">{fill(header.text, values)}</div>
          )}
          {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(header?.format) && (
            <div className="waw-bubble-media">
              {headerUrl
                ? <span title={headerUrl}>📎 {header.format === 'IMAGE' ? 'Imagen' : header.format === 'VIDEO' ? 'Video' : 'Documento'} adjunto</span>
                : <span>▶ {header.format.toLowerCase()} (falta URL)</span>}
            </div>
          )}
          <div className="waw-bubble-text">{fill(body?.text, values)}</div>
          {footer?.text && <div className="waw-bubble-footer">{footer.text}</div>}
          <div className="waw-bubble-time">
            {new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
          </div>
          {buttons.length > 0 && (
            <div className="waw-bubble-buttons">
              {buttons.map((b, i) => (
                <div key={i} className="waw-bubble-btn">
                  {b.type === 'URL' ? <ExternalLink size={12} /> : <Phone size={12} />} {b.text}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WaTemplateWizard({ templates, lead, phone, onClose, onSent, toast }) {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState(null);
  const [values, setValues] = useState([]);
  const [headerUrl, setHeaderUrl] = useState('');
  const [sending, setSending] = useState(false);

  const body = selected?.components?.find(c => c.type === 'BODY');
  const header = selected?.components?.find(c => c.type === 'HEADER');
  const vars = useMemo(() => extractVars(body?.text), [body]);
  const needsMedia = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(header?.format);
  const contactName = (typeof lead?.contact === 'object' ? lead.contact?.name : lead?.contact) || lead?.company;

  const pick = (tpl) => {
    setSelected(tpl);
    setValues(Array(extractVars(tpl.components?.find(c => c.type === 'BODY')?.text).length).fill(''));
    setHeaderUrl('');
    setStep(1);
  };

  const canContinue = step !== 1
    || (values.every(v => v.trim()) && (!needsMedia || headerUrl.trim()));

  const handleSend = async () => {
    setSending(true);
    try {
      const components = [];
      if (needsMedia && headerUrl) {
        const tipo = header.format.toLowerCase();
        components.push({ type: 'header', parameters: [{ type: tipo, [tipo]: { link: headerUrl } }] });
      }
      if (values.length) {
        components.push({ type: 'body', parameters: values.map(text => ({ type: 'text', text })) });
      }
      await sendMetaTemplate({
        to: phone,
        templateName: selected.name,
        languageCode: selected.language,
        components,
        leadId: lead?._id,
      });
      toast('Plantilla enviada', 'success');
      onSent?.({ template: selected, preview: fill(body?.text, values) });
      onClose();
    } catch (e) {
      toast(e.response?.data?.message || 'Error al enviar la plantilla', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal waw-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Enviar plantilla de WhatsApp</div>
          <button className="modal-close" onClick={onClose}><X size={17} /></button>
        </div>

        <Stepper step={step} />

        {/* Paso 1: elegir */}
        {step === 0 && (
          <div className="waw-list">
            {!templates.length && (
              <div className="waw-empty">
                No hay plantillas aprobadas. Se crean en Meta Business Suite y, una vez
                aprobadas, aparecen aquí solas.
              </div>
            )}
            {templates.map(t => {
              const tBody = t.components?.find(c => c.type === 'BODY');
              const nVars = extractVars(tBody?.text).length;
              return (
                <button key={t.name + t.language} className="waw-item" onClick={() => pick(t)}>
                  <div className="waw-item-head">
                    <strong>{t.name}</strong>
                    <span>{t.language}{nVars ? ` · ${nVars} variable(s)` : ''}</span>
                  </div>
                  <div className="waw-item-body">{tBody?.text}</div>
                  <ChevronRight size={15} className="waw-item-go" />
                </button>
              );
            })}
          </div>
        )}

        {/* Paso 2: variables */}
        {step === 1 && selected && (
          <div className="waw-map">
            <div className="waw-map-form">
              <div className="waw-map-title">Llenar variables</div>
              <div className="waw-map-sub">
                El texto es el aprobado por Meta; solo se rellenan sus variables.
              </div>

              {needsMedia && (
                <label className="waw-field">
                  <span>Encabezado ({header.format.toLowerCase()}) — URL pública</span>
                  <input value={headerUrl} placeholder="https://…"
                    onChange={e => setHeaderUrl(e.target.value)} />
                </label>
              )}

              {vars.map((n, i) => (
                <label key={n} className="waw-field">
                  <span>{'{{'}{n}{'}}'}</span>
                  <input
                    value={values[i] || ''}
                    placeholder={`Contenido para {{${n}}}`}
                    onChange={e => setValues(vs => vs.map((v, idx) => (idx === i ? e.target.value : v)))}
                  />
                  <div className="waw-chips">
                    {LEAD_CHIPS(lead).map(c => (
                      <button key={c.label} type="button" className="waw-chip"
                        onClick={() => setValues(vs => vs.map((v, idx) => (idx === i ? c.value : v)))}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </label>
              ))}
              {!vars.length && !needsMedia && (
                <div className="waw-map-sub">Esta plantilla no tiene variables: lista para enviar.</div>
              )}
            </div>
            <PhonePreview template={selected} values={values} headerUrl={headerUrl} contactName={contactName} />
          </div>
        )}

        {/* Paso 3: confirmación */}
        {step === 2 && selected && (
          <div className="waw-map">
            <div className="waw-map-form">
              <div className="waw-map-title">Listo para enviar</div>
              <div className="waw-map-sub">
                Se enviará <strong>{selected.name}</strong> ({selected.language}) al número{' '}
                <strong>{phone}</strong>{lead?.company ? <> de <strong>{lead.company}</strong></> : null}.
              </div>
            </div>
            <PhonePreview template={selected} values={values} headerUrl={headerUrl} contactName={contactName} />
          </div>
        )}

        {/* Navegación */}
        <div className="modal-actions">
          {step > 0 && (
            <button className="btn btn-ghost" onClick={() => setStep(s => s - 1)} disabled={sending}>
              <ChevronLeft size={14} /> Atrás
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose} style={{ marginLeft: 'auto' }}>Cancelar</button>
          {step === 1 && (
            <button className="btn btn-primary" onClick={() => setStep(2)} disabled={!canContinue}>
              Siguiente <ChevronRight size={14} />
            </button>
          )}
          {step === 2 && (
            <button className="btn btn-primary" onClick={handleSend} disabled={sending}>
              <Send size={14} /> {sending ? 'Enviando…' : 'Enviar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
