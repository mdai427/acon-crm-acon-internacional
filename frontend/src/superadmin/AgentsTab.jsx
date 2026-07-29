import React, { useCallback, useEffect, useState } from 'react';
import { Save, KeyRound, RefreshCw, CheckCircle2, Info, ExternalLink } from 'lucide-react';
import {
  getSuperAi, saveSuperAi, getSuperAiModels, testSuperAi, syncSuperAiPrices,
} from '../services/api';
import { formatDateTime } from './format';

// Proveedores de IA y modelo de cada agente del CRM.
//
// El cliente no elige nada de esto: aquí se define con qué proveedor y con qué
// modelo trabaja cada función, y de dónde salen los precios de referencia.

const HERENCIA = '__default__'; // valor del selector para "usar el por defecto"

function ProviderCard({ provider, value, onChange, onTest, testing }) {
  return (
    <div className="sa-provider">
      <div className="sa-provider-head">
        <KeyRound size={15} />
        <strong>{provider.name}</strong>
        <span className={`sa-pill${provider.apiKeySet ? '' : ' closed'}`}>
          {provider.apiKeySet ? 'Con clave' : 'Sin clave'}
        </span>
        <a href={provider.docs} target="_blank" rel="noopener noreferrer" className="sa-provider-docs">
          Obtener clave <ExternalLink size={11} />
        </a>
      </div>

      <div className="sa-provider-row">
        <input
          type="password"
          autoComplete="off"
          placeholder={provider.apiKeySet ? provider.apiKeyMask : provider.keyHint}
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
        />
        <button className="sa-btn ghost sm" onClick={() => onTest(provider.id)} disabled={testing === provider.id}>
          <CheckCircle2 size={13} /> {testing === provider.id ? 'Probando…' : 'Probar'}
        </button>
      </div>

      <div className="sa-provider-note">
        {provider.envKey}
        {provider.supportsAudio && ' · único con transcripción de audio'}
      </div>
    </div>
  );
}

