import React, { useEffect, useState } from 'react';
import { getIntegrations } from '../services/api';

export default function IntegrationsPage({ toast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getIntegrations()
      .then(r => setData(r.data.data))
      .catch(() => toast('Error al cargar integraciones', 'error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><div className="spinner" />Cargando...</div>;
  if (!data) return null;

  const integrations = [
    {
      key: 'whatsapp', icon: '💬', name: 'WhatsApp Business',
      desc: 'Meta WhatsApp Cloud API — mensajería directa con leads',
      connected: data.whatsapp?.connected,
      detail: data.whatsapp?.phoneId,
      docs: 'Configura META_WA_TOKEN y META_WA_PHONE_ID en .env'
    },
    {
      key: 'email', icon: '📧', name: 'Email SMTP',
      desc: 'Envío de correos con plantillas personalizadas',
      connected: data.email?.connected,
      detail: data.email?.user,
      docs: 'Configura SMTP_HOST, SMTP_USER, SMTP_PASS en .env'
    },
    {
      key: 'openai', icon: '🤖', name: 'OpenAI / Agentes IA',
      desc: 'Scoring automático, respuestas y borradores de email',
      connected: data.openai?.connected,
      detail: data.openai?.model,
      docs: 'Configura OPENAI_API_KEY en .env'
    },
    {
      key: 'facebook', icon: '📘', name: 'Facebook Lead Ads',
      desc: 'Captura automática de leads desde Meta Ads',
      connected: data.facebook?.connected,
      detail: data.facebook?.pageId,
      docs: 'Configura META_ACCESS_TOKEN y META_PAGE_ID en .env'
    },
    {
      key: 'linkedin', icon: '💼', name: 'LinkedIn Lead Gen',
      desc: 'Leads desde LinkedIn vía Zapier/Make',
      connected: data.linkedin?.connected,
      detail: 'Vía webhook genérico',
      docs: 'Crea un Zap con HTTP POST a /api/webhooks/linkedin'
    },
    {
      key: 'webhooks', icon: '🔗', name: 'Webhooks',
      desc: 'Endpoints para recibir leads de cualquier fuente',
      connected: true,
      detail: 'Activo',
      docs: ''
    },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Integraciones</div>
          <div className="page-sub">Estado de conexiones del CRM</div>
        </div>
      </div>

      <div className="integrations-grid">
        {integrations.map(int => (
          <div key={int.key} className="int-card">
            <div className="int-icon">{int.icon}</div>
            <div className="int-name">{int.name}</div>
            <div className="int-desc">{int.desc}</div>
            <div className={`int-status ${int.connected ? 'on' : 'off'}`}>
              <div className="int-dot" />
              {int.connected ? 'Conectado' : 'No configurado'}
            </div>
            {int.detail && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>{int.detail}</div>
            )}
            {!int.connected && int.docs && (
              <div style={{ fontSize: 11, background: 'var(--dark3)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text2)' }}>
                💡 {int.docs}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Webhooks URLs */}
      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>🔗 URLs de Webhooks</div>
        {Object.entries(data.webhooks || {}).map(([key, url]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '10px 14px', background: 'var(--dark3)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text3)', textTransform: 'uppercase', minWidth: 100 }}>{key}</span>
            <code style={{ flex: 1, fontSize: 12, color: 'var(--orange)', fontFamily: 'monospace' }}>{url}</code>
            <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(url); toast('URL copiada', 'success'); }}>
              📋
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
