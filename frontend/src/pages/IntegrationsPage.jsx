import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  getOAuthStatus, connectGoogle, disconnectOAuth, getSettings,
} from '../services/api';
import {
  RefreshCw, Copy, Mail, Link2, ChevronRight, ShieldCheck,
} from 'lucide-react';
import { CATALOG, findIntegration, absoluteUrl } from './integrations/catalog';
import IntegrationDetail from './integrations/IntegrationDetail';

// La lista solo muestra tarjetas; al elegir una se abre su propia pantalla
// (/integrations/<id>) con únicamente los campos de esa integración.

function StatusPill({ ok }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
      background: ok ? 'var(--green-bg)' : 'var(--gray-100)',
      color: ok ? 'var(--green)' : 'var(--text3)',
      border: `1px solid ${ok ? 'var(--green)' : 'var(--border)'}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? 'var(--green)' : 'var(--text3)' }} />
      {ok ? 'Configurado' : 'Sin configurar'}
    </span>
  );
}

function IntegrationCard({ item, status, onOpen }) {
  const isConfigured = item.required.every(k => status[k]?.set);
  const Icon = item.icon;

  return (
    <button
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
        background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: 14,
        padding: '16px 18px', cursor: 'pointer', color: 'inherit', font: 'inherit',
        boxShadow: '0 1px 4px rgba(0,0,0,.04)',
      }}
    >
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

      <ChevronRight size={17} color="var(--text3)" style={{ flexShrink: 0 }} />
    </button>
  );
}

export default function IntegrationsPage({ toast, integrationId, onSelectIntegration }) {
  const [status, setStatus]       = useState({});
  const [oauth, setOauth]         = useState({});
  const [canManage, setCanManage] = useState(true);
  const [loading, setLoading]     = useState(true);

  // Cuando App no controla la URL (por ejemplo en pruebas), la selección se
  // mantiene en estado local.
  const [localId, setLocalId] = useState(null);
  const selectedId = integrationId !== undefined ? integrationId : localId;
  const select = onSelectIntegration || setLocalId;

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

  // Carga inicial y aviso del retorno de OAuth. El guard evita repetirlo si
  // cambia la identidad de `toast` (así no hace falta silenciar exhaustive-deps).
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    load();
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) {
      toast(`✅ ${params.get('connected')} conectado`, 'success');
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('error')) {
      toast('Error al conectar: ' + params.get('error'), 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [load, toast]);

  const handleConnectGoogle = async () => {
    if (!status.GOOGLE_CLIENT_ID?.set || !status.GOOGLE_CLIENT_SECRET?.set) {
      toast('Primero configura las credenciales de Google Workspace', 'error');
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

  // ── Pantalla de detalle ─────────────────────────────────────────────────────
  const selected = selectedId ? findIntegration(selectedId) : null;
  if (selectedId && canManage) {
    if (!selected) {
      return (
        <div className="page">
          <div className="page-title">Integración no encontrada</div>
          <button className="btn btn-ghost btn-sm" onClick={() => select(null)} style={{ marginTop: 12 }}>
            Volver a integraciones
          </button>
        </div>
      );
    }
    return (
      <IntegrationDetail
        item={selected}
        status={status}
        onSaved={load}
        onBack={() => select(null)}
        toast={toast}
      />
    );
  }

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
                onOpen={() => select(item.id)}
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