export default function AgentsTab({ toast }) {
  const [data, setData] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [keys, setKeys] = useState({});
  const [agents, setAgents] = useState([]);
  const [defaults, setDefaults] = useState({ provider: 'openai', chat: '', audio: '' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await getSuperAi();
      const d = r.data.data;
      setData(d);
      setAgents(d.agents || []);
      setDefaults({
        provider: d.defaultProvider || 'openai',
        chat: d.defaultChatModel || '',
        audio: d.defaultAudioModel || '',
      });
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudo cargar la configuración de IA', 'error');
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // El catálogo viene de OpenRouter y puede tardar; se carga aparte para no
  // bloquear la pantalla si su API no responde.
  useEffect(() => {
    getSuperAiModels()
      .then(r => setCatalog(r.data.data || []))
      .catch(() => setCatalog([]));
  }, []);

  const modelsFor = (providerId) =>
    catalog.find(g => g.provider === providerId)?.models || [];

  const setAgentField = (id, field, value) => {
    setAgents(list => list.map(a => (a.id === id ? { ...a, [field]: value } : a)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await saveSuperAi({
        apiKeys: keys,
        defaultProvider: defaults.provider,
        defaultChatModel: defaults.chat,
        defaultAudioModel: defaults.audio,
        agents: agents.map(a => ({ agent: a.id, provider: a.provider, model: a.model })),
      });
      toast(r.data.message, 'success');
      setKeys({});
      await load();
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudo guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (providerId) => {
    setTesting(providerId);
    try {
      const r = await testSuperAi({ provider: providerId });
      toast(r.data.message, r.data.success ? 'success' : 'error');
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudo probar', 'error');
    } finally {
      setTesting(null);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await syncSuperAiPrices();
      toast(r.data.message, 'success');
      await load();
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudo sincronizar', 'error');
    } finally {
      setSyncing(false);
    }
  };

  if (!data) return <div className="sa-loading">Cargando configuración de IA…</div>;

  return (
    <div className="sa-page">
      <div className="sa-page-head">
        <div>
          <h1>Proveedores y agentes</h1>
          <p>Con qué proveedor y con qué modelo trabaja cada función del CRM.</p>
        </div>
        <button className="sa-btn" onClick={handleSave} disabled={saving}>
          <Save size={14} /> {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>

      {/* Claves de los proveedores */}
      <div className="sa-card">
        <h2><KeyRound size={15} /> Claves de API</h2>
        <p className="sa-card-sub">
          Solo se guardan aquí: el CRM del cliente no puede verlas ni cambiarlas. Deja el campo
          vacío para conservar la clave actual.
        </p>
        <div className="sa-providers">
          {data.providers.map(p => (
            <ProviderCard
              key={p.id}
              provider={p}
              value={keys[p.id]}
              onChange={v => setKeys(k => ({ ...k, [p.id]: v }))}
              onTest={handleTest}
              testing={testing}
            />
          ))}
        </div>
      </div>

      {/* Valores por defecto */}
      <div className="sa-card">
        <h2>Configuración por defecto</h2>
        <p className="sa-card-sub">
          Lo que usa cualquier agente que no tenga asignación propia.
        </p>
        <div className="sa-defaults">
          <label>
            <span>Proveedor</span>
            <select value={defaults.provider} onChange={e => setDefaults(d => ({ ...d, provider: e.target.value }))}>
              {data.providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>
            <span>Modelo de chat</span>
            <input
              list="sa-models-default"
              value={defaults.chat}
              placeholder="gpt-4o-mini"
              onChange={e => setDefaults(d => ({ ...d, chat: e.target.value }))}
            />
            <datalist id="sa-models-default">
              {modelsFor(defaults.provider).map(m => <option key={m.model} value={m.model}>{m.label}</option>)}
            </datalist>
          </label>
          <label>
            <span>Modelo de audio</span>
            <input
              value={defaults.audio}
              placeholder="whisper-1"
              onChange={e => setDefaults(d => ({ ...d, audio: e.target.value }))}
            />
          </label>
        </div>
      </div>

      {/* Precios de referencia */}
      <div className="sa-card">
        <h2>Precios de referencia</h2>
        <p className="sa-card-sub">
          Los costos salen del catálogo público de OpenRouter, que publica el precio de casi todos
          los modelos del mercado. Se aplica a todos los proveedores; los precios que hayas fijado a
          mano en Tarifas no se tocan.
        </p>
        <div className="sa-sync-row">
          <button className="sa-btn ghost" onClick={handleSync} disabled={syncing}>
            <RefreshCw size={14} /> {syncing ? 'Actualizando…' : 'Actualizar precios ahora'}
          </button>
          <span className="sa-sync-note">
            Última sincronización: {data.pricesSyncedAt ? formatDateTime(data.pricesSyncedAt) : 'nunca'}
          </span>
        </div>
      </div>

      {/* Agentes */}
      <div className="sa-card">
        <h2>Agentes del CRM</h2>
        <p className="sa-card-sub">
          Cada función que consume IA. Déjalo en “Por defecto” para que siga la configuración de
          arriba, o asígnale un proveedor y un modelo propios.
        </p>

        <div className="sa-table-wrap">
          <table className="sa-table sa-agents">
            <thead>
              <tr>
                <th>Agente</th>
                <th>Proveedor</th>
                <th>Modelo</th>
                <th>En uso</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(agent => {
                const isAudio = agent.kind === 'audio';
                const providerId = agent.provider || defaults.provider;
                return (
                  <tr key={agent.id}>
                    <td>
                      <strong>{agent.name}</strong>
                      <div className="sa-sub">{agent.description}</div>
                      <div className="sa-sub">{agent.where}</div>
                    </td>
                    <td>
                      <select
                        value={agent.provider || HERENCIA}
                        disabled={isAudio}
                        onChange={e => setAgentField(agent.id, 'provider',
                          e.target.value === HERENCIA ? '' : e.target.value)}
                      >
                        <option value={HERENCIA}>Por defecto</option>
                        {data.providers.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        list={`sa-models-${agent.id}`}
                        value={agent.model || ''}
                        placeholder="Por defecto"
                        onChange={e => setAgentField(agent.id, 'model', e.target.value)}
                      />
                      <datalist id={`sa-models-${agent.id}`}>
                        {modelsFor(providerId).map(m => (
                          <option key={m.model} value={m.model}>{m.label}</option>
                        ))}
                      </datalist>
                    </td>
                    <td>
                      <div className="sa-effective">{agent.effectiveModel}</div>
                      <div className="sa-sub">{agent.effectiveProvider}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="sa-hint" style={{ marginTop: 14 }}>
          <Info size={13} />
          La transcripción de llamadas queda fijada a OpenAI: es el único de los tres proveedores
          con Whisper.
        </div>
      </div>
    </div>
  );
}
