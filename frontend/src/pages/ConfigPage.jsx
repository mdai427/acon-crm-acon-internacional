import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';

// ─── helpers ──────────────────────────────
const Input = ({ label, name, value, onChange, type = 'text', placeholder, hint }) => (
  <div className="form-group">
    <label className="form-label">{label}</label>
    <input
      className="form-input"
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder || ''}
      autoComplete="off"
    />
    {hint && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{hint}</div>}
  </div>
);

function StatusPill({ connected, saved }) {
  // 3 estados: verificado (verde), guardado/sin probar (amarillo), sin configurar (rojo)
  const verified = connected;
  const hasSaved = saved && !connected;
  const color    = verified ? 'var(--green)' : hasSaved ? '#EAB308' : 'var(--red, #EF4444)';
  const bg       = verified ? 'rgba(34,197,94,.12)' : hasSaved ? 'rgba(234,179,8,.12)' : 'rgba(239,68,68,.12)';
  const label    = verified ? 'Verificado' : hasSaved ? 'Token guardado (sin verificar)' : 'Sin configurar';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 12,
      background: bg, color
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
      {label}
    </span>
  );
}

function TestButton({ onTest, loading }) {
  return (
    <button className="btn btn-ghost btn-sm" onClick={onTest} disabled={loading}
      style={{ minWidth: 100 }}>
      {loading ? '⏳ Probando...' : '🔌 Probar conexión'}
    </button>
  );
}

function ResultBanner({ result }) {
  if (!result) return null;
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 8, fontSize: 13, marginTop: 10,
      background: result.success ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)',
      border: `1px solid ${result.success ? 'var(--green)' : 'var(--red)'}`,
      color: result.success ? 'var(--green)' : 'var(--red)'
    }}>
      {result.message}
      {result.data && (
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text2)' }}>
          {JSON.stringify(result.data)}
        </div>
      )}
    </div>
  );
}

