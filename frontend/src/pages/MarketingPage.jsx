import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell
} from 'recharts';
import {
  getCampaigns, createCampaign, updateCampaign, deleteCampaign, launchCampaign,
  getAutomations, createAutomation, updateAutomation, deleteAutomation,
  getMarketingAnalytics, previewSegment
} from '../services/api';
import { Megaphone, Zap, BarChart3, Plus, Play, Pause, Trash2, Users, Mail, MessageSquare, ChevronRight, Target, TrendingUp, Send } from 'lucide-react';

const TABS = [
  { id: 'campaigns',    label: 'Campañas',        Icon: Megaphone },
  { id: 'automations',  label: 'Automatizaciones', Icon: Zap },
  { id: 'analytics',    label: 'Analíticas',       Icon: BarChart3 },
];

const SERVICES = ['maritimo_import','maritimo_export','aereo_import','aereo_export','terrestre_usa','terrestre_nacional','despacho_aduanal','almacenaje','seguro_carga'];
const SERVICE_LABELS = { maritimo_import:'Marítimo Import', maritimo_export:'Marítimo Export', aereo_import:'Aéreo Import', aereo_export:'Aéreo Export', terrestre_usa:'Terrestre USA/CAN', terrestre_nacional:'Terrestre Nacional', despacho_aduanal:'Despacho Aduanal', almacenaje:'Almacenaje', seguro_carga:'Seguro de Carga' };
const STAGES = ['new','contacted','qualified','proposal','negotiation'];
const STAGE_LABELS = { new:'Nuevos', contacted:'Contactados', qualified:'Calificados', proposal:'Propuesta', negotiation:'Negociación' };

const STATUS_COLORS = { draft: '#9AA3AE', scheduled: '#2563EB', running: '#16A34A', paused: '#F59E0B', completed: '#7C3AED' };
const STATUS_LABELS = { draft: 'Borrador', scheduled: 'Programada', running: 'Activa', paused: 'Pausada', completed: 'Completada' };

const TRIGGER_LABELS = { stage_entered: 'Al entrar a etapa', days_inactive: 'Días sin contacto', score_above: 'Score mayor a', lead_created: 'Al crear lead', date_based: 'Por fecha' };
const ACTION_LABELS = { send_email: 'Enviar Email', send_whatsapp: 'Enviar WhatsApp', create_activity: 'Crear Actividad', notify_exec: 'Notificar Ejecutivo', change_stage: 'Cambiar Etapa' };

const DEFAULT_AUTOMATIONS = [
  { name: 'Follow-up post-cotización', trigger: { type: 'stage_entered', stages: ['proposal'] }, actions: [{ type: 'send_email', delay: 48, body: 'Seguimiento a propuesta enviada' }], isActive: true },
  { name: 'Reactivar leads dormidos', trigger: { type: 'days_inactive', value: 14 }, actions: [{ type: 'send_whatsapp', delay: 0, body: '¡Hola! ¿Tienes alguna necesidad de importación o exportación en la que podamos ayudarte?' }], isActive: true },
  { name: 'Bienvenida a lead nuevo', trigger: { type: 'lead_created' }, actions: [{ type: 'send_email', delay: 1, body: 'Bienvenido a ACON Internacional' }, { type: 'notify_exec', delay: 0 }], isActive: true },
  { name: 'Alerta de cierre inminente', trigger: { type: 'score_above', value: 80 }, actions: [{ type: 'notify_exec', delay: 0 }, { type: 'create_activity', delay: 0, body: 'Lead caliente — contactar inmediatamente' }], isActive: true },
];

