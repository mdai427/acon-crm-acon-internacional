import React, { useMemo, useState } from 'react';
import {
  Check, ChevronLeft, ChevronRight, X, Plus, PlusCircle, Eye, Sparkles,
  Building2, UserPlus, Search, Calculator, ArrowLeft,
} from 'lucide-react';
import { suggestQuote, createLead } from '../services/api';
import {
  SERVICE_TYPES, IS_MARITIME, DEFAULT_ITEMS, INCOTERMS,
  FREQUENT_PORTS, EMPTY_ROUTE,
} from '../constants/quotes';

// Asistente paso a paso para armar una cotización. Sustituye al formulario
// único que mostraba todo de golpe: cada paso pide sólo lo que hace falta y en
// el orden en que el asesor lo consigue (cliente → servicio → ruta → tarifas →
// condiciones → revisión).

const STEPS = [
  { id: 'cliente',     label: 'Cliente',     hint: '¿Para quién es la cotización?' },
  { id: 'servicio',    label: 'Servicio',    hint: '¿Qué tipo de servicio se cotiza?' },
  { id: 'ruta',        label: 'Ruta y carga',hint: '¿De dónde a dónde y qué se mueve?' },
  { id: 'tarifas',     label: 'Tarifas',     hint: '¿Cuánto cuesta?' },
  { id: 'condiciones', label: 'Condiciones', hint: 'Vigencia, notas y términos' },
  { id: 'resumen',     label: 'Revisión',    hint: 'Confirma y guarda' },
];