function Section({ title, icon, desc, children }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
        <div style={{ fontSize: 32 }}>{icon}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>{desc}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Componente principal ─────────────────
export default function ConfigPage({ toast }) {
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);

  // Formularios locales por sección
  const [wa, setWa] = useState({ META_WA_TOKEN: '', META_WA_PHONE_ID: '', META_WA_VERIFY_TOKEN: '', META_APP_SECRET: '' });
  const [email, setEmail] = useState({ SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: '', SMTP_PASS: '', EMAIL_FROM: '' });
  const [openai, setOpenai] = useState({ OPENAI_API_KEY: '', OPENAI_MODEL: 'gpt-4o-mini' });
  const [fb, setFb] = useState({ META_ACCESS_TOKEN: '', META_PAGE_ID: '', META_WEBHOOK_VERIFY_TOKEN: '', META_APP_SECRET: '' });

  // Resultados de prueba
  const [testResults, setTestResults] = useState({});
  const [testLoading, setTestLoading] = useState({});
  const [saving, setSaving] = useState({});

  // Email test recipient
  const [testEmail, setTestEmail] = useState('');

  // Mostrar/ocultar secretos
  const [show, setShow] = useState({});
  const toggleShow = (key) => setShow(s => ({ ...s, [key]: !s[key] }));

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/config');
      const d = r.data.data;
      setCfg(d);
      // Pre-llenar con valores del servidor (los secretos vienen enmascarados)
      setWa(w => ({
        ...w,
        META_WA_PHONE_ID:     d.whatsapp.META_WA_PHONE_ID     || '',
        META_WA_VERIFY_TOKEN: d.whatsapp.META_WA_VERIFY_TOKEN || '',
      }));
      setEmail(e => ({
        ...e,
        SMTP_HOST:   d.email.SMTP_HOST  || 'smtp.gmail.com',
        SMTP_PORT:   d.email.SMTP_PORT  || '587',
        SMTP_SECURE: d.email.SMTP_SECURE || 'false',
        SMTP_USER:   d.email.SMTP_USER  || '',
        EMAIL_FROM:  d.email.EMAIL_FROM || '',
      }));
      setOpenai(o => ({ ...o, OPENAI_MODEL: d.openai.OPENAI_MODEL || 'gpt-4o-mini' }));
      setFb(f => ({
        ...f,
        META_PAGE_ID:              d.facebook.META_PAGE_ID              || '',
        META_WEBHOOK_VERIFY_TOKEN: d.facebook.META_WEBHOOK_VERIFY_TOKEN || '',
      }));
    } catch { toast('Error al cargar configuración', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async (section, body) => {
    setSaving(s => ({ ...s, [section]: true }));
    try {
      const r = await api.post(`/config/${section}`, body);
      toast(r.data.message, 'success');
      load();
    } catch (e) {
      toast(e.response?.data?.message || 'Error al guardar', 'error');
    } finally {
      setSaving(s => ({ ...s, [section]: false }));
    }
  };

  const test = async (section, body = {}) => {
    setTestLoading(t => ({ ...t, [section]: true }));
    setTestResults(r => ({ ...r, [section]: null }));
    try {
      const r = await api.post(`/config/${section}/test`, body);
      setTestResults(t => ({ ...t, [section]: r.data }));
    } catch (e) {
      setTestResults(t => ({ ...t, [section]: { success: false, message: e.response?.data?.message || e.message } }));
    } finally {
      setTestLoading(t => ({ ...t, [section]: false }));
    }
  };

  const chWa = e => setWa(f => ({ ...f, [e.target.name]: e.target.value }));
  const chEm = e => setEmail(f => ({ ...f, [e.target.name]: e.target.value }));
  const chOp = e => setOpenai(f => ({ ...f, [e.target.name]: e.target.value }));
  const chFb = e => setFb(f => ({ ...f, [e.target.name]: e.target.value }));

  if (loading) return <div className="loading"><div className="spinner" />Cargando configuración...</div>;

  const base = cfg?.webhooks?.base || 'http://localhost:5001';
  const isLocalhost = cfg?.webhooks?.isLocalhost !== false;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">⚙️ Configuración de Integraciones</div>
          <div className="page-sub">Conecta WhatsApp, Email, IA y redes sociales al CRM</div>
        </div>
      </div>

      {/* ─── WHATSAPP ─── */}
      <Section title="WhatsApp Business API" icon="💬"
        desc="Meta WhatsApp Cloud API — mensajes directos, plantillas aprobadas y recepción automática de mensajes entrantes.">

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <StatusPill connected={cfg?.whatsapp?.connected} saved={cfg?.whatsapp?.saved} />
          <TestButton onTest={() => test('whatsapp')} loading={testLoading.whatsapp} />
        </div>

        <ResultBanner result={testResults.whatsapp} />

        <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--dark3)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>
          <b style={{ color: 'var(--orange)' }}>📋 Cómo obtener las credenciales:</b><br />
          1. Ve a <b>developers.facebook.com</b> → Mi app → WhatsApp → Configuración de la API<br />
          2. Copia el <b>Token de acceso temporal</b> (o permanente vía Sistema de usuarios)<br />
          3. Copia el <b>ID de número de teléfono</b><br />
          4. En Webhooks configura la URL: <code style={{ color: 'var(--orange)' }}>{base}/api/whatsapp/webhook</code><br />
          5. Verify Token: el valor que pongas en META_WA_VERIFY_TOKEN abajo
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Token de Acceso (META_WA_TOKEN)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="form-input" type={show.watoken ? 'text' : 'password'}
                name="META_WA_TOKEN" value={wa.META_WA_TOKEN} onChange={chWa}
                placeholder="EAAxxxxxx..." />
              <button className="btn btn-ghost btn-sm" onClick={() => toggleShow('watoken')}
                style={{ flexShrink: 0 }}>{show.watoken ? '🙈' : '👁'}</button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Phone Number ID (META_WA_PHONE_ID)</label>
            <input className="form-input" name="META_WA_PHONE_ID" value={wa.META_WA_PHONE_ID}
              onChange={chWa} placeholder="123456789012345" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Verify Token (META_WA_VERIFY_TOKEN)</label>
            <input className="form-input" name="META_WA_VERIFY_TOKEN" value={wa.META_WA_VERIFY_TOKEN}
              onChange={chWa} placeholder="acon_webhook_2024" />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Token que pondrás en el webhook de Meta</div>
          </div>
          <div className="form-group">
            <label className="form-label">App Secret (META_APP_SECRET)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="form-input" type={show.wasecret ? 'text' : 'password'}
                name="META_APP_SECRET" value={wa.META_APP_SECRET} onChange={chWa}
                placeholder="Secreto de la app Meta" />
              <button className="btn btn-ghost btn-sm" onClick={() => toggleShow('wasecret')}
                style={{ flexShrink: 0 }}>{show.wasecret ? '🙈' : '👁'}</button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="btn btn-primary" onClick={() => save('whatsapp', wa)} disabled={saving.whatsapp}>
            {saving.whatsapp ? 'Guardando...' : '💾 Guardar WhatsApp'}
          </button>
          <TestButton onTest={() => test('whatsapp')} loading={testLoading.whatsapp} />
        </div>

        {/* Webhook URL */}
        <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--dark3)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, fontWeight: 600 }}>🔗 URL de Webhook para Meta:</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, fontSize: 12, color: 'var(--orange)', wordBreak: 'break-all' }}>
              {base}/api/whatsapp/webhook
            </code>
            <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(`${base}/api/whatsapp/webhook`); toast('URL copiada', 'success'); }}>
              📋
            </button>
          </div>
        </div>
      </Section>

      {/* ─── EMAIL SMTP ─── */}
      <Section title="Email SMTP" icon="📧"
        desc="Envío de correos de seguimiento, cotizaciones y notificaciones. Compatible con Gmail, Outlook, o cualquier servidor SMTP.">

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <StatusPill connected={cfg?.email?.connected} />
        </div>

        <div style={{ padding: '12px 14px', background: 'var(--dark3)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>
          <b style={{ color: 'var(--orange)' }}>📋 Gmail — Contraseña de aplicación:</b><br />
          1. Google Account → Seguridad → Verificación en 2 pasos (activa)<br />
          2. Seguridad → <b>Contraseñas de aplicaciones</b> → Correo → Generar<br />
          3. Pega la contraseña de 16 caracteres en SMTP_PASS
        </div>

        <div className="form-row">
          <Input label="Servidor SMTP (SMTP_HOST)" name="SMTP_HOST" value={email.SMTP_HOST} onChange={chEm}
            placeholder="smtp.gmail.com" />
          <div className="form-group">
            <label className="form-label">Puerto y seguridad</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" name="SMTP_PORT" value={email.SMTP_PORT} onChange={chEm}
                placeholder="587" style={{ width: 80 }} />
              <select className="form-select" name="SMTP_SECURE" value={email.SMTP_SECURE} onChange={chEm}>
                <option value="false">STARTTLS (587)</option>
                <option value="true">SSL/TLS (465)</option>
              </select>
            </div>
          </div>
        </div>
        <div className="form-row">
          <Input label="Usuario / Email" name="SMTP_USER" value={email.SMTP_USER} onChange={chEm}
            placeholder="crm@aconinternacional.com" />
          <div className="form-group">
            <label className="form-label">Contraseña / App Password</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="form-input" type={show.smtppass ? 'text' : 'password'}
                name="SMTP_PASS" value={email.SMTP_PASS} onChange={chEm} placeholder="••••••••••••••••" />
              <button className="btn btn-ghost btn-sm" onClick={() => toggleShow('smtppass')}
                style={{ flexShrink: 0 }}>{show.smtppass ? '🙈' : '👁'}</button>
            </div>
          </div>
        </div>
        <Input label="Nombre remitente (EMAIL_FROM)" name="EMAIL_FROM" value={email.EMAIL_FROM} onChange={chEm}
          placeholder='"ACON CRM <crm@aconinternacional.com>"' />

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 4 }}>
          <button className="btn btn-primary" onClick={() => save('email', email)} disabled={saving.email}>
            {saving.email ? 'Guardando...' : '💾 Guardar Email'}
          </button>
          <input className="form-input" value={testEmail} onChange={e => setTestEmail(e.target.value)}
            placeholder="Email de prueba (opcional)" style={{ width: 240 }} />
          <TestButton onTest={() => test('email', { testTo: testEmail })} loading={testLoading.email} />
        </div>
        <ResultBanner result={testResults.email} />
      </Section>

      {/* ─── OPENAI ─── */}
      <Section title="OpenAI — Agentes de IA" icon="🤖"
        desc="Activa los 4 agentes: scoring automático de leads, respuestas inteligentes a WhatsApp, borradores de email personalizados y análisis del pipeline.">

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <StatusPill connected={cfg?.openai?.connected} />
        </div>

        <div style={{ padding: '12px 14px', background: 'var(--dark3)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>
          <b style={{ color: 'var(--orange)' }}>📋 Obtener API Key:</b><br />
          1. Ve a <b>platform.openai.com</b> → API keys → Create new secret key<br />
          2. Pega la clave abajo — empieza con <code>sk-</code>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">API Key (OPENAI_API_KEY)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="form-input" type={show.openai ? 'text' : 'password'}
                name="OPENAI_API_KEY" value={openai.OPENAI_API_KEY} onChange={chOp}
                placeholder="sk-proj-..." />
              <button className="btn btn-ghost btn-sm" onClick={() => toggleShow('openai')}
                style={{ flexShrink: 0 }}>{show.openai ? '🙈' : '👁'}</button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Modelo (OPENAI_MODEL)</label>
            <select className="form-select" name="OPENAI_MODEL" value={openai.OPENAI_MODEL} onChange={chOp}>
              <option value="gpt-4o-mini">gpt-4o-mini (rápido · económico)</option>
              <option value="gpt-4o">gpt-4o (mejor calidad)</option>
              <option value="gpt-4-turbo">gpt-4-turbo</option>
              <option value="gpt-3.5-turbo">gpt-3.5-turbo (más barato)</option>
            </select>
          </div>
        </div>

        {/* Agentes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 14 }}>
          {[
            { icon: '🎯', name: 'Scoring IA', desc: 'Puntúa leads 0-100 al crearlos o editarlos' },
            { icon: '💬', name: 'Auto-Reply WA', desc: 'Responde WhatsApp si no hay reply en 30 min' },
            { icon: '✉️', name: 'Email Draft', desc: 'Genera borradores personalizados con 1 click' },
            { icon: '📊', name: 'Pipeline Analysis', desc: 'Insights y recomendaciones del pipeline' },
          ].map(a => (
            <div key={a.name} style={{ padding: '10px 12px', background: 'var(--dark3)', borderRadius: 8, display: 'flex', gap: 10, alignItems: 'center', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 22 }}>{a.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{a.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="btn btn-primary" onClick={() => save('openai', openai)} disabled={saving.openai}>
            {saving.openai ? 'Guardando...' : '💾 Guardar OpenAI'}
          </button>
          <TestButton onTest={() => test('openai')} loading={testLoading.openai} />
        </div>
        <ResultBanner result={testResults.openai} />
      </Section>

      {/* ─── FACEBOOK / META LEAD ADS ─── */}
      <Section title="Facebook & Instagram Lead Ads" icon="📘"
        desc="Captura automática de leads desde tus campañas de Facebook Ads e Instagram. Los leads entran directo al CRM y se puntúan con IA.">

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <StatusPill connected={cfg?.facebook?.connected} />
          <TestButton onTest={() => test('facebook')} loading={testLoading.facebook} />
        </div>

        <div style={{ padding: '12px 14px', background: 'var(--dark3)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>
          <b style={{ color: 'var(--orange)' }}>📋 Configuración:</b><br />
          1. <b>developers.facebook.com</b> → tu app → Webhooks → Página → Suscribir a <b>leadgen</b><br />
          2. URL del webhook: <code style={{ color: 'var(--orange)' }}>{base}/api/webhooks/meta</code><br />
          3. Verify Token: el valor de META_WEBHOOK_VERIFY_TOKEN<br />
          4. El Access Token lo obtienes en <b>Meta Business Suite → Configuración → Tokens de acceso</b>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Access Token (META_ACCESS_TOKEN)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="form-input" type={show.fbtoken ? 'text' : 'password'}
                name="META_ACCESS_TOKEN" value={fb.META_ACCESS_TOKEN} onChange={chFb}
                placeholder="EAAxxxxxx..." />
              <button className="btn btn-ghost btn-sm" onClick={() => toggleShow('fbtoken')}
                style={{ flexShrink: 0 }}>{show.fbtoken ? '🙈' : '👁'}</button>
            </div>
          </div>
          <Input label="Page ID (META_PAGE_ID)" name="META_PAGE_ID" value={fb.META_PAGE_ID} onChange={chFb}
            placeholder="123456789012345" />
        </div>
        <div className="form-row">
          <Input label="Webhook Verify Token" name="META_WEBHOOK_VERIFY_TOKEN"
            value={fb.META_WEBHOOK_VERIFY_TOKEN} onChange={chFb} placeholder="acon_meta_2024" />
          <div className="form-group">
            <label className="form-label">App Secret (compartido con WA)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="form-input" type={show.fbsecret ? 'text' : 'password'}
                name="META_APP_SECRET" value={fb.META_APP_SECRET} onChange={chFb}
                placeholder="Secreto de la app" />
              <button className="btn btn-ghost btn-sm" onClick={() => toggleShow('fbsecret')}
                style={{ flexShrink: 0 }}>{show.fbsecret ? '🙈' : '👁'}</button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="btn btn-primary" onClick={() => save('facebook', fb)} disabled={saving.facebook}>
            {saving.facebook ? 'Guardando...' : '💾 Guardar Facebook'}
          </button>
          <TestButton onTest={() => test('facebook')} loading={testLoading.facebook} />
        </div>
        <ResultBanner result={testResults.facebook} />

        <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--dark3)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, fontWeight: 600 }}>🔗 URL de Webhook para Meta Lead Ads:</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, fontSize: 12, color: 'var(--orange)', wordBreak: 'break-all' }}>
              {base}/api/webhooks/meta
            </code>
            <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(`${base}/api/webhooks/meta`); toast('URL copiada', 'success'); }}>📋</button>
          </div>
        </div>
      </Section>

      {/* ─── LINKEDIN / ZAPIER ─── */}
      <Section title="LinkedIn Lead Gen (vía Zapier / Make)" icon="💼"
        desc="LinkedIn no permite webhooks directos. Usa Zapier o Make para capturar leads de LinkedIn Lead Gen Forms y enviarlos al CRM.">

        <div style={{ padding: '14px 16px', background: 'var(--dark3)', borderRadius: 10, fontSize: 13, color: 'var(--text2)' }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Configuración en Zapier:</div>
          <ol style={{ paddingLeft: 18, lineHeight: 2 }}>
            <li>Trigger: <b>LinkedIn Lead Gen Form — New Lead</b></li>
            <li>Action: <b>Webhooks by Zapier → POST</b></li>
            <li>URL: <code style={{ color: 'var(--orange)', background: 'var(--dark4)', padding: '1px 6px', borderRadius: 4 }}>{base}/api/webhooks/linkedin</code>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => { navigator.clipboard.writeText(`${base}/api/webhooks/linkedin`); toast('URL copiada', 'success'); }}>📋</button>
            </li>
            <li>Headers: <code style={{ color: 'var(--orange)', background: 'var(--dark4)', padding: '1px 6px', borderRadius: 4 }}>x-api-key: {cfg?.webhooks?.apiKeyHint}...</code></li>
            <li>Body (JSON): company, contact, email, phone, linkedinUrl, message</li>
          </ol>
          <div style={{ marginTop: 10, fontWeight: 700, color: 'var(--text)' }}>Webhook genérico (cualquier fuente):</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <code style={{ flex: 1, fontSize: 12, color: 'var(--orange)', wordBreak: 'break-all' }}>{base}/api/webhooks/generic</code>
            <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(`${base}/api/webhooks/generic`); toast('URL copiada', 'success'); }}>📋</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Acepta leads de n8n, Make, Integromat, cualquier HTTP POST</div>
        </div>
      </Section>

      {/* ─── RESUMEN WEBHOOKS ─── */}
      <Section title="Resumen de URLs y API Key" icon="🔗"
        desc="Todos los endpoints activos del CRM para configurar en plataformas externas.">
        {isLocalhost && (
          <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(234,179,8,.1)', borderRadius: 8, border: '1px solid rgba(234,179,8,.3)', fontSize: 12, color: '#EAB308' }}>
            <b>⚠️ URL local detectada.</b> Meta y WhatsApp no pueden conectar a localhost.
            Para pruebas usa <b>ngrok</b>: <code>ngrok http 5001</code>, luego actualiza
            <code style={{ margin: '0 4px' }}>PUBLIC_BASE_URL</code> en el archivo <code>.env</code>
            del backend con la URL que ngrok te dé (ej: <code>https://abc123.ngrok.io</code>)
            y reinicia el backend.
          </div>
        )}
        {[
          { label: 'WhatsApp Webhook', url: `${base}/api/whatsapp/webhook` },
          { label: 'Meta Lead Ads', url: `${base}/api/webhooks/meta` },
          { label: 'LinkedIn / Zapier', url: `${base}/api/webhooks/linkedin` },
          { label: 'Genérico (n8n, Make)', url: `${base}/api/webhooks/generic` },
        ].map(({ label, url }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '10px 14px', background: 'var(--dark3)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text3)', minWidth: 160 }}>{label}</span>
            <code style={{ flex: 1, fontSize: 12, color: 'var(--orange)', wordBreak: 'break-all' }}>{url}</code>
            <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(url); toast('Copiado', 'success'); }}>📋</button>
          </div>
        ))}
        <div style={{ padding: '10px 14px', background: 'var(--dark3)', borderRadius: 8, border: '1px solid var(--border)', marginTop: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>API Key (x-api-key header): </span>
          <code style={{ fontSize: 12, color: 'var(--yellow)' }}>{cfg?.webhooks?.apiKeyHint}...</code>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Primeros 20 chars de JWT_SECRET</div>
        </div>
      </Section>
    </div>
  );
}
