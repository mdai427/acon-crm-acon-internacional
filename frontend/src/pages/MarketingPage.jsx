import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import {
  getCampaigns, createCampaign, updateCampaign, deleteCampaign, launchCampaign,
  getAutomations, createAutomation, updateAutomation, deleteAutomation,
  getMarketingAnalytics, previewSegment,
  getAdPlatformStatus, getMetaAdsUrl, getLinkedInAdsUrl, getGoogleAdsUrl,
  disconnectAdPlatform, getMetaAdAccounts, getLinkedInAdAccounts, createAdCampaign,
} from '../services/api';
import {
  Megaphone, Zap, BarChart3, Plus, Play, Pause, Trash2, Mail,
  MessageSquare, Target, Send, Radio, Link2, Link2Off, ExternalLink,
  RefreshCw, ChevronDown, ChevronUp, Globe
} from 'lucide-react';

const TABS = [
  { id: 'campaigns',    label: 'Campañas',        Icon: Megaphone },
  { id: 'automations',  label: 'Automatizaciones', Icon: Zap },
  { id: 'adchannels',   label: 'Canales Publicitarios', Icon: Radio },
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

// Ad platform config
const AD_PLATFORMS = [
  {
    id: 'meta_ads',
    name: 'Meta Ads',
    subtitle: 'Facebook & Instagram',
    logo: '🔵',
    color: '#1877F2',
    bg: '#1877F214',
    description: 'Campañas de generación de leads en Facebook e Instagram para importadores y exportadores.',
    scopes: ['ads_management', 'ads_read', 'business_management'],
    envVars: ['META_APP_ID', 'META_APP_SECRET'],
  },
  {
    id: 'linkedin_ads',
    name: 'LinkedIn Ads',
    subtitle: 'LinkedIn Campaign Manager',
    logo: '🔷',
    color: '#0A66C2',
    bg: '#0A66C214',
    description: 'Llega a tomadores de decisión en empresas importadoras y exportadoras B2B.',
    scopes: ['r_ads', 'w_organization_social', 'rw_ads'],
    envVars: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  },
  {
    id: 'google_ads',
    name: 'Google Ads',
    subtitle: 'Google Campaign Manager',
    logo: '🔴',
    color: '#EA4335',
    bg: '#EA433514',
    description: 'Search, Display y YouTube Ads para captar empresas buscando servicios logísticos.',
    scopes: ['adwords'],
    envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  },
];

const OBJECTIVES_META = ['LEAD_GENERATION','LINK_CLICKS','BRAND_AWARENESS','REACH','TRAFFIC','CONVERSIONS'];
const OBJECTIVES_LI   = ['LEAD_GENERATION','WEBSITE_TRAFFIC','BRAND_AWARENESS','ENGAGEMENT'];
const OBJECTIVES_GADS = ['LEADS','WEBSITE_TRAFFIC','BRAND_AWARENESS','PRODUCT_AND_BRAND_CONSIDERATION'];

function StatusBadge({ status }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${STATUS_COLORS[status]}18`, color: STATUS_COLORS[status] }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[status] }} />
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function ConnectedBadge({ email }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#16A34A14', color: '#16A34A' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A' }} /> Conectado {email ? `· ${email}` : ''}
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

  // Ad channels state
  const [adStatus, setAdStatus] = useState([]);
  const [adAccounts, setAdAccounts] = useState({ meta_ads: [], linkedin_ads: [] });
  const [expandedPlatform, setExpandedPlatform] = useState(null);
  const [adCampaignForm, setAdCampaignForm] = useState({
    platform: '', name: '', objective: 'LEAD_GENERATION',
    dailyBudget: 50, currency: 'USD', adAccountId: '',
    startDate: '', headline: '', description: '', targetUrl: ''
  });
  const [showAdCampaignForm, setShowAdCampaignForm] = useState(false);

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

  const loadAdStatus = useCallback(async () => {
    try {
      const r = await getAdPlatformStatus();
      setAdStatus(r.data.data || []);
    } catch { /* silently */ }
  }, []);

  useEffect(() => { load(); loadAdStatus(); }, [load, loadAdStatus]);

  // Handle OAuth redirect params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    const connected = params.get('connected');
    const error = params.get('error');
    if (tabParam === 'ads') setTab('adchannels');
    if (connected) { toast(`✅ ${connected.replace('_', ' ')} conectado correctamente`, 'success'); loadAdStatus(); }
    if (error) toast(`Error al conectar: ${error.replace(/_/g, ' ')}`, 'error');
    if (connected || error) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const handleConnect = async (platformId) => {
    try {
      let r;
      if (platformId === 'meta_ads') r = await getMetaAdsUrl();
      else if (platformId === 'linkedin_ads') r = await getLinkedInAdsUrl();
      else if (platformId === 'google_ads') r = await getGoogleAdsUrl();
      window.location.href = r.data.data.url;
    } catch { toast('Error al iniciar conexión', 'error'); }
  };

  const handleDisconnect = async (platformId) => {
    try {
      await disconnectAdPlatform(platformId);
      toast('Desconectado', 'success');
      setAdStatus(s => s.filter(i => i.provider !== platformId));
    } catch { toast('Error al desconectar', 'error'); }
  };

  const handleLoadAccounts = async (platformId) => {
    try {
      let r;
      if (platformId === 'meta_ads') r = await getMetaAdAccounts();
      else if (platformId === 'linkedin_ads') r = await getLinkedInAdAccounts();
      setAdAccounts(prev => ({ ...prev, [platformId]: r.data.data || [] }));
    } catch (err) {
      toast(err.response?.data?.message || 'Error al cargar cuentas', 'error');
    }
  };

  const handleTogglePlatform = async (platformId) => {
    if (expandedPlatform === platformId) { setExpandedPlatform(null); return; }
    setExpandedPlatform(platformId);
    const isConnected = adStatus.some(s => s.provider === platformId);
    if (isConnected && platformId !== 'google_ads') await handleLoadAccounts(platformId);
  };

  const handleCreateAdCampaign = async (e) => {
    e.preventDefault();
    try {
      const r = await createAdCampaign(adCampaignForm);
      toast(`Campaña creada en ${adCampaignForm.platform.replace('_ads', '')} ✅`, 'success');
      setShowAdCampaignForm(false);
    } catch (err) {
      toast(err.response?.data?.message || 'Error al crear campaña', 'error');
    }
  };

  const handlePreviewSegment = async () => {
    try { const r = await previewSegment(campaignForm.segment); setSegmentPreview(r.data.data); }
    catch { toast('Error al previsualizar segmento', 'error'); }
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    try {
      await createCampaign(campaignForm);
      toast('Campaña creada', 'success');
      setShowNewCampaign(false);
      setCampaignForm({ name: '', type: 'email', subject: '', body: '', segment: { services: [], stages: [], countries: [], minScore: 0 } });
      setSegmentPreview(null); load();
    } catch { toast('Error al crear campaña', 'error'); }
  };

  const handleLaunch = async (id) => {
    try { const r = await launchCampaign(id); toast(r.data.data.message, 'success'); load(); }
    catch { toast('Error al lanzar campaña', 'error'); }
  };

  const handleDeleteCampaign = async (id) => {
    try { await deleteCampaign(id); toast('Campaña eliminada', 'success'); load(); }
    catch { toast('Error al eliminar', 'error'); }
  };

  const handleToggleAuto = async (auto) => {
    try {
      await updateAutomation(auto._id, { isActive: !auto.isActive });
      toast(`Automatización ${auto.isActive ? 'pausada' : 'activada'}`, 'success'); load();
    } catch { toast('Error', 'error'); }
  };

  const handleCreateAuto = async (e) => {
    e.preventDefault();
    try { await createAutomation(autoForm); toast('Automatización creada', 'success'); setShowNewAuto(false); load(); }
    catch { toast('Error al crear automatización', 'error'); }
  };

  const seedDefaultAutomations = async () => {
    try { await Promise.all(DEFAULT_AUTOMATIONS.map(a => createAutomation(a))); toast('Automatizaciones predeterminadas creadas', 'success'); load(); }
    catch { toast('Error', 'error'); }
  };

  if (loading) return <div className="loading"><div className="spinner" />Cargando marketing...</div>;

  const getIntegration = (id) => adStatus.find(s => s.provider === id);
  const objectives = adCampaignForm.platform === 'meta_ads' ? OBJECTIVES_META : adCampaignForm.platform === 'linkedin_ads' ? OBJECTIVES_LI : OBJECTIVES_GADS;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Marketing</div>
          <div className="page-sub">Campañas, automatizaciones y canales publicitarios para Freight Forwarding</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tab === 'campaigns' && <button className="btn btn-primary btn-sm" onClick={() => setShowNewCampaign(true)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Nueva Campaña</button>}
          {tab === 'automations' && <button className="btn btn-primary btn-sm" onClick={() => setShowNewAuto(true)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Nueva Automatización</button>}
          {tab === 'adchannels' && <button className="btn btn-primary btn-sm" onClick={() => setShowAdCampaignForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Nueva Ad Campaign</button>}
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
            { label: 'Ad Channels', value: adStatus.length, Icon: Radio, color: '#EA4335' },
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
                <textarea className="form-input" rows={4} placeholder="Hola {contacto}, en ACON Internacional contamos con tarifas competitivas..." value={campaignForm.body} onChange={e => setCampaignForm(f => ({...f, body: e.target.value}))} required />
                <div style={{ fontSize: 11, color: '#9AA3AE', marginTop: 4 }}>Variables: {'{contacto}'}, {'{empresa}'}, {'{ejecutivo}'}</div>
              </div>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#0B2545', marginBottom: 10, marginTop: 4 }}>Segmentación de audiencia</div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Servicios</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {SERVICES.map(s => (
                      <button key={s} type="button" onClick={() => { const arr = campaignForm.segment.services; setCampaignForm(f => ({...f, segment: {...f.segment, services: arr.includes(s) ? arr.filter(x => x !== s) : [...arr, s]}})); }}
                        style={{ padding: '4px 10px', borderRadius: 20, border: '1px solid', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: campaignForm.segment.services.includes(s) ? '#F2641E' : '#fff', color: campaignForm.segment.services.includes(s) ? '#fff' : '#5A6472', borderColor: campaignForm.segment.services.includes(s) ? '#F2641E' : '#E3E6EA' }}>
                        {SERVICE_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Etapas del pipeline</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {STAGES.map(s => (
                      <button key={s} type="button" onClick={() => { const arr = campaignForm.segment.stages; setCampaignForm(f => ({...f, segment: {...f.segment, stages: arr.includes(s) ? arr.filter(x => x !== s) : [...arr, s]}})); }}
                        style={{ padding: '4px 10px', borderRadius: 20, border: '1px solid', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: campaignForm.segment.stages.includes(s) ? '#0B2545' : '#fff', color: campaignForm.segment.stages.includes(s) ? '#fff' : '#5A6472', borderColor: campaignForm.segment.stages.includes(s) ? '#0B2545' : '#E3E6EA' }}>
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
                {segmentPreview && <span style={{ fontSize: 13, color: '#16A34A', fontWeight: 700 }}>{segmentPreview.count} leads en este segmento</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary">Crear Campaña</button>
                <button type="button" className="btn btn-ghost" onClick={() => { setShowNewCampaign(false); setSegmentPreview(null); }}>Cancelar</button>
              </div>
            </form>
          )}
          {campaigns.length === 0 ? (
            <div className="card"><div className="empty-state"><Megaphone size={40} color="#9AA3AE" /><p style={{ color: '#9AA3AE' }}>No hay campañas creadas aún.</p><button className="btn btn-primary btn-sm" onClick={() => setShowNewCampaign(true)}><Plus size={13} /> Crear primera campaña</button></div></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {campaigns.map(c => (
                <div key={c._id} className="card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#0B2545' }}>{c.name}</div>
                        <StatusBadge status={c.status} />
                        <span style={{ fontSize: 11, background: '#F4F5F7', color: '#5A6472', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>{c.type === 'email' ? '📧 Email' : c.type === 'whatsapp' ? '💬 WhatsApp' : '📧💬 Mixta'}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 20, fontSize: 12, color: '#9AA3AE' }}>
                        <span>Enviados: <strong style={{ color: '#0B2545' }}>{c.sentCount || 0}</strong></span>
                        <span>Abiertos: <strong style={{ color: '#16A34A' }}>{c.openCount || 0}</strong></span>
                        <span>Respuestas: <strong style={{ color: '#F2641E' }}>{c.replyCount || 0}</strong></span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {c.status === 'draft' && <button className="btn btn-primary btn-sm" onClick={() => handleLaunch(c._id)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Play size={12} /> Lanzar</button>}
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteCampaign(c._id)} style={{ color: '#DC2626' }}><Trash2 size={13} /></button>
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
            <div className="card"><div className="empty-state"><Zap size={40} color="#9AA3AE" /><p style={{ color: '#9AA3AE' }}>No hay automatizaciones configuradas.</p><div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}><button className="btn btn-ghost btn-sm" onClick={seedDefaultAutomations}>Cargar plantillas ACON</button><button className="btn btn-primary btn-sm" onClick={() => setShowNewAuto(true)}><Plus size={13} /> Crear</button></div></div></div>
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
                      <span style={{ fontSize: 11, fontWeight: 700, color: a.isActive ? '#16A34A' : '#9AA3AE' }}>{a.isActive ? 'Activa' : 'Inactiva'}</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleToggleAuto(a)} style={{ display: 'flex', alignItems: 'center', gap: 4, color: a.isActive ? '#F59E0B' : '#16A34A' }}>
                        {a.isActive ? <Pause size={13} /> : <Play size={13} />}{a.isActive ? 'Pausar' : 'Activar'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={async () => { await deleteAutomation(a._id); toast('Eliminada', 'success'); load(); }} style={{ color: '#DC2626' }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── AD CHANNELS ── */}
      {tab === 'adchannels' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Ad Campaign Form */}
          {showAdCampaignForm && (
            <form onSubmit={handleCreateAdCampaign} className="card" style={{ border: '1px solid #F2641E30', marginBottom: 4 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0B2545', marginBottom: 16 }}>Crear Campaña Publicitaria</div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Plataforma</label>
                  <select className="form-select" value={adCampaignForm.platform} onChange={e => setAdCampaignForm(f => ({...f, platform: e.target.value, adAccountId: ''}))} required>
                    <option value="">Seleccionar...</option>
                    {AD_PLATFORMS.filter(p => getIntegration(p.id)).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {adStatus.length === 0 && <div style={{ fontSize: 11, color: '#F59E0B', marginTop: 4 }}>Conecta al menos una plataforma primero.</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">Nombre de la campaña</label>
                  <input className="form-input" placeholder="ACON — Flete Marítimo LATAM" value={adCampaignForm.name} onChange={e => setAdCampaignForm(f => ({...f, name: e.target.value}))} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Objetivo</label>
                  <select className="form-select" value={adCampaignForm.objective} onChange={e => setAdCampaignForm(f => ({...f, objective: e.target.value}))}>
                    {objectives.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Presupuesto diario (USD)</label>
                  <input className="form-input" type="number" min="5" value={adCampaignForm.dailyBudget} onChange={e => setAdCampaignForm(f => ({...f, dailyBudget: e.target.value}))} />
                </div>
              </div>
              {adCampaignForm.platform && adCampaignForm.platform !== 'google_ads' && (
                <div className="form-group">
                  <label className="form-label">ID de Cuenta Publicitaria</label>
                  {adAccounts[adCampaignForm.platform]?.length > 0 ? (
                    <select className="form-select" value={adCampaignForm.adAccountId} onChange={e => setAdCampaignForm(f => ({...f, adAccountId: e.target.value}))} required>
                      <option value="">Seleccionar cuenta...</option>
                      {adAccounts[adCampaignForm.platform].map(acc => (
                        <option key={acc.id || acc.id} value={acc.id}>{acc.name || acc.id}</option>
                      ))}
                    </select>
                  ) : (
                    <input className="form-input" placeholder="act_123456789 (Meta) o 123456789 (LinkedIn)" value={adCampaignForm.adAccountId} onChange={e => setAdCampaignForm(f => ({...f, adAccountId: e.target.value}))} required />
                  )}
                </div>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Título del anuncio</label>
                  <input className="form-input" placeholder="Soluciones de Freight Forwarding Internacional" value={adCampaignForm.headline} onChange={e => setAdCampaignForm(f => ({...f, headline: e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">URL de destino</label>
                  <input className="form-input" placeholder="https://acon.mx/cotizar" value={adCampaignForm.targetUrl} onChange={e => setAdCampaignForm(f => ({...f, targetUrl: e.target.value}))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Descripción del anuncio</label>
                <textarea className="form-input" rows={2} placeholder="Más de 20 años conectando México con el mundo. Marítimo, aéreo, terrestre y aduanal." value={adCampaignForm.description} onChange={e => setAdCampaignForm(f => ({...f, description: e.target.value}))} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary">Crear Campaña</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowAdCampaignForm(false)}>Cancelar</button>
              </div>
            </form>
          )}

          {/* Info banner */}
          <div style={{ background: '#0B254508', border: '1px solid #0B254520', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#5A6472', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Globe size={16} color="#0B2545" />
            <span>Conecta tus cuentas publicitarias para crear y monitorear campañas directamente desde el CRM. Las credenciales de cada plataforma deben configurarse en las <strong>variables de entorno</strong> del servidor.</span>
          </div>

          {/* Platform cards */}
          {AD_PLATFORMS.map(platform => {
            const integration = getIntegration(platform.id);
            const isConnected = !!integration;
            const isExpanded = expandedPlatform === platform.id;
            const accounts = adAccounts[platform.id] || [];

            return (
              <div key={platform.id} className="card" style={{ border: `1px solid ${isConnected ? platform.color + '40' : '#E3E6EA'}`, overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: platform.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                      {platform.logo}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#0B2545', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {platform.name}
                        {isConnected && <ConnectedBadge email={integration.providerEmail} />}
                      </div>
                      <div style={{ fontSize: 12, color: '#9AA3AE', marginTop: 2 }}>{platform.subtitle}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {isConnected ? (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleTogglePlatform(platform.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#0B2545' }}>
                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          {isExpanded ? 'Cerrar' : 'Ver detalles'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDisconnect(platform.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#DC2626' }}>
                          <Link2Off size={13} /> Desconectar
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => handleConnect(platform.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: platform.color, borderColor: platform.color }}>
                        <Link2 size={13} /> Conectar
                      </button>
                    )}
                  </div>
                </div>

                {/* Description */}
                <div style={{ fontSize: 12, color: '#5A6472', marginTop: 10 }}>{platform.description}</div>

                {/* Scopes */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {platform.scopes.map(scope => (
                    <span key={scope} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: `${platform.color}10`, color: platform.color, fontWeight: 600 }}>{scope}</span>
                  ))}
                </div>

                {/* Env vars hint (only when not connected) */}
                {!isConnected && (
                  <div style={{ marginTop: 12, padding: '10px 12px', background: '#F4F5F7', borderRadius: 8, fontSize: 11, color: '#9AA3AE' }}>
                    Requiere variables de entorno: {platform.envVars.map(v => <code key={v} style={{ background: '#E3E6EA', padding: '1px 5px', borderRadius: 4, marginLeft: 4, color: '#5A6472' }}>{v}</code>)}
                  </div>
                )}

                {/* Expanded: accounts & metrics */}
                {isConnected && isExpanded && (
                  <div style={{ marginTop: 16, borderTop: '1px solid #F0F1F3', paddingTop: 16 }}>
                    {platform.id !== 'google_ads' ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#0B2545' }}>Cuentas publicitarias</div>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleLoadAccounts(platform.id)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><RefreshCw size={12} /> Actualizar</button>
                        </div>
                        {accounts.length === 0 ? (
                          <div style={{ fontSize: 12, color: '#9AA3AE', textAlign: 'center', padding: '16px 0' }}>No se encontraron cuentas. Verifica que tu cuenta tenga acceso a anuncios.</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {accounts.map(acc => (
                              <div key={acc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E3E6EA' }}>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 13, color: '#0B2545' }}>{acc.name || acc.id}</div>
                                  <div style={{ fontSize: 11, color: '#9AA3AE' }}>ID: {acc.id} {acc.currency && `· ${acc.currency}`}</div>
                                </div>
                                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: acc.account_status === 1 ? '#16A34A14' : '#9AA3AE14', color: acc.account_status === 1 ? '#16A34A' : '#9AA3AE', fontWeight: 700 }}>
                                  {acc.account_status === 1 ? 'Activa' : acc.status || 'Inactiva'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ padding: '12px 16px', background: '#F4F5F7', borderRadius: 8, fontSize: 12, color: '#5A6472' }}>
                        <strong style={{ color: '#0B2545' }}>Google Ads conectado.</strong> Para crear campañas necesitas un <strong>Google Ads Developer Token</strong> aprobado y el ID de cliente MCC. Puedes gestionar las campañas en <a href="https://ads.google.com" target="_blank" rel="noopener noreferrer" style={{ color: '#EA4335', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>Google Ads Manager <ExternalLink size={11} /></a>
                      </div>
                    )}

                    {/* Quick action */}
                    <div style={{ marginTop: 12 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => { setAdCampaignForm(f => ({...f, platform: platform.id})); setShowAdCampaignForm(true); setExpandedPlatform(null); }} style={{ background: platform.color, borderColor: platform.color, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Plus size={13} /> Crear campaña en {platform.name}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9AA3AE', fontSize: 13 }}>Lanza campañas para ver métricas</div>
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
              {/* Ad channels summary */}
              <div style={{ marginTop: 16, borderTop: '1px solid #F0F1F3', paddingTop: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: '#0B2545', marginBottom: 8 }}>Canales publicitarios conectados</div>
                {AD_PLATFORMS.map(p => {
                  const int = getIntegration(p.id);
                  return (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #F4F5F7' }}>
                      <span style={{ fontSize: 12, color: '#5A6472' }}>{p.logo} {p.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: int ? '#16A34A' : '#9AA3AE' }}>{int ? '● Conectado' : '○ No conectado'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
