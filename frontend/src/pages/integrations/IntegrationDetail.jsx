import React, { useState } from 'react';
import {
  ArrowLeft, CheckCircle2, ExternalLink, Copy, Trash2, Save, Eye, EyeOff,
} from 'lucide-react';
import { saveSettings, deleteSetting } from '../../services/api';
import { absoluteUrl } from './catalog';

// Pantalla dedicada a una sola integración: solo sus campos, su webhook y sus
// acciones. La lista vive en IntegrationsPage.

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

export default function IntegrationDetail({ item, status, onSaved, onBack, toast }) {
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
    <div className="page">
      <button onClick={onBack} style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16,
        padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 8,
        background: 'var(--dark2)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
      }}>
        <ArrowLeft size={14} /> Todas las integraciones
      </button>

      {/* Cabecera de la integración */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, background: `${item.color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={26} color={item.color} strokeWidth={1.75} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 19, color: 'var(--text)' }}>{item.name}</span>
            <StatusPill ok={isConfigured} />
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 3 }}>{item.desc}</div>
        </div>
      </div>

      {/* Formulario de credenciales */}
      <div style={{
        background: 'var(--dark2)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '20px 20px 22px', maxWidth: 720,
      }}>
        <div style={{ display: 'grid', gap: 14 }}>
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
          <div style={{ marginTop: 18 }}>
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

        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
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
    </div>
  );
}
