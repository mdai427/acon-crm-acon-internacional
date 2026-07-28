import React, { useEffect, useState, useCallback } from 'react';
import {
  getOAuthStatus, connectGoogle, disconnectOAuth,
  getSettings, saveSettings, deleteSetting,
  testWhatsApp, testEmail, testOpenAI,
} from '../services/api';
import {
  CheckCircle2, ExternalLink, RefreshCw, Copy, Trash2,
  Mail, MessageSquare, Bot, Users, Globe, Link2, Zap,
  HardDrive, TrendingUp, ChevronDown, Save, Eye, EyeOff, ShieldCheck,
} from 'lucide-react';

// El backend ya devuelve los webhooks como URL completa; solo se antepone la base
// de la API cuando llega una ruta relativa (evita duplicar el dominio).
const API_BASE = (process.env.REACT_APP_API_URL || window.location.origin).replace(/\/+$/, '');
const absoluteUrl = (url) =>
  /^https?:\/\//i.test(url) ? url : `${API_BASE}/${String(url).replace(/^\/+/, '')}`;

// ── Catálogo de integraciones ─────────────────────────────────────────────────
// Cada campo se guarda cifrado en la base de datos (AES-256-GCM). Los marcados
// como `secret` nunca se devuelven completos desde el servidor: el panel solo
// recibe una pista del valor guardado.
const CATALOG = [
  {
    section: 'Comunicación',
    subtitle: 'Canales por los que el equipo habla con los clientes',
    items: [
      {
        id: 'whatsapp',
        name: 'WhatsApp Business',
        desc: 'Enviar y recibir mensajes desde el CRM (Meta Cloud API)',
        icon: MessageSquare, color: '#25D366',
        docs: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
        webhook: '/api/whatsapp/webhook',
        required: ['META_WA_TOKEN', 'META_WA_PHONE_ID'],
        test: testWhatsApp,
        fields: [
          { key: 'META_WA_TOKEN', label: 'Access Token permanente', secret: true,
            help: 'Meta for Developers → tu app → WhatsApp → Configuración de la API' },
          { key: 'META_WA_PHONE_ID', label: 'Phone Number ID',
            help: 'El identificador del número, no el número de teléfono' },
          { key: 'META_WA_VERIFY_TOKEN', label: 'Verify Token del webhook',
            help: 'Invéntalo tú y pega exactamente el mismo en Meta' },
          { key: 'META_APP_SECRET', label: 'App Secret', secret: true,
            help: 'Valida la firma de los mensajes entrantes' },
        ],
      },
      {
        id: 'email',
        name: 'Correo saliente (SMTP)',
        desc: 'Envío de correos, plantillas y notificaciones al equipo',
        icon: Mail, color: '#EA4335',
        required: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'],
        test: async () => {
          const to = window.prompt('¿A qué dirección enviamos el correo de prueba?');
          if (!to) return null;
          return testEmail({ testTo: to });
        },
        fields: [
          { key: 'SMTP_HOST', label: 'Servidor SMTP', placeholder: 'smtp.gmail.com' },
          { key: 'SMTP_PORT', label: 'Puerto', placeholder: '587' },
          { key: 'SMTP_SECURE', label: 'Conexión SSL directa', type: 'select',
            options: [{ v: 'false', l: 'No (STARTTLS, puerto 587)' }, { v: 'true', l: 'Sí (SSL, puerto 465)' }] },
          { key: 'SMTP_USER', label: 'Usuario', placeholder: 'ventas@acon.com' },
          { key: 'SMTP_PASS', label: 'Contraseña', secret: true,
            help: 'En Gmail usa una contraseña de aplicación, no la del correo' },
          { key: 'EMAIL_FROM', label: 'Remitente visible', placeholder: 'ACON Internacional <ventas@acon.com>' },
        ],
      },
    ],
  },
  {
    section: 'Captación de leads',
    subtitle: 'Fuentes que alimentan el pipeline automáticamente',
    items: [
      {
        id: 'meta',
        name: 'Meta Lead Ads',
        desc: 'Recibe leads de formularios de Facebook e Instagram',
        icon: Users, color: '#1877F2',
        docs: 'https://developers.facebook.com/docs/marketing-api/guides/lead-ads',
        webhook: '/api/webhooks/meta',
        required: ['META_ACCESS_TOKEN', 'META_PAGE_ID'],
        fields: [
          { key: 'META_APP_ID', label: 'App ID' },
          { key: 'META_ACCESS_TOKEN', label: 'Access Token de la página', secret: true },
          { key: 'META_PAGE_ID', label: 'Page ID' },
          { key: 'META_WEBHOOK_VERIFY_TOKEN', label: 'Verify Token del webhook',
            help: 'Invéntalo tú y pégalo igual en la configuración del webhook en Meta' },
        ],
      },
      {
        id: 'linkedin',
        name: 'LinkedIn',
        desc: 'Captura leads de LinkedIn Lead Gen Forms',
        icon: Globe, color: '#0A66C2',
        webhook: '/api/webhooks/linkedin',
        required: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
        fields: [
          { key: 'LINKEDIN_CLIENT_ID', label: 'Client ID' },
          { key: 'LINKEDIN_CLIENT_SECRET', label: 'Client Secret', secret: true },
          { key: 'LINKEDIN_ACCESS_TOKEN', label: 'Access Token', secret: true },
        ],
      },
    ],
  },
  {
    section: 'Inteligencia artificial',
    subtitle: 'Motor de los agentes: scoring, respuestas sugeridas y análisis',
    items: [
      {
        id: 'openai',
        name: 'OpenAI',
        desc: 'Califica leads, redacta respuestas y analiza el pipeline',
        icon: Bot, color: '#10A37F',
        docs: 'https://platform.openai.com/api-keys',
        required: ['OPENAI_API_KEY'],
        test: testOpenAI,
        fields: [
          { key: 'OPENAI_API_KEY', label: 'API Key', secret: true, placeholder: 'sk-...' },
          { key: 'OPENAI_MODEL', label: 'Modelo', placeholder: 'gpt-4o-mini',
            help: 'gpt-4o-mini es el más económico; gpt-4o da mejores análisis' },
        ],
      },
    ],
  },
  {
    section: 'Google Workspace',
    subtitle: 'Credenciales de la app; cada usuario conecta su cuenta aparte',
    items: [
      {
        id: 'google',
        name: 'Google (Gmail y Calendar)',
        desc: 'Permite que el equipo vincule su correo y agenda al CRM',
        icon: Mail, color: '#4285F4',
        docs: 'https://console.cloud.google.com/apis/credentials',
        required: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
        fields: [
          { key: 'GOOGLE_CLIENT_ID', label: 'Client ID' },
          { key: 'GOOGLE_CLIENT_SECRET', label: 'Client Secret', secret: true },
          { key: 'GOOGLE_REDIRECT_URI', label: 'URI de redirección autorizada',
            help: 'Debe coincidir carácter por carácter con la registrada en Google Cloud' },
        ],
      },
    ],
  },
  {
    section: 'Almacenamiento y datos',
    subtitle: 'Archivos adjuntos y tipo de cambio',
    items: [
      {
        id: 's3',
        name: 'Amazon S3',
        desc: 'Guarda documentos de operaciones (BL, pedimentos, facturas)',
        icon: HardDrive, color: '#FF9900',
        required: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET'],
        fields: [
          { key: 'AWS_ACCESS_KEY_ID', label: 'Access Key ID' },
          { key: 'AWS_SECRET_ACCESS_KEY', label: 'Secret Access Key', secret: true },
          { key: 'AWS_REGION', label: 'Región', placeholder: 'us-east-1' },
          { key: 'S3_BUCKET', label: 'Nombre del bucket' },
        ],
      },
      {
        id: 'banxico',
        name: 'Banxico (tipo de cambio)',
        desc: 'Tipo de cambio USD/MXN oficial para cotizaciones',
        icon: TrendingUp, color: '#006341',
        docs: 'https://www.banxico.org.mx/SieAPIRest/service/v1/token',
        required: ['BANXICO_TOKEN'],
        fields: [
          { key: 'BANXICO_TOKEN', label: 'Token de la API SIE', secret: true,
            help: 'Gratuito: se solicita en el portal de Banxico' },
          { key: 'DEFAULT_EXCHANGE_RATE', label: 'Tipo de cambio de respaldo', placeholder: '17.50',
            help: 'Se usa solo si la API no responde' },
        ],
      },
    ],
  },
  {
    section: 'Automatización',
    subtitle: 'Conexión con Zapier, Make y n8n',
    items: [
      {
        id: 'automation',
        name: 'Webhook genérico y n8n',
        desc: 'Recibe leads de cualquier plataforma externa',
        icon: Zap, color: '#FF4F00',
        webhook: '/api/webhooks/generic',
        required: ['WEBHOOK_API_KEY'],
        fields: [
          { key: 'WEBHOOK_API_KEY', label: 'API Key del webhook genérico', secret: true,
            help: 'Se envía en la cabecera x-api-key de cada petición entrante' },
          { key: 'N8N_API_KEY', label: 'API Key de n8n', secret: true },
        ],
      },
    ],
  },
];

