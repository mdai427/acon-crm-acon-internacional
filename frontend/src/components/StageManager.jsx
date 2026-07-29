import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2, ArrowUp, ArrowDown, Save, Lock, GripVertical } from 'lucide-react';
import {
  getPipelineStages, createPipelineStage, updatePipelineStage,
  reorderPipelineStages, deletePipelineStage,
} from '../services/api';

// Editor de las etapas del tablero: crear, renombrar, recolorear, reordenar y
// eliminar. Las etapas de sistema (Nuevos, Ganado, Perdido) se pueden renombrar
// y recolorear, pero no borrar: hay comisiones y reportes colgando de ellas.

const COLORES = ['#6366F1', '#3B82F6', '#0EA5E9', '#14B8A6', '#16A34A',
                 '#F59E0B', '#F97316', '#EF4444', '#DC2626', '#8B5CF6', '#EC4899', '#6B7280'];

function ColorPicker({ value, onChange }) {
  return (
    <div className="stage-colors">
      {COLORES.map(c => (
        <button
          key={c}
          type="button"
          className={`stage-color${value === c ? ' is-active' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={`Color ${c}`}
        />
      ))}
    </div>
  );
}

export default function StageManager({ onClose, onSaved, toast }) {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState({ label: '', color: COLORES[0] });
  const [guardando, setGuardando] = useState(null);
  const [borrando, setBorrando] = useState(null); // { stage, destino }

  const load = async () => {
    try {
      const r = await getPipelineStages();
      setStages(r.data.data || []);
    } catch {
      toast('No se pudieron cargar las etapas', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const setField = (id, campo, valor) =>
    setStages(list => list.map(s => (s._id === id ? { ...s, [campo]: valor, _dirty: true } : s)));

  const handleCrear = async () => {
    if (!nuevo.label.trim()) { toast('Escribe el nombre de la etapa', 'info'); return; }
    try {
      const r = await createPipelineStage(nuevo);
      toast(r.data.message, 'success');
      setNuevo({ label: '', color: COLORES[0] });
      await load();
      onSaved?.();
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudo crear la etapa', 'error');
    }
  };

  const handleGuardar = async (stage) => {
    setGuardando(stage._id);
    try {
      await updatePipelineStage(stage._id, {
        label: stage.label, color: stage.color, description: stage.description,
      });
      toast('Etapa actualizada', 'success');
      await load();
      onSaved?.();
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudo guardar', 'error');
    } finally {
      setGuardando(null);
    }
  };

  const mover = async (index, delta) => {
    const destino = index + delta;
    if (destino < 0 || destino >= stages.length) return;
    const copia = [...stages];
    [copia[index], copia[destino]] = [copia[destino], copia[index]];
    setStages(copia);
    try {
      await reorderPipelineStages(copia.map(s => s._id));
      onSaved?.();
    } catch {
      toast('No se pudo reordenar', 'error');
      load();
    }
  };

  const handleBorrar = async (stage, moveTo) => {
    try {
      const r = await deletePipelineStage(stage._id, moveTo);
      toast(r.data.message, 'success');
      setBorrando(null);
      await load();
      onSaved?.();
    } catch (err) {
      const data = err.response?.data;
      if (data?.needsTarget) {
        // Tiene leads: hay que decir a dónde se mueven antes de borrarla.
        setBorrando({ stage, count: data.count, destino: '' });
        return;
      }
      toast(data?.message || 'No se pudo eliminar', 'error');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal stage-modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Etapas del pipeline</div>
            <div className="stage-modal-sub">
              El orden es el del tablero. Renombrar no afecta a los leads ya clasificados.
            </div>
          </div>
          <button className="modal-close" onClick={onClose}><X size={17} /></button>
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" />Cargando etapas…</div>
        ) : (
          <div>
            {/* Lista de etapas */}
            <div className="stage-list">
              {stages.map((stage, index) => (
                <div key={stage._id} className="stage-row">
                  <div className="stage-order">
                    <button onClick={() => mover(index, -1)} disabled={index === 0} title="Subir">
                      <ArrowUp size={13} />
                    </button>
                    <button onClick={() => mover(index, 1)} disabled={index === stages.length - 1} title="Bajar">
                      <ArrowDown size={13} />
                    </button>
                  </div>

                  <GripVertical size={14} className="stage-grip" />

                  <div className="stage-main">
                    <input
                      className="stage-input"
                      value={stage.label}
                      onChange={e => setField(stage._id, 'label', e.target.value)}
                    />
                    <ColorPicker value={stage.color} onChange={c => setField(stage._id, 'color', c)} />
                  </div>

                  <div className="stage-tags">
                    {stage.type === 'won'  && <span className="stage-tag won">Cierre ganado</span>}
                    {stage.type === 'lost' && <span className="stage-tag lost">Cierre perdido</span>}
                    {stage.isSystem && (
                      <span className="stage-tag sys" title="Etapa del sistema: no se puede eliminar">
                        <Lock size={10} /> Fija
                      </span>
                    )}
                  </div>

                  <div className="stage-actions">
                    {stage._dirty && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleGuardar(stage)}
                        disabled={guardando === stage._id}
                      >
                        <Save size={12} /> {guardando === stage._id ? '…' : 'Guardar'}
                      </button>
                    )}
                    <button
                      className="stage-del"
                      onClick={() => handleBorrar(stage)}
                      disabled={stage.isSystem}
                      title={stage.isSystem ? 'Etapa del sistema' : 'Eliminar etapa'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Confirmación de borrado con leads dentro */}
            {borrando && (
              <div className="stage-delete-box">
                <div className="stage-delete-title">
                  «{borrando.stage.label}» tiene {borrando.count} lead(s)
                </div>
                <div className="stage-delete-sub">¿A qué etapa los movemos?</div>
                <div className="stage-delete-row">
                  <select
                    className="form-select"
                    value={borrando.destino}
                    onChange={e => setBorrando(b => ({ ...b, destino: e.target.value }))}
                  >
                    <option value="">Selecciona una etapa…</option>
                    {stages.filter(s => s.key !== borrando.stage.key).map(s => (
                      <option key={s._id} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                  <button
                    className="btn btn-danger btn-sm"
                    disabled={!borrando.destino}
                    onClick={() => handleBorrar(borrando.stage, borrando.destino)}
                  >
                    Mover y eliminar
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setBorrando(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Nueva etapa */}
            <div className="stage-new">
              <div className="stage-new-title">Añadir etapa</div>
              <div className="stage-new-row">
                <input
                  className="stage-input"
                  placeholder="Nombre de la etapa"
                  value={nuevo.label}
                  onChange={e => setNuevo(n => ({ ...n, label: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleCrear()}
                />
                <ColorPicker value={nuevo.color} onChange={c => setNuevo(n => ({ ...n, color: c }))} />
                <button className="btn btn-primary btn-sm" onClick={handleCrear}>
                  <Plus size={13} /> Añadir
                </button>
              </div>
              <div className="stage-new-hint">
                Se coloca antes de las etapas de cierre, que van siempre al final.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