function Stepper({ step, maxVisited, onGoTo }) {
  return (
    <ol className="qw-steps">
      {STEPS.map((s, i) => {
        const state = step === i ? 'active' : i < step ? 'done' : '';
        return (
          <li key={s.id}>
            <button
              type="button"
              className={`qw-step ${state}`}
              disabled={i > maxVisited}
              onClick={() => onGoTo(i)}
            >
              <span className="qw-step-dot">{i < step ? <Check size={12} /> : i + 1}</span>
              <span className="qw-step-text">
                <span className="qw-step-label">{s.label}</span>
                <span className="qw-step-hint">{s.hint}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export default function QuoteWizard({ form, setForm, leads, user, saving, toast, onCancel, onSave, onSaveAndPreview, onLeadCreated }) {
  const [step, setStep] = useState(0);
  const [maxVisited, setMaxVisited] = useState(0);
  const [clientMode, setClientMode] = useState(form.lead ? 'existing' : 'new');
  const [leadSearch, setLeadSearch] = useState('');
  const [savingLead, setSavingLead] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  const f = (key, val) => setForm(p => ({ ...p, [key]: val }));
  const isMaritime = IS_MARITIME(form.serviceType);
  const service = SERVICE_TYPES.find(s => s.id === form.serviceType);

  // ── Cliente ──────────────────────────────────────────────────────────────
  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    const list = q
      ? leads.filter(l => `${l.company || ''} ${typeof l.contact === 'object' ? l.contact?.name || '' : l.contact || ''}`.toLowerCase().includes(q))
      : leads;
    return list.slice(0, 30);
  }, [leads, leadSearch]);

  const pickLead = (lead) => {
    const contactName = typeof lead.contact === 'object' ? lead.contact?.name : lead.contact;
    const email = typeof lead.contact === 'object' ? lead.contact?.email : lead.email;
    const phone = typeof lead.contact === 'object' ? lead.contact?.whatsapp : (lead.whatsapp || lead.phone);
    setForm(p => ({
      ...p,
      lead: lead._id,
      clientName: lead.company || '',
      contactName: contactName || '',
      clientEmail: email || '',
      clientPhone: phone || '',
    }));
  };

  const switchToNew = () => {
    setClientMode('new');
    setForm(p => ({ ...p, lead: '', clientName: '', contactName: '', clientEmail: '', clientPhone: '' }));
  };

  // Registra el cliente capturado a mano como lead del CRM, para no dejarlo
  // sólo dentro de la cotización.
  const handleSaveAsLead = async () => {
    if (!form.clientName || !form.contactName) {
      return toast('Para registrar el lead hacen falta empresa y contacto', 'error');
    }
    setSavingLead(true);
    try {
      const r = await createLead({
        company: form.clientName,
        contact: form.contactName,
        email: form.clientEmail,
        whatsapp: form.clientPhone,
        source: 'other',
      });
      const lead = r.data.data;
      f('lead', lead._id);
      onLeadCreated?.(lead);
      toast(`Lead "${lead.company}" creado y vinculado`, 'success');
    } catch (e) {
      toast(e.response?.data?.message || 'No se pudo crear el lead', 'error');
    } finally { setSavingLead(false); }
  };

  // ── Servicio ─────────────────────────────────────────────────────────────
  const handleServiceChange = (svc) => {
    setForm(p => ({
      ...p,
      serviceType: svc,
      items: (DEFAULT_ITEMS[svc] || []).map(i => ({ ...i })),
      routes: IS_MARITIME(svc) ? (p.routes?.length ? p.routes : [{ ...EMPTY_ROUTE }]) : [],
    }));
  };

  // ── Partidas y rutas ─────────────────────────────────────────────────────
  const setItem = (i, key, val) => {
    const items = [...form.items];
    items[i] = { ...items[i], [key]: key === 'qty' || key === 'unitPrice' ? Number(val) : val };
    f('items', items);
  };
  const addItem = () => f('items', [...form.items, { concept: '', unit: 'Global', qty: 1, unitPrice: 0, currency: 'USD' }]);
  const removeItem = (i) => f('items', form.items.filter((_, idx) => idx !== i));

  const setRoute = (i, key, val) => {
    const routes = [...form.routes];
    routes[i] = { ...routes[i], [key]: val };
    f('routes', routes);
  };
  const addRoute = () => f('routes', [...(form.routes || []), { ...EMPTY_ROUTE }]);
  const removeRoute = (i) => f('routes', form.routes.filter((_, idx) => idx !== i));

  const setAC = (key, val) => setForm(p => ({ ...p, additionalCharges: { ...p.additionalCharges, [key]: val } }));

  const totalUSD = form.items.filter(i => i.currency === 'USD').reduce((s, i) => s + (i.qty || 1) * (i.unitPrice || 0), 0);
  const totalMXN = form.items.filter(i => i.currency === 'MXN').reduce((s, i) => s + (i.qty || 1) * (i.unitPrice || 0), 0);

  const askAI = async () => {
    setAiLoading(true); setAiSuggestion(null);
    try {
      const r = await suggestQuote({
        serviceType: form.serviceType, origin: form.origin, destination: form.destination,
        containerType: form.containerType, weight: form.weight, commodity: form.commodity,
      });
      setAiSuggestion(r.data.data);
    } catch { toast('Error al consultar IA', 'error'); }
    finally { setAiLoading(false); }
  };

  // ── Navegación ───────────────────────────────────────────────────────────
  const stepError = (i) => {
    if (i === 0 && !form.clientName.trim()) return 'Indica la empresa o cliente antes de continuar.';
    if (i === 2 && !form.origin.trim() && !form.destination.trim()) return 'Captura al menos el origen o el destino.';
    return null;
  };

  const goTo = (i) => {
    if (i > step) {
      for (let s = step; s < i; s++) {
        const err = stepError(s);
        if (err) { setStep(s); return toast(err, 'error'); }
      }
    }
    setStep(i);
    setMaxVisited(m => Math.max(m, i));
  };

  const next = () => goTo(Math.min(step + 1, STEPS.length - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));

  const guardedSave = (fn) => {
    for (let s = 0; s < STEPS.length - 1; s++) {
      const err = stepError(s);
      if (err) { setStep(s); setMaxVisited(m => Math.max(m, s)); return toast(err, 'error'); }
    }
    fn();
  };

  return (
    <div className="page qw">
      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <ArrowLeft size={13} /> Volver a cotizaciones
          </button>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calculator size={19} style={{ color: 'var(--orange-500)' }} /> Nueva cotización
          </div>
          <div className="page-sub">Paso {step + 1} de {STEPS.length} · {STEPS[step].hint}</div>
        </div>
      </div>

      <div className="qw-layout">
        {/* Barra lateral de pasos */}
        <aside className="qw-side">
          <Stepper step={step} maxVisited={maxVisited} onGoTo={goTo} />

          {(totalUSD > 0 || totalMXN > 0 || form.clientName) && (
            <div className="qw-recap">
              <div className="qw-recap-title">Resumen</div>
              {form.clientName && <div className="qw-recap-row"><span>Cliente</span><strong>{form.clientName}</strong></div>}
              {service && <div className="qw-recap-row"><span>Servicio</span><strong>{service.label}</strong></div>}
              {(form.origin || form.destination) && (
                <div className="qw-recap-row"><span>Ruta</span><strong>{form.origin || '—'} → {form.destination || '—'}</strong></div>
              )}
              {totalUSD > 0 && <div className="qw-recap-row"><span>Total USD</span><strong>{totalUSD.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong></div>}
              {totalMXN > 0 && <div className="qw-recap-row"><span>Total MXN</span><strong>{totalMXN.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong></div>}
            </div>
          )}
        </aside>

        {/* Contenido del paso */}
        <section className="card qw-panel">
          {/* ── 1. Cliente ── */}
          {step === 0 && (
            <>
              <div className="qw-panel-title">¿Para quién es esta cotización?</div>
              <div className="qw-tabs">
                <button type="button" className={`qw-tab ${clientMode === 'existing' ? 'active' : ''}`} onClick={() => setClientMode('existing')}>
                  <Building2 size={14} /> Cliente existente
                </button>
                <button type="button" className={`qw-tab ${clientMode === 'new' ? 'active' : ''}`} onClick={switchToNew}>
                  <UserPlus size={14} /> Contacto nuevo
                </button>
              </div>

              {clientMode === 'existing' ? (
                <>
                  <div style={{ position: 'relative', marginBottom: 10 }}>
                    <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
                    <input className="form-input" style={{ paddingLeft: 30 }} placeholder="Buscar por empresa o contacto..."
                      value={leadSearch} onChange={e => setLeadSearch(e.target.value)} />
                  </div>
                  <div className="qw-lead-list">
                    {filteredLeads.length === 0 && (
                      <div className="qw-empty">Sin resultados. Usa “Contacto nuevo” para capturarlo.</div>
                    )}
                    {filteredLeads.map(l => {
                      const contactName = typeof l.contact === 'object' ? l.contact?.name : l.contact;
                      return (
                        <button key={l._id} type="button" className={`qw-lead ${form.lead === l._id ? 'selected' : ''}`} onClick={() => pickLead(l)}>
                          <span className="qw-lead-avatar">{(l.company || '?').slice(0, 2).toUpperCase()}</span>
                          <span>
                            <span className="qw-lead-name">{l.company}</span>
                            {contactName && <span className="qw-lead-sub">{contactName}</span>}
                          </span>
                          {form.lead === l._id && <Check size={15} style={{ marginLeft: 'auto', color: 'var(--orange-500)' }} />}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="qw-note">Captura los datos del cliente. Si quieres, puedes registrarlo también como lead del CRM.</div>
              )}

              <div className="form-row" style={{ marginTop: 14 }}>
                <div className="form-group">
                  <label className="form-label">Empresa / Cliente *</label>
                  <input className="form-input" value={form.clientName} onChange={e => f('clientName', e.target.value)} placeholder="Nombre de la empresa" />
                </div>
                <div className="form-group">
                  <label className="form-label">Nombre de contacto</label>
                  <input className="form-input" value={form.contactName} onChange={e => f('contactName', e.target.value)} placeholder="Attn:" />
                </div>
              </div>
              <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1.4fr' }}>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.clientEmail} onChange={e => f('clientEmail', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono / WhatsApp</label>
                  <input className="form-input" value={form.clientPhone} onChange={e => f('clientPhone', e.target.value)} placeholder="+521..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Dirección del cliente</label>
                  <input className="form-input" value={form.clientAddress} onChange={e => f('clientAddress', e.target.value)} placeholder="Parque Industrial..." />
                </div>
              </div>

              {clientMode === 'new' && !form.lead && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleSaveAsLead} disabled={savingLead}
                  style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <UserPlus size={13} /> {savingLead ? 'Creando...' : 'Registrar también como lead del CRM'}
                </button>
              )}
              {clientMode === 'new' && form.lead && (
                <div className="qw-ok"><Check size={13} /> Cliente vinculado a un lead del CRM.</div>
              )}
            </>
          )}

          {/* ── 2. Servicio ── */}
          {step === 1 && (
            <>
              <div className="qw-panel-title">¿Qué servicio vas a cotizar?</div>
              <div className="qw-note">Al elegir el servicio cargamos las partidas típicas; podrás ajustarlas en el paso de tarifas.</div>
              <div className="qw-service-grid">
                {SERVICE_TYPES.map(s => (
                  <button key={s.id} type="button"
                    className={`qw-service ${form.serviceType === s.id ? 'selected' : ''}`}
                    onClick={() => handleServiceChange(s.id)}>
                    <s.Icon size={20} strokeWidth={1.6} color={s.color} />
                    <span className="qw-service-label">{s.label}</span>
                    <span className="qw-service-hint">{s.hint}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── 3. Ruta y carga ── */}
          {step === 2 && (
            <>
              <div className="qw-panel-title">Ruta y carga</div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Origen general</label>
                  <input className="form-input" list="ports" value={form.origin} onChange={e => f('origin', e.target.value)} placeholder="País / ciudad" />
                </div>
                <div className="form-group">
                  <label className="form-label">Destino general</label>
                  <input className="form-input" list="ports" value={form.destination} onChange={e => f('destination', e.target.value)} placeholder="País / ciudad" />
                </div>
              </div>
              <datalist id="ports">{FREQUENT_PORTS.map(p => <option key={p} value={p} />)}</datalist>

              <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">Incoterm</label>
                  <select className="form-select" value={form.incoterm} onChange={e => f('incoterm', e.target.value)}>
                    {INCOTERMS.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Naviera / Carrier</label>
                  <input className="form-input" value={form.carrier} onChange={e => f('carrier', e.target.value)} placeholder="Maersk..." />
                </div>
              </div>

              <div className="section-title" style={{ marginTop: 6 }}><span>Detalle de la carga</span></div>
              <div className="form-row" style={{ gridTemplateColumns: '2fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">Mercancía</label>
                  <input className="form-input" value={form.commodity} onChange={e => f('commodity', e.target.value)} placeholder="Descripción" />
                </div>
                <div className="form-group">
                  <label className="form-label">Contenedor / equipo</label>
                  <input className="form-input" value={form.containerType} onChange={e => f('containerType', e.target.value)} placeholder="20ft, 40ft..." />
                </div>
              </div>
              <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">Peso (kg)</label>
                  <input className="form-input" type="number" value={form.weight} onChange={e => f('weight', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Volumen (CBM)</label>
                  <input className="form-input" type="number" value={form.volume} onChange={e => f('volume', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Bultos / unidades</label>
                  <input className="form-input" type="number" value={form.units} onChange={e => f('units', e.target.value)} />
                </div>
              </div>
            </>
          )}

          {/* ── 4. Tarifas ── */}
          {step === 3 && (
            <>
              <div className="qw-panel-title">Tarifas y cargos</div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                <button type="button" className="btn btn-ghost btn-sm" disabled={aiLoading} onClick={askAI}
                  style={{ color: '#7C3AED', borderColor: '#DDD6FE', background: '#F5F3FF', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Sparkles size={13} /> {aiLoading ? 'Consultando IA...' : 'Sugerir precio con IA'}
                </button>
              </div>

              {aiSuggestion && (
                <div className="qw-ai">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#6D28D9', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Sparkles size={14} /> Sugerencia IA {aiSuggestion.source === 'heuristic' ? '(heurística)' : ''}
                    </div>
                    <button onClick={() => setAiSuggestion(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}><X size={14} /></button>
                  </div>
                  <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
                    {aiSuggestion.suggestedPriceUSD && (
                      <div>
                        <div style={{ fontSize: 10, color: '#6D28D9', fontWeight: 600 }}>PRECIO SUGERIDO</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#4C1D95' }}>${aiSuggestion.suggestedPriceUSD?.toLocaleString()} USD</div>
                        {aiSuggestion.priceRangeMin && <div style={{ fontSize: 11, color: '#7C3AED' }}>${aiSuggestion.priceRangeMin?.toLocaleString()} – ${aiSuggestion.priceRangeMax?.toLocaleString()} USD</div>}
                      </div>
                    )}
                    <div>
                      {aiSuggestion.recommendedCarrier && <div style={{ fontSize: 12 }}><strong>Carrier recomendado:</strong> {aiSuggestion.recommendedCarrier}</div>}
                      {aiSuggestion.transitDays && <div style={{ fontSize: 12 }}><strong>Tránsito estimado:</strong> {aiSuggestion.transitDays}</div>}
                    </div>
                  </div>
                  {aiSuggestion.reasoning && <div style={{ fontSize: 12, color: '#4C1D95', marginTop: 8 }}>{aiSuggestion.reasoning}</div>}
                  {aiSuggestion.tips?.length > 0 && (
                    <ul style={{ margin: '8px 0 0', paddingLeft: 16 }}>
                      {aiSuggestion.tips.map((t, i) => <li key={i} style={{ fontSize: 11, color: '#6D28D9' }}>{t}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {isMaritime && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div className="section-title" style={{ margin: 0 }}>
                      <span>Tabla de rutas y tarifas</span>
                      <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 400 }}> · Origen → POL → POD</span>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={addRoute} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <PlusCircle size={13} /> Agregar ruta
                    </button>
                  </div>

                  <div className="qw-table-wrap">
                    <div className="qw-routes-head">
                      <span>Origen</span><span>POL</span><span>POD</span><span>Tránsito</span>
                      <span>20'</span><span style={{ color: '#F2641E' }}>40'</span><span>40'HC</span><span>Moneda</span><span />
                    </div>
                    {(form.routes || []).map((route, i) => (
                      <div key={i} className="qw-routes-row">
                        <input className="form-input" value={route.origen} onChange={e => setRoute(i, 'origen', e.target.value)} placeholder="Vitória..." list="ports" />
                        <input className="form-input" value={route.pol} onChange={e => setRoute(i, 'pol', e.target.value)} placeholder="Vitória..." list="ports" />
                        <input className="form-input" value={route.pod} onChange={e => setRoute(i, 'pod', e.target.value)} placeholder="Manzanillo..." list="ports" />
                        <input className="form-input" value={route.transitDays} onChange={e => setRoute(i, 'transitDays', e.target.value)} placeholder="21-24 días" />
                        <input className="form-input" type="number" value={route.price20} onChange={e => setRoute(i, 'price20', e.target.value)} placeholder="2190" />
                        <input className="form-input" style={{ borderColor: '#F2641E' }} type="number" value={route.price40} onChange={e => setRoute(i, 'price40', e.target.value)} placeholder="3290" />
                        <input className="form-input" type="number" value={route.price40HC} onChange={e => setRoute(i, 'price40HC', e.target.value)} placeholder="3950" />
                        <select className="form-select" value={route.currency} onChange={e => setRoute(i, 'currency', e.target.value)}>
                          <option value="USD">USD</option><option value="MXN">MXN</option>
                        </select>
                        <button onClick={() => removeRoute(i)} className="qw-row-del"><X size={14} /></button>
                      </div>
                    ))}
                  </div>

                  <div className="qw-charges">
                    <div className="qw-charges-title">Cargos adicionales</div>
                    <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr', marginBottom: 0 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">DOC FEE / BL (USD)</label>
                        <input className="form-input" type="number" value={form.additionalCharges?.docFee || ''} onChange={e => setAC('docFee', Number(e.target.value))} placeholder="120" />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Release FEE / CNTR (USD)</label>
                        <input className="form-input" type="number" value={form.additionalCharges?.releaseFee || ''} onChange={e => setAC('releaseFee', Number(e.target.value))} placeholder="55" />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Carta garantía</label>
                        <input className="form-input" value={form.additionalCharges?.cartaGarantia || ''} onChange={e => setAC('cartaGarantia', e.target.value)} placeholder="Aplicable" />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Días libres de demoras</label>
                        <input className="form-input" type="number" value={form.additionalCharges?.freeDays || ''} onChange={e => setAC('freeDays', Number(e.target.value))} placeholder="21" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div className="section-title" style={{ margin: 0 }}>
                  <span>Partidas / conceptos</span>
                  {isMaritime && <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 400 }}> · opcional, cargos detallados</span>}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Plus size={13} /> Agregar línea
                </button>
              </div>

              <div className="qw-table-wrap">
                <div className="qw-items-head">
                  <span>Concepto</span><span>Unidad</span><span>Cant.</span><span>P. unitario</span><span>Moneda</span><span />
                </div>
                {form.items.map((item, i) => (
                  <div key={i} className="qw-items-row">
                    <input className="form-input" value={item.concept} onChange={e => setItem(i, 'concept', e.target.value)} placeholder="Concepto..." />
                    <input className="form-input" value={item.unit} onChange={e => setItem(i, 'unit', e.target.value)} />
                    <input className="form-input" type="number" value={item.qty} onChange={e => setItem(i, 'qty', e.target.value)} />
                    <input className="form-input" type="number" value={item.unitPrice} onChange={e => setItem(i, 'unitPrice', e.target.value)} placeholder="0.00" />
                    <select className="form-select" value={item.currency} onChange={e => setItem(i, 'currency', e.target.value)}>
                      <option value="USD">USD</option><option value="MXN">MXN</option>
                    </select>
                    <button onClick={() => removeItem(i)} className="qw-row-del"><X size={14} /></button>
                  </div>
                ))}
              </div>

              {(totalUSD > 0 || totalMXN > 0) && (
                <div className="qw-totals">
                  {totalUSD > 0 && (
                    <div style={{ textAlign: 'right' }}>
                      <div className="qw-totals-label">Total USD</div>
                      <div className="qw-totals-value">{totalUSD.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                    </div>
                  )}
                  {totalMXN > 0 && (
                    <div style={{ textAlign: 'right' }}>
                      <div className="qw-totals-label">Total MXN</div>
                      <div className="qw-totals-value" style={{ color: 'var(--orange-500)' }}>{totalMXN.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── 5. Condiciones ── */}
          {step === 4 && (
            <>
              <div className="qw-panel-title">Condiciones comerciales</div>
              <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">Vigencia (días)</label>
                  <input className="form-input" type="number" value={form.validity} onChange={e => f('validity', Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo de cambio (USD→MXN)</label>
                  <input className="form-input" type="number" value={form.exchangeRate} onChange={e => f('exchangeRate', Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Moneda principal</label>
                  <select className="form-select" value={form.currency} onChange={e => f('currency', e.target.value)}>
                    <option value="USD">USD</option><option value="MXN">MXN</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Sales Rep</label>
                  <input className="form-input" value={form.salesRep} onChange={e => f('salesRep', e.target.value)} placeholder={user?.name || 'Nombre del vendedor'} />
                </div>
                <div className="form-group">
                  <label className="form-label">Condiciones de pago</label>
                  <input className="form-input" value={form.paymentTerms} onChange={e => f('paymentTerms', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Comentarios / notas</label>
                <textarea className="form-input" rows={3} value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="Condiciones especiales, observaciones..." />
              </div>
              <div className="form-group">
                <label className="form-label">Términos y condiciones</label>
                <textarea className="form-input" rows={5} value={form.terms} onChange={e => f('terms', e.target.value)} />
              </div>
            </>
          )}

          {/* ── 6. Revisión ── */}
          {step === 5 && (
            <>
              <div className="qw-panel-title">Revisa antes de guardar</div>
              <div className="qw-review">
                <ReviewBlock title="Cliente" onEdit={() => goTo(0)} rows={[
                  ['Empresa', form.clientName],
                  ['Contacto', form.contactName],
                  ['Email', form.clientEmail],
                  ['Teléfono', form.clientPhone],
                  ['Lead vinculado', form.lead ? 'Sí' : 'No'],
                ]} />
                <ReviewBlock title="Servicio" onEdit={() => goTo(1)} rows={[
                  ['Tipo', service?.label],
                  ['Incoterm', form.incoterm],
                  ['Carrier', form.carrier],
                ]} />
                <ReviewBlock title="Ruta y carga" onEdit={() => goTo(2)} rows={[
                  ['Ruta', form.origin || form.destination ? `${form.origin || '—'} → ${form.destination || '—'}` : ''],
                  ['Mercancía', form.commodity],
                  ['Equipo', form.containerType],
                  ['Peso / volumen', [form.weight && `${form.weight} kg`, form.volume && `${form.volume} CBM`].filter(Boolean).join(' · ')],
                ]} />
                <ReviewBlock title="Tarifas" onEdit={() => goTo(3)} rows={[
                  ['Partidas', `${form.items.length}`],
                  isMaritime && ['Rutas FCL', `${form.routes?.length || 0}`],
                  totalUSD > 0 && ['Total USD', totalUSD.toLocaleString('es-MX', { minimumFractionDigits: 2 })],
                  totalMXN > 0 && ['Total MXN', totalMXN.toLocaleString('es-MX', { minimumFractionDigits: 2 })],
                ].filter(Boolean)} />
                <ReviewBlock title="Condiciones" onEdit={() => goTo(4)} rows={[
                  ['Vigencia', `${form.validity} días`],
                  ['Tipo de cambio', `$${form.exchangeRate}`],
                  ['Pago', form.paymentTerms],
                  ['Notas', form.notes],
                ]} />
              </div>
              {totalUSD === 0 && totalMXN === 0 && !(form.routes || []).some(r => r.price20 || r.price40 || r.price40HC) && (
                <div className="qw-warn">Aún no capturaste ninguna tarifa. Puedes guardar como borrador y completarla después.</div>
              )}
            </>
          )}

          {/* Navegación */}
          <div className="qw-nav">
            <button className="btn btn-ghost" onClick={step === 0 ? onCancel : back} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <ChevronLeft size={14} /> {step === 0 ? 'Cancelar' : 'Atrás'}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              {step === STEPS.length - 1 ? (
                <>
                  <button className="btn btn-ghost" disabled={saving} onClick={() => guardedSave(onSaveAndPreview)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Eye size={14} /> Guardar y previsualizar
                  </button>
                  <button className="btn btn-primary" disabled={saving} onClick={() => guardedSave(onSave)}>
                    {saving ? 'Guardando...' : 'Guardar cotización'}
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={next} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  Continuar <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ReviewBlock({ title, rows, onEdit }) {
  const visible = rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
  return (
    <div className="qw-review-block">
      <div className="qw-review-head">
        <span>{title}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>Editar</button>
      </div>
      {visible.length === 0 ? (
        <div className="qw-empty">Sin datos</div>
      ) : visible.map(([k, v]) => (
        <div key={k} className="qw-review-row"><span>{k}</span><strong>{v}</strong></div>
      ))}
    </div>
  );
}