// ── Piezas de UI ──────────────────────────────────────────────────────────────
function StatusPill({ ok }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
      background: ok ? 'var(--green-bg)' : 'var(--gray-100)',
      color: ok ? 'var(--green)' : 'var(--text3)',
      border: `1px solid ${ok ? 'var(--green)' : 'var(--border)'}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: ok ? 'var(--green)' : 'var(--text3)',
      }} />
      {ok ? 'Configurado' : 'Sin configurar'}
    </span>
  );
}

function SecretField({ field, value, hint, isSet, onChange, onClear }) {
  const [visible, setVisible] = useState(false);
  const inputStyle = {
    width: '100%', padding: '8px 10px', fontSize: 13,
    border: '1px solid var(--border)', borderRadius: 8,
    background: 'var(--dark3)', color: 'var(--text)',
    fontFamily: field.secret ? 'monospace' : 'inherit',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: .3 }}>
        {field.label}
      </label>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {field.type === 'select' ? (
          <select style={inputStyle} value={value ?? ''} onChange={e => onChange(e.target.value)}>
            <option value="">— sin cambios —</option>
            {field.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        ) : (
          <input
            style={inputStyle}
            type={field.secret && !visible ? 'password' : 'text'}
            value={value ?? ''}
            autoComplete="off"
            placeholder={isSet ? (field.secret ? hint : 'Guardado — escribe para reemplazar') : (field.placeholder || '')}
            onChange={e => onChange(e.target.value)}
          />
        )}

        {field.secret && field.type !== 'select' && (
          <button type="button" onClick={() => setVisible(v => !v)} title={visible ? 'Ocultar' : 'Mostrar lo que escribes'}
            style={{ padding: 7, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--dark2)', cursor: 'pointer', color: 'var(--text2)', flexShrink: 0 }}>
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}

        {isSet && (
          <button type="button" onClick={onClear} title="Borrar credencial guardada"
            style={{ padding: 7, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--dark2)', cursor: 'pointer', color: 'var(--red)', flexShrink: 0 }}>
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {field.help && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{field.help}</div>}
    </div>
  );
}

function IntegrationCard({ item, status, onSaved, toast }) {
  const [open, setOpen]       = useState(false);
  const [form, setForm]       = useState({});
  const [saving, setSaving]   = useState(false);
  const [testing, setTesting] = useState(false);

  const isConfigured = item.required.every(k => status[k]?.set);
  const Icon = item.icon;

  const setField = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const handleSave = async () => {
    const payload = Object.fromEntries(
      Object.entries(form).filter(([, v]) => String(v ?? '').trim() !== '')
    );
    if (!Object.keys(payload).length) {
      toast('No hay cambios que guardar', 'info');
      return;
    }
    setSaving(true);
    try {
      const r = await saveSettings(payload);
      toast(r.data.message || 'Credenciales guardadas', 'success');
      setForm({});
      onSaved();
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudo guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async (key) => {
    if (!window.confirm(`¿Borrar la credencial ${key}? La integración dejará de funcionar.`)) return;
    try {
      await deleteSetting(key);
      toast('Credencial eliminada', 'success');
      onSaved();
    } catch {
      toast('No se pudo eliminar', 'error');
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const r = await item.test();
      if (!r) return;
      toast(r.data.message || (r.data.success ? 'Conexión correcta' : 'Falló la conexión'),
            r.data.success ? 'success' : 'error');
      onSaved();
    } catch (err) {
      toast(err.response?.data?.message || 'Error al probar la conexión', 'error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{
      background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: 14,
      overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.04)',
    }}>
      {/* Cabecera — clic para desplegar */}
      <div onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 18px', cursor: 'pointer',
      }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12, background: `${item.color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={21} color={item.color} strokeWidth={1.75} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{item.name}</span>
            <StatusPill ok={isConfigured} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{item.desc}</div>
        </div>

        <ChevronDown size={17} color="var(--text3)" style={{
          flexShrink: 0, transition: 'transform .18s', transform: open ? 'rotate(180deg)' : 'none',
        }} />
      </div>

      {/* Formulario */}
      {open && (
        <div style={{ padding: '4px 18px 18px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
            {item.fields.map(f => (
              <SecretField
                key={f.key}
                field={f}
                value={form[f.key]}
                hint={status[f.key]?.hint}
                isSet={!!status[f.key]?.set}
                onChange={v => setField(f.key, v)}
                onClear={() => handleClear(f.key)}
              />
            ))}
          </div>

          {item.webhook && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: .3, marginBottom: 5 }}>
                URL del webhook
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <code style={{
                  flex: 1, fontSize: 11.5, color: 'var(--orange)', fontFamily: 'monospace',
                  background: 'var(--dark3)', padding: '7px 10px', borderRadius: 8, wordBreak: 'break-all',
                  border: '1px solid var(--border)',
                }}>{absoluteUrl(item.webhook)}</code>
                <button type="button" onClick={() => {
                  navigator.clipboard.writeText(absoluteUrl(item.webhook));
                  toast('URL copiada', 'success');
                }} style={{ padding: 7, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--dark2)', cursor: 'pointer', color: 'var(--text2)', flexShrink: 0 }}>
                  <Copy size={14} />
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={handleSave} disabled={saving} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: 'var(--orange)', color: '#fff', fontSize: 12.5, fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer', opacity: saving ? .7 : 1,
            }}>
              <Save size={14} /> {saving ? 'Guardando…' : 'Guardar'}
            </button>

            {item.test && (
              <button onClick={handleTest} disabled={testing} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--dark2)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600,
                cursor: testing ? 'wait' : 'pointer',
              }}>
                <CheckCircle2 size={14} /> {testing ? 'Probando…' : 'Probar conexión'}
              </button>
            )}

            {item.docs && (
              <a href={item.docs} target="_blank" rel="noopener noreferrer" style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 12, color: 'var(--text3)', textDecoration: 'none', marginLeft: 'auto',
              }}>
                Documentación <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function IntegrationsPage({ toast }) {
  const [status, setStatus]     = useState({});
  const [oauth, setOauth]       = useState({});
  const [canManage, setCanManage] = useState(true);
  const [loading, setLoading]   = useState(true);

  // Las dos llamadas van por separado: vincular la cuenta de Google puede hacerlo
  // cualquiera, pero editar credenciales requiere el permiso integrations.manage.
  const load = useCallback(async () => {
    setLoading(true);
    const [sRes, oRes] = await Promise.allSettled([getSettings(), getOAuthStatus()]);

    if (sRes.status === 'fulfilled') {
      setStatus(sRes.value.data.data || {});
      setCanManage(true);
    } else if (sRes.reason?.response?.status === 403) {
      setCanManage(false);
    } else {
      toast('Error al cargar la configuración de integraciones', 'error');
    }

    if (oRes.status === 'fulfilled') setOauth(oRes.value.data.data || {});
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
    // Retorno del OAuth de Google
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) {
      toast(`✅ ${params.get('connected')} conectado`, 'success');
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('error')) {
      toast('Error al conectar: ' + params.get('error'), 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnectGoogle = async () => {
    if (!status.GOOGLE_CLIENT_ID?.set || !status.GOOGLE_CLIENT_SECRET?.set) {
      toast('Primero guarda las credenciales de Google Workspace aquí abajo', 'error');
      return;
    }
    try {
      const r = await connectGoogle();
      if (r.data.url) window.location.href = r.data.url;
    } catch (err) {
      toast(err.response?.data?.message || 'Error al iniciar OAuth de Google', 'error');
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      await disconnectOAuth('google');
      toast('Google desconectado', 'success');
      load();
    } catch {
      toast('Error al desconectar', 'error');
    }
  };

  if (loading) return <div className="loading"><div className="spinner" />Cargando integraciones…</div>;

  const googleAccount = oauth.google;

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

      {/* Aviso de seguridad */}
      {canManage ? (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '12px 15px', marginBottom: 22, borderRadius: 10,
          background: 'var(--green-bg)', border: '1px solid var(--green)',
        }}>
          <ShieldCheck size={17} color="var(--green)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5 }}>
            Todas las credenciales se guardan <strong>cifradas</strong> en la base de datos y se aplican
            al instante, sin reiniciar el sistema. Los secretos ya guardados nunca se muestran completos:
            deja el campo vacío para conservarlos o escribe encima para reemplazarlos.
          </div>
        </div>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '12px 15px', marginBottom: 22, borderRadius: 10,
          background: 'var(--yellow-bg)', border: '1px solid var(--yellow)',
        }}>
          <ShieldCheck size={17} color="var(--yellow)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5 }}>
            Solo puedes vincular tu cuenta personal. Para configurar las credenciales de las
            integraciones necesitas el permiso <code>integrations.manage</code>; pídeselo a un administrador.
          </div>
        </div>
      )}

      {/* Cuenta de Google del usuario */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Mi cuenta de Google</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
          Vincula tu correo y calendario personal al CRM
        </div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 30,
        background: 'var(--dark2)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '16px 18px',
      }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12, background: '#4285F418',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Mail size={21} color="#4285F4" strokeWidth={1.75} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Gmail y Google Calendar</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            {googleAccount?.connected
              ? `Conectado como ${googleAccount.email || 'tu cuenta'}`
              : 'Sin vincular'}
          </div>
        </div>
        {googleAccount?.connected ? (
          <button onClick={handleDisconnectGoogle} style={{
            padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8,
            background: 'var(--dark2)', fontSize: 12.5, fontWeight: 600, color: 'var(--red)', cursor: 'pointer',
          }}>Desvincular</button>
        ) : (
          <button onClick={handleConnectGoogle} style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: '#4285F4', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
          }}>Vincular cuenta</button>
        )}
      </div>

      {/* Catálogo configurable */}
      {canManage && CATALOG.map(group => (
        <div key={group.section} style={{ marginBottom: 30 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{group.section}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{group.subtitle}</div>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {group.items.map(item => (
              <IntegrationCard
                key={item.id}
                item={item}
                status={status}
                onSaved={load}
                toast={toast}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Referencia rápida de webhooks */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Todas las URLs de webhook</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
          Pégalas en la plataforma de origen para recibir leads automáticamente
        </div>
      </div>
      <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: 14, padding: '6px 18px' }}>
        {[
          ['WhatsApp', '/api/whatsapp/webhook'],
          ['Meta Lead Ads', '/api/webhooks/meta'],
          ['LinkedIn', '/api/webhooks/linkedin'],
          ['Genérico (Zapier, Make, n8n)', '/api/webhooks/generic'],
        ].map(([label, path]) => (
          <div key={path} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0',
            borderBottom: '1px solid var(--border)',
          }}>
            <Link2 size={14} color="var(--text3)" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--text2)', minWidth: 170 }}>{label}</span>
            <code style={{
              flex: 1, fontSize: 11.5, color: 'var(--orange)', fontFamily: 'monospace',
              wordBreak: 'break-all',
            }}>{absoluteUrl(path)}</code>
            <button onClick={() => { navigator.clipboard.writeText(absoluteUrl(path)); toast('URL copiada', 'success'); }}
              style={{ padding: 6, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--dark2)', cursor: 'pointer', color: 'var(--text2)', flexShrink: 0 }}>
              <Copy size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
