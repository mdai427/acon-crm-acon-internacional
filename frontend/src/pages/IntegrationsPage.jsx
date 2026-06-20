import React, { useEffect, useState, useCallback } from 'react';
import { getIntegrations, getOAuthStatus, connectGoogle, disconnectOAuth } from '../services/api';
import {
  CheckCircle2, XCircle, ExternalLink, RefreshCw, Plug,
  Mail, Calendar, MessageSquare, Bot, Users, Globe,
  Link2, Zap, FileSpreadsheet, Video, Package
} from 'lucide-react';

const CATEGORY_COLORS = {
  google: '#4285F4',
  microsoft: '#00A4EF',
  meta: '#1877F2',
  openai: '#10A37F',
  logistics: '#F2641E',
  webhook: '#7C3AED',
};

function StatusDot({ connected }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600,
      color: connected ? '#16A34A' : '#9AA3AE',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: connected ? '#16A34A' : '#D1D5DB',
        boxShadow: connected ? '0 0 0 2px rgba(22,163,74,.2)' : 'none',
      }} />
      {connected ? 'Conectado' : 'No conectado'}
    </span>
  );
}

function IntCard({ icon: Icon, iconColor, name, desc, connected, email, badge, onConnect, onDisconnect, connectLabel = 'Conectar', comingSoon }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E3E6EA', borderRadius: 14,
      padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 10,
      boxShadow: '0 1px 4px rgba(0,0,0,.04)',
      transition: 'box-shadow .15s',
      position: 'relative',
      opacity: comingSoon ? 0.65 : 1,
    }}>
      {badge && (
        <span style={{
          position: 'absolute', top: 14, right: 14,
          background: '#F59E0B18', color: '#D97706', fontSize: 10, fontWeight: 700,
          padding: '2px 8px', borderRadius: 20, border: '1px solid #F59E0B40',
        }}>{badge}</span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: `${iconColor}14`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={22} color={iconColor} strokeWidth={1.75} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0B2545' }}>{name}</div>
          <div style={{ fontSize: 12, color: '#9AA3AE', marginTop: 1 }}>{desc}</div>
        </div>
      </div>

      <StatusDot connected={connected} />
      {email && <div style={{ fontSize: 11, color: '#5A6472', fontFamily: 'monospace' }}>{email}</div>}

      {!comingSoon && (
        connected ? (
          <button onClick={onDisconnect} style={{
            marginTop: 4, padding: '7px 14px', border: '1px solid #E3E6EA', borderRadius: 8,
            background: '#fff', fontSize: 12, fontWeight: 600, color: '#DC2626', cursor: 'pointer',
          }}>
            Desconectar
          </button>
        ) : (
          <button onClick={onConnect} style={{
            marginTop: 4, padding: '7px 14px', borderRadius: 8, border: 'none',
            background: iconColor, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            {connectLabel}
          </button>
        )
      )}
      {comingSoon && (
        <span style={{ fontSize: 12, color: '#9AA3AE', fontStyle: 'italic' }}>Próximamente</span>
      )}
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 14, marginTop: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: '#0B2545' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: '#9AA3AE', marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

export default function IntegrationsPage({ toast }) {
  const [sysData, setSysData] = useState(null);
  const [oauthData, setOauthData] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sysRes, oauthRes] = await Promise.all([
        getIntegrations(),
        getOAuthStatus(),
      ]);
      setSysData(sysRes.data.data);
      setOauthData(oauthRes.data.data || {});
    } catch {
      toast('Error al cargar integraciones', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Handle OAuth callback params
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) {
      const provider = params.get('connected');
      const email = params.get('email');
      toast(`✅ ${provider === 'google' ? 'Google' : provider} conectado${email ? ` como ${email}` : ''}`, 'success');
      window.history.replaceState({}, '', window.location.pathname);
      load();
    }
    if (params.get('error')) {
      toast('Error al conectar: ' + params.get('error'), 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleConnectGoogle = async () => {
    try {
      const r = await connectGoogle();
      if (r.data.url) {
        window.location.href = r.data.url;
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Error al iniciar OAuth de Google';
      toast(msg, 'error');
    }
  };

  const handleDisconnect = async (provider) => {
    try {
      await disconnectOAuth(provider);
      toast(`${provider} desconectado`, 'success');
      load();
    } catch {
      toast('Error al desconectar', 'error');
    }
  };

  if (loading) return <div className="loading"><div className="spinner" />Cargando integraciones...</div>;

  const sys = sysData || {};

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Integraciones</div>
          <div className="page-sub">Conecta tus herramientas de trabajo al CRM</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {/* ── Google Suite ── */}
      <SectionHeader title="Google Suite" subtitle="Conecta tu cuenta Google para sincronizar correos y calendario" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 28 }}>
        <IntCard
          icon={Mail} iconColor="#EA4335"
          name="Gmail"
          desc="Sincroniza correos de tus contactos directo en cada lead"
          connected={!!oauthData.google?.connected}
          email={oauthData.google?.email}
          onConnect={handleConnectGoogle}
          onDisconnect={() => handleDisconnect('google')}
          connectLabel="Conectar con Google"
        />
        <IntCard
          icon={Calendar} iconColor="#4285F4"
          name="Google Calendar"
          desc="Crea y visualiza reuniones desde el perfil de cada lead"
          connected={!!oauthData.google?.connected}
          email={oauthData.google?.email}
          onConnect={handleConnectGoogle}
          onDisconnect={() => handleDisconnect('google')}
          connectLabel="Conectar con Google"
        />
        <IntCard
          icon={Video} iconColor="#00897B"
          name="Google Meet"
          desc="Genera links de Meet automáticamente al crear eventos"
          connected={!!oauthData.google?.connected}
          badge="Incluido con Google"
        />
      </div>

      {/* ── Microsoft 365 ── */}
      <SectionHeader title="Microsoft 365" subtitle="Integración con Outlook, Teams y OneDrive" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 28 }}>
        <IntCard icon={Mail} iconColor="#0078D4" name="Outlook" desc="Sincroniza correos de Outlook con tus leads" connected={false} comingSoon />
        <IntCard icon={Calendar} iconColor="#00A4EF" name="Outlook Calendar" desc="Ver y crear eventos de Outlook Calendar" connected={false} comingSoon />
        <IntCard icon={Video} iconColor="#5059C9" name="Microsoft Teams" desc="Crear reuniones de Teams desde el lead" connected={false} comingSoon />
      </div>

      {/* ── Comunicación ── */}
      <SectionHeader title="Comunicación" subtitle="Canales de mensajería y contacto con clientes" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 28 }}>
        <IntCard
          icon={MessageSquare} iconColor="#25D366"
          name="WhatsApp Business"
          desc="Meta WhatsApp Cloud API — mensajería directa con leads"
          connected={!!sys.whatsapp?.connected}
          email={sys.whatsapp?.phoneId ? `Phone ID: ${sys.whatsapp.phoneId}` : undefined}
          badge={sys.whatsapp?.connected ? undefined : 'Configurar en .env'}
          comingSoon={false}
          onConnect={() => toast('Configura META_WA_TOKEN y META_WA_PHONE_ID en Railway Variables', 'info')}
          connectLabel="Ver instrucciones"
        />
        <IntCard
          icon={Mail} iconColor="#F2641E"
          name="Email SMTP"
          desc="Envío de correos con plantillas personalizadas (Outlook, Gmail SMTP, SendGrid)"
          connected={!!sys.email?.connected}
          email={sys.email?.user}
          badge={sys.email?.connected ? undefined : 'Configurar en .env'}
          onConnect={() => toast('Configura SMTP_HOST, SMTP_USER, SMTP_PASS en Railway Variables', 'info')}
          connectLabel="Ver instrucciones"
        />
        <IntCard
          icon={Zap} iconColor="#FF6B6B"
          name="Twilio (SMS/Voz)"
          desc="Llamadas y SMS automatizados a leads"
          connected={false}
          comingSoon
        />
      </div>

      {/* ── IA ── */}
      <SectionHeader title="Inteligencia Artificial" subtitle="Agentes y automatización con IA" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 28 }}>
        <IntCard
          icon={Bot} iconColor="#10A37F"
          name="OpenAI / GPT-4"
          desc="Scoring de leads, borradores de email y respuestas automáticas"
          connected={!!sys.openai?.connected}
          email={sys.openai?.model ? `Modelo: ${sys.openai.model}` : undefined}
          badge={sys.openai?.connected ? undefined : 'Configurar en .env'}
          onConnect={() => toast('Configura OPENAI_API_KEY en Railway Variables', 'info')}
          connectLabel="Ver instrucciones"
        />
        <IntCard
          icon={Bot} iconColor="#7C3AED"
          name="Claude (Anthropic)"
          desc="Análisis avanzado de leads y generación de contenido"
          connected={false}
          comingSoon
        />
      </div>

      {/* ── CRM / Productividad ── */}
      <SectionHeader title="CRM y Productividad" subtitle="Sincroniza con otras plataformas" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 28 }}>
        <IntCard icon={FileSpreadsheet} iconColor="#21A366" name="Excel / Google Sheets" desc="Importa y exporta bases de datos de leads" connected badge="Disponible" />
        <IntCard icon={Users} iconColor="#0077B5" name="LinkedIn Lead Gen" desc="Captura leads desde LinkedIn via webhook" connected={false} comingSoon />
        <IntCard icon={Globe} iconColor="#FF7A00" name="HubSpot" desc="Sincronización bidireccional con HubSpot CRM" connected={false} comingSoon />
        <IntCard icon={Package} iconColor="#F2641E" name="DocuSign" desc="Firma electrónica de propuestas y contratos" connected={false} comingSoon />
        <IntCard icon={Zap} iconColor="#FF4F00" name="Zapier / Make" desc="Automatiza flujos con 5,000+ aplicaciones" connected badge="Vía webhooks" />
        <IntCard icon={Globe} iconColor="#E44D26" name="Mailchimp" desc="Sincroniza contactos con listas de email marketing" connected={false} comingSoon />
      </div>

      {/* ── Webhooks ── */}
      <SectionHeader title="Webhooks y API" subtitle="Recibe leads de cualquier fuente externa" />
      <div className="card">
        {Object.entries(sys.webhooks || {
          'Facebook Lead Ads': '/api/webhooks/facebook',
          'LinkedIn (via Make/Zapier)': '/api/webhooks/linkedin',
          'Formulario web': '/api/webhooks/web',
          'Genérico': '/api/webhooks/generic',
        }).map(([key, url]) => (
          <div key={key} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
            borderBottom: '1px solid #F4F5F7',
          }}>
            <Link2 size={14} color="#9AA3AE" />
            <span style={{ fontSize: 12, color: '#5A6472', minWidth: 180 }}>{key}</span>
            <code style={{ flex: 1, fontSize: 12, color: '#F2641E', fontFamily: 'monospace', background: '#FFF7F4', padding: '4px 8px', borderRadius: 6 }}>
              {process.env.REACT_APP_API_URL || window.location.origin}{url}
            </code>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { navigator.clipboard.writeText(`${process.env.REACT_APP_API_URL || window.location.origin}${url}`); toast('URL copiada', 'success'); }}
              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
            >
              <ExternalLink size={12} /> Copiar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
