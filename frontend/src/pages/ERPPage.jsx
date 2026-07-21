import React, { useState, useEffect } from 'react';
import { getERPProviders, saveERPProvider, testERPProvider } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, XCircle, Zap, Settings, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

export default function ERPPage({ toast }) {
  const { user } = useAuth();
  const canManage = ['admin', 'gerencia'].includes(user?.role);

  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(null);
  const [testing, setTesting] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await getERPProviders();
      setProviders(r.data.data || []);
    } catch { toast('Error al cargar integraciones ERP', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleExpand = (id) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    const p = providers.find(p => p.id === id);
    // Pre-fill form with existing config
    const flat = {};
    if (p?.config) {
      flat.isEnabled = p.config.isEnabled;
      flat.displayName = p.config.displayName || '';
      const s = p.config.settings || {};
      for (const [k, v] of Object.entries(s)) flat[`settings.${k}`] = v || '';
      const so = p.config.syncOptions || {};
      for (const [k, v] of Object.entries(so)) flat[`syncOptions.${k}`] = v;
    }
    setFormData(f => ({ ...f, [id]: flat }));
  };

  const setField = (providerId, key, val) => {
    setFormData(f => ({ ...f, [providerId]: { ...(f[providerId] || {}), [key]: val } }));
  };

  const handleSave = async (providerId) => {
    setSaving(providerId);
    try {
      const raw = formData[providerId] || {};
      // Reconstruct nested settings
      const settings = {};
      const syncOptions = {};
      for (const [k, v] of Object.entries(raw)) {
        if (k.startsWith('settings.')) settings[k.replace('settings.', '')] = v;
        else if (k.startsWith('syncOptions.')) syncOptions[k.replace('syncOptions.', '')] = v;
      }
      await saveERPProvider(providerId, {
        isEnabled: raw.isEnabled ?? false,
        displayName: raw.displayName || '',
        settings,
        syncOptions,
      });
      toast('Configuración guardada', 'success');
      load();
    } catch (e) { toast(e.response?.data?.message || 'Error al guardar', 'error'); }
    finally { setSaving(null); }
  };

  const handleTest = async (providerId) => {
    setTesting(providerId);
    try {
      const r = await testERPProvider(providerId);
      const { ok, message } = r.data.data;
      toast(`${ok ? '✅' : '❌'} ${message}`, ok ? 'success' : 'error');
      load();
    } catch (e) { toast(e.response?.data?.message || 'Error en test', 'error'); }
    finally { setTesting(null); }
  };

  if (loading) return <div className="loading"><div className="spinner" />Cargando integraciones ERP...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Integraciones ERP</div>
          <div className="page-sub">Conecta el CRM con tu sistema de gestión empresarial</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /></button>
      </div>

      {/* Info banner */}
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#1E40AF' }}>
        💡 Estas integraciones permiten sincronizar clientes, cotizaciones y facturas entre ACON CRM y tu ERP.
        Los datos de conexión se almacenan en tu servidor de forma segura.
        Contacta a tu administrador de sistemas para obtener las credenciales correctas.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {providers.map(p => {
          const cfg = p.config;
          const isExpanded = expandedId === p.id;
          const fd = formData[p.id] || {};
          const isEnabled = cfg?.isEnabled ?? false;
          const lastStatus = cfg?.lastSyncStatus;

          return (
            <div key={p.id} className="card" style={{ padding: 0, overflow: 'hidden', border: `1px solid ${isEnabled ? 'var(--border)' : 'var(--border)'}`, borderLeft: `4px solid ${isEnabled ? '#16A34A' : 'var(--gray-300)'}` }}>
              {/* Header row */}
              <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: canManage ? 'pointer' : 'default' }}
                onClick={() => canManage && toggleExpand(p.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ fontSize: 28 }}>{p.logo}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {p.name}
                      {isEnabled && <span style={{ fontSize: 10, background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>Activo</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{p.description}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {lastStatus && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {lastStatus === 'success' ? <CheckCircle size={14} style={{ color: '#16A34A' }} /> : lastStatus === 'error' ? <XCircle size={14} style={{ color: '#DC2626' }} /> : null}
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {cfg?.lastSync ? new Date(cfg.lastSync).toLocaleDateString('es-MX') : ''}
                      </span>
                    </div>
                  )}
                  {canManage && (isExpanded ? <ChevronUp size={16} style={{ color: 'var(--text3)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text3)' }} />)}
                </div>
              </div>

              {/* Expanded config form */}
              {isExpanded && canManage && (
                <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ paddingTop: 16 }}>
                    {/* Enable toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input type="checkbox" checked={fd.isEnabled ?? false} onChange={e => setField(p.id, 'isEnabled', e.target.checked)} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Activar integración</span>
                      </label>
                    </div>

                    {/* Provider-specific fields */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                      {(p.fields || []).map(field => (
                        <div key={field.key}>
                          <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>{field.label}</label>
                          <input
                            className="form-input"
                            type={field.type || 'text'}
                            placeholder={field.placeholder || ''}
                            value={fd[field.key] ?? ''}
                            onChange={e => setField(p.id, field.key, e.target.value)}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Sync options */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Opciones de sincronización</div>
                      <div style={{ display: 'flex', gap: 16 }}>
                        {[{ k: 'syncOptions.customers', label: 'Clientes' }, { k: 'syncOptions.invoices', label: 'Facturas' }, { k: 'syncOptions.products', label: 'Productos' }].map(({ k, label }) => (
                          <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                            <input type="checkbox" checked={fd[k] ?? false} onChange={e => setField(p.id, k, e.target.checked)} />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Last sync status message */}
                    {cfg?.lastSyncMessage && (
                      <div style={{ fontSize: 12, color: lastStatus === 'error' ? '#DC2626' : '#16A34A', marginBottom: 12, padding: '8px 12px', background: lastStatus === 'error' ? '#FEF2F2' : '#F0FDF4', borderRadius: 6 }}>
                        {cfg.lastSyncMessage}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => handleSave(p.id)} disabled={saving === p.id}>
                        {saving === p.id ? 'Guardando...' : <><Settings size={13} /> Guardar configuración</>}
                      </button>
                      {cfg && (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleTest(p.id)} disabled={testing === p.id}>
                          {testing === p.id ? <RefreshCw size={13} className="spin" /> : <Zap size={13} />} Test de conexión
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin 1s linear infinite}`}</style>
    </div>
  );
}