function StatusBadge({ status }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${STATUS_COLORS[status]}18`, color: STATUS_COLORS[status] }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[status] }} />
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export default function MarketingPage({ toast }) {
  const [tab, setTab] = useState('campaigns');
  const [campaigns, setCampaigns] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [showNewAuto, setShowNewAuto] = useState(false);
  const [segmentPreview, setSegmentPreview] = useState(null);

  const [campaignForm, setCampaignForm] = useState({
    name: '', type: 'email', subject: '', body: '',
    segment: { services: [], stages: [], countries: [], minScore: 0 }
  });

  const [autoForm, setAutoForm] = useState({
    name: '', trigger: { type: 'stage_entered', stages: [], value: '' },
    actions: [{ type: 'send_email', delay: 0, body: '' }], isActive: true
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, aRes, anRes] = await Promise.all([getCampaigns(), getAutomations(), getMarketingAnalytics()]);
      setCampaigns(cRes.data.data || []);
      setAutomations(aRes.data.data || []);
      setAnalytics(anRes.data.data);
    } catch { toast('Error al cargar marketing', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handlePreviewSegment = async () => {
    try {
      const r = await previewSegment(campaignForm.segment);
      setSegmentPreview(r.data.data);
    } catch { toast('Error al previsualizar segmento', 'error'); }
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    try {
      await createCampaign(campaignForm);
      toast('Campaña creada', 'success');
      setShowNewCampaign(false);
      setCampaignForm({ name: '', type: 'email', subject: '', body: '', segment: { services: [], stages: [], countries: [], minScore: 0 } });
      setSegmentPreview(null);
      load();
    } catch { toast('Error al crear campaña', 'error'); }
  };

  const handleLaunch = async (id) => {
    try {
      const r = await launchCampaign(id);
      toast(r.data.data.message, 'success');
      load();
    } catch { toast('Error al lanzar campaña', 'error'); }
  };

  const handleDeleteCampaign = async (id) => {
    try { await deleteCampaign(id); toast('Campaña eliminada', 'success'); load(); }
    catch { toast('Error al eliminar', 'error'); }
  };

  const handleToggleAuto = async (auto) => {
    try {
      await updateAutomation(auto._id, { isActive: !auto.isActive });
      toast(`Automatización ${auto.isActive ? 'pausada' : 'activada'}`, 'success');
      load();
    } catch { toast('Error', 'error'); }
  };

  const handleCreateAuto = async (e) => {
    e.preventDefault();
    try {
      await createAutomation(autoForm);
      toast('Automatización creada', 'success');
      setShowNewAuto(false);
      load();
    } catch { toast('Error al crear automatización', 'error'); }
  };

  const seedDefaultAutomations = async () => {
    try {
      await Promise.all(DEFAULT_AUTOMATIONS.map(a => createAutomation(a)));
      toast('Automatizaciones predeterminadas creadas', 'success');
      load();
    } catch { toast('Error', 'error'); }
  };

  if (loading) return <div className="loading"><div className="spinner" />Cargando marketing...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Marketing</div>
          <div className="page-sub">Campañas, automatizaciones y analíticas para Freight Forwarding</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tab === 'campaigns' && <button className="btn btn-primary btn-sm" onClick={() => setShowNewCampaign(true)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Nueva Campaña</button>}
          {tab === 'automations' && <button className="btn btn-primary btn-sm" onClick={() => setShowNewAuto(true)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Nueva Automatización</button>}
        </div>
      </div>

      {/* KPI bar */}
      {analytics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Campañas activas', value: analytics.campaigns?.active || 0, Icon: Megaphone, color: '#F2641E' },
            { label: 'Emails enviados', value: analytics.totals?.sent || 0, Icon: Send, color: '#2563EB' },
            { label: 'Tasa de apertura', value: `${analytics.totals?.openRate || 0}%`, Icon: Mail, color: '#16A34A' },
            { label: 'Tasa de respuesta', value: `${analytics.totals?.replyRate || 0}%`, Icon: MessageSquare, color: '#7C3AED' },
            { label: 'Automatizaciones', value: analytics.automations?.active || 0, Icon: Zap, color: '#CA8A04' },
          ].map(({ label, value, Icon, color }) => (
            <div key={label} className="stat-card" style={{ padding: '14px 16px' }}>
              <div className="stat-icon" style={{ background: `${color}14`, color }}><Icon size={16} /></div>
              <div className="stat-label">{label}</div>
              <div className="stat-value" style={{ fontSize: 22 }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--gray-200)', marginBottom: 20 }}>
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 20px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: 'transparent', color: tab === id ? '#0B2545' : '#9AA3AE',
            borderBottom: tab === id ? '2px solid #F2641E' : '2px solid transparent',
          }}>
            <Icon size={14} strokeWidth={1.75} /> {label}
          </button>
        ))}
      </div>

      {/* ── CAMPAIGNS ── */}
      {tab === 'campaigns' && (
        <>
          {showNewCampaign && (
            <form onSubmit={handleCreateCampaign} className="card" style={{ marginBottom: 20, border: '1px solid #F2641E30' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0B2545', marginBottom: 16 }}>Nueva Campaña</div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Nombre de la campaña</label>
                  <input className="form-input" placeholder="Promo Flete Marítimo Q3 2025" value={campaignForm.name} onChange={e => setCampaignForm(f => ({...f, name: e.target.value}))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Canal</label>
                  <select className="form-select" value={campaignForm.type} onChange={e => setCampaignForm(f => ({...f, type: e.target.value}))}>
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="mixed">Email + WhatsApp</option>
                  </select>
                </div>
              </div>
              {campaignForm.type !== 'whatsapp' && (
                <div className="form-group">
                  <label className="form-label">Asunto</label>
                  <input className="form-input" placeholder="Tarifas especiales de flete marítimo desde China" value={campaignForm.subject} onChange={e => setCampaignForm(f => ({...f, subject: e.target.value}))} />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Mensaje</label>
                <textarea className="form-input" rows={4} placeholder="Hola {contacto}, en ACON Internacional contamos con tarifas competitivas para tu operación de {servicio}..." value={campaignForm.body} onChange={e => setCampaignForm(f => ({...f, body: e.target.value}))} required />
                <div style={{ fontSize: 11, color: '#9AA3AE', marginTop: 4 }}>Variables: {'{contacto}'}, {'{empresa}'}, {'{ejecutivo}'}</div>
              </div>

              {/* Segmentación */}
              <div style={{ fontWeight: 600, fontSize: 13, color: '#0B2545', marginBottom: 10, marginTop: 4 }}>Segmentación de audiencia</div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Servicios</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {SERVICES.map(s => (
                      <button key={s} type="button" onClick={() => {
                        const arr = campaignForm.segment.services;
                        setCampaignForm(f => ({...f, segment: {...f.segment, services: arr.includes(s) ? arr.filter(x => x !== s) : [...arr, s]}}));
                      }} style={{ padding: '4px 10px', borderRadius: 20, border: '1px solid', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: campaignForm.segment.services.includes(s) ? '#F2641E' : '#fff', color: campaignForm.segment.services.includes(s) ? '#fff' : '#5A6472', borderColor: campaignForm.segment.services.includes(s) ? '#F2641E' : '#E3E6EA' }}>
                        {SERVICE_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Etapas del pipeline</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {STAGES.map(s => (
                      <button key={s} type="button" onClick={() => {
                        const arr = campaignForm.segment.stages;
                        setCampaignForm(f => ({...f, segment: {...f.segment, stages: arr.includes(s) ? arr.filter(x => x !== s) : [...arr, s]}}));
                      }} style={{ padding: '4px 10px', borderRadius: 20, border: '1px solid', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: campaignForm.segment.stages.includes(s) ? '#0B2545' : '#fff', color: campaignForm.segment.stages.includes(s) ? '#fff' : '#5A6472', borderColor: campaignForm.segment.stages.includes(s) ? '#0B2545' : '#E3E6EA' }}>
                        {STAGE_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={handlePreviewSegment} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Target size={12} /> Previsualizar audiencia
                </button>
                {segmentPreview && (
                  <span style={{ fontSize: 13, color: '#16A34A', fontWeight: 700 }}>
                    {segmentPreview.count} leads en este segmento
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary">Crear Campaña</button>
                <button type="button" className="btn btn-ghost" onClick={() => { setShowNewCampaign(false); setSegmentPreview(null); }}>Cancelar</button>
              </div>
            </form>
          )}

          {campaigns.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <Megaphone size={40} color="#9AA3AE" />
                <p style={{ color: '#9AA3AE' }}>No hay campañas creadas aún.</p>
                <button className="btn btn-primary btn-sm" onClick={() => setShowNewCampaign(true)}><Plus size={13} /> Crear primera campaña</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {campaigns.map(c => (
                <div key={c._id} className="card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#0B2545' }}>{c.name}</div>
                        <StatusBadge status={c.status} />
                        <span style={{ fontSize: 11, background: '#F4F5F7', color: '#5A6472', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                          {c.type === 'email' ? '📧 Email' : c.type === 'whatsapp' ? '💬 WhatsApp' : '📧💬 Mixta'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 20, fontSize: 12, color: '#9AA3AE' }}>
                        <span>Enviados: <strong style={{ color: '#0B2545' }}>{c.sentCount || 0}</strong></span>
                        <span>Abiertos: <strong style={{ color: '#16A34A' }}>{c.openCount || 0}</strong></span>
                        <span>Respuestas: <strong style={{ color: '#F2641E' }}>{c.replyCount || 0}</strong></span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {c.status === 'draft' && (
                        <button className="btn btn-primary btn-sm" onClick={() => handleLaunch(c._id)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Play size={12} /> Lanzar
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteCampaign(c._id)} style={{ color: '#DC2626' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── AUTOMATIONS ── */}
      {tab === 'automations' && (
        <>
          {showNewAuto && (
            <form onSubmit={handleCreateAuto} className="card" style={{ marginBottom: 20, border: '1px solid #7C3AED30' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0B2545', marginBottom: 16 }}>Nueva Automatización</div>
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input className="form-input" placeholder="Follow-up post-propuesta" value={autoForm.name} onChange={e => setAutoForm(f => ({...f, name: e.target.value}))} required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Disparador (Trigger)</label>
                  <select className="form-select" value={autoForm.trigger.type} onChange={e => setAutoForm(f => ({...f, trigger: {...f.trigger, type: e.target.value}}))}>
                    {Object.entries(TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                {autoForm.trigger.type === 'days_inactive' && (
                  <div className="form-group">
                    <label className="form-label">Días sin actividad</label>
                    <input className="form-input" type="number" placeholder="7" value={autoForm.trigger.value} onChange={e => setAutoForm(f => ({...f, trigger: {...f.trigger, value: e.target.value}}))} />
                  </div>
                )}
                {autoForm.trigger.type === 'score_above' && (
                  <div className="form-group">
                    <label className="form-label">Score mínimo</label>
                    <input className="form-input" type="number" placeholder="75" value={autoForm.trigger.value} onChange={e => setAutoForm(f => ({...f, trigger: {...f.trigger, value: e.target.value}}))} />
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Acción</label>
                <select className="form-select" value={autoForm.actions[0]?.type} onChange={e => setAutoForm(f => ({...f, actions: [{...f.actions[0], type: e.target.value}]}))}>
                  {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {['send_email', 'send_whatsapp', 'create_activity'].includes(autoForm.actions[0]?.type) && (
                <div className="form-group">
                  <label className="form-label">Mensaje</label>
                  <textarea className="form-input" rows={3} value={autoForm.actions[0]?.body || ''} onChange={e => setAutoForm(f => ({...f, actions: [{...f.actions[0], body: e.target.value}]}))} />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Demora (horas después del trigger)</label>
                <input className="form-input" type="number" value={autoForm.actions[0]?.delay || 0} onChange={e => setAutoForm(f => ({...f, actions: [{...f.actions[0], delay: parseInt(e.target.value)}]}))} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary">Crear</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowNewAuto(false)}>Cancelar</button>
              </div>
            </form>
          )}

          {automations.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <Zap size={40} color="#9AA3AE" />
                <p style={{ color: '#9AA3AE' }}>No hay automatizaciones configuradas.</p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button className="btn btn-ghost btn-sm" onClick={seedDefaultAutomations}>Cargar plantillas ACON</button>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowNewAuto(true)}><Plus size={13} /> Crear</button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {automations.map(a => (
                <div key={a._id} className="card" style={{ padding: '14px 20px', borderLeft: `4px solid ${a.isActive ? '#7C3AED' : '#E3E6EA'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0B2545', marginBottom: 4 }}>{a.name}</div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#9AA3AE' }}>
                        <span>Trigger: <strong style={{ color: '#5A6472' }}>{TRIGGER_LABELS[a.trigger?.type] || a.trigger?.type}</strong></span>
                        <span>Acción: <strong style={{ color: '#5A6472' }}>{ACTION_LABELS[a.actions?.[0]?.type] || '—'}</strong></span>
                        <span>Ejecuciones: <strong style={{ color: '#F2641E' }}>{a.executionCount || 0}</strong></span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: a.isActive ? '#16A34A' : '#9AA3AE' }}>
                        {a.isActive ? 'Activa' : 'Inactiva'}
                      </span>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleToggleAuto(a)} style={{ display: 'flex', alignItems: 'center', gap: 4, color: a.isActive ? '#F59E0B' : '#16A34A' }}>
                        {a.isActive ? <Pause size={13} /> : <Play size={13} />}
                        {a.isActive ? 'Pausar' : 'Activar'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={async () => { await deleteAutomation(a._id); toast('Eliminada', 'success'); load(); }} style={{ color: '#DC2626' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── ANALYTICS ── */}
      {tab === 'analytics' && analytics && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <div style={{ fontWeight: 700, color: '#0B2545', marginBottom: 16 }}>Rendimiento de Campañas</div>
              {analytics.recentCampaigns?.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={analytics.recentCampaigns.map(c => ({ name: c.name?.slice(0, 12), enviados: c.sentCount || 0, abiertos: c.openCount || 0 }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: '#9AA3AE', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#9AA3AE', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="enviados" name="Enviados" fill="#2563EB" radius={[4,4,0,0]} />
                    <Bar dataKey="abiertos" name="Abiertos" fill="#16A34A" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9AA3AE', fontSize: 13 }}>
                  Lanza campañas para ver métricas
                </div>
              )}
            </div>

            <div className="card">
              <div style={{ fontWeight: 700, color: '#0B2545', marginBottom: 16 }}>Resumen de Automatizaciones</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'Total automaciones', value: analytics.automations?.total || 0, color: '#7C3AED' },
                  { label: 'Activas', value: analytics.automations?.active || 0, color: '#16A34A' },
                  { label: 'Total ejecuciones', value: analytics.automations?.totalExecutions || 0, color: '#F2641E' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: `${color}08`, borderRadius: 8, border: `1px solid ${color}20` }}>
                    <span style={{ fontSize: 13, color: '#5A6472' }}>{label}</span>
                    <span style={{ fontSize: 20, fontWeight: 800, color }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
