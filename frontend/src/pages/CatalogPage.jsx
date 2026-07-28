import React, { useState, useEffect } from 'react';
import { getCatalog, createCatalogItem, updateCatalogItem, deleteCatalogItem, seedCatalog, uploadCatalogImage, deleteCatalogImage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Plus, Search, Edit2, Trash2, BookOpen, Download, Image } from 'lucide-react';

const TYPE_LABELS = {
  puerto:         { label: 'Puertos',         emoji: '⚓' },
  aduana:         { label: 'Aduanas',         emoji: '🛃' },
  aeropuerto:     { label: 'Aeropuertos',     emoji: '✈️' },
  naviera:        { label: 'Navieras',        emoji: '🚢' },
  aerolinea:      { label: 'Aerolíneas',      emoji: '🛫' },
  transportista:  { label: 'Transportistas',  emoji: '🚛' },
  incoterm:       { label: 'Incoterms',       emoji: '📋' },
  contenedor:     { label: 'Contenedores',    emoji: '📦' },
  ruta_frecuente: { label: 'Rutas Frecuentes',emoji: '🗺️' },
  pais:           { label: 'Países',          emoji: '🌎' },
  ciudad:         { label: 'Ciudades',        emoji: '🏙️' },
};

const EMPTY_FORM = { type: 'puerto', code: '', name: '', country: '', region: '' };

export default function CatalogPage({ toast }) {
  const { user } = useAuth();
  const canEdit = ['admin', 'gerencia', 'operaciones'].includes(user?.role);

  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [activeType, setActiveType] = useState('puerto');
  const [search, setSearch]     = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [editing, setEditing]   = useState(null);
  const [saving, setSaving]     = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await getCatalog({ type: activeType, search });
      setItems(r.data.data || []);
    } catch { toast('Error al cargar catálogo', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [activeType, search]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, type: activeType });
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (item) => {
    setForm({ type: item.type, code: item.code || '', name: item.name, country: item.country || '', region: item.region || '' });
    setEditing(item._id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name) return toast('El nombre es requerido', 'error');
    setSaving(true);
    try {
      if (editing) {
        await updateCatalogItem(editing, form);
        toast('Registro actualizado', 'success');
      } else {
        await createCatalogItem(form);
        toast('Registro creado', 'success');
      }
      setShowForm(false);
      load();
    } catch { toast('Error al guardar', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`¿Desactivar "${name}"?`)) return;
    try {
      await deleteCatalogItem(id);
      toast('Registro desactivado', 'success');
      load();
    } catch { toast('Error al eliminar', 'error'); }
  };

  const handleSeed = async () => {
    if (!window.confirm('¿Cargar los datos iniciales del catálogo? Solo funciona si el catálogo está vacío.')) return;
    try {
      const r = await seedCatalog();
      toast(r.data.message, 'success');
      load();
    } catch (err) { toast(err.response?.data?.message || 'Error', 'error'); }
  };

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const currentType = TYPE_LABELS[activeType] || {};

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Catálogo Logístico</div>
          <div className="page-sub">{items.length} registros en {currentType.label} — datos maestros de operaciones</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canEdit && items.length === 0 && (
            <button className="btn btn-ghost" onClick={handleSeed}>
              <Download size={13} /> Cargar datos iniciales
            </button>
          )}
          {canEdit && (
            <button className="btn btn-primary" onClick={openCreate}>
              <Plus size={14} /> Nuevo registro
            </button>
          )}
        </div>
      </div>

      {/* Tabs por tipo */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {Object.entries(TYPE_LABELS).map(([id, { label, emoji }]) => (
          <button
            key={id}
            className={`btn btn-sm ${activeType === id ? 'btn-navy' : 'btn-ghost'}`}
            onClick={() => setActiveType(id)}
            style={{ whiteSpace: 'nowrap' }}
          >
            {emoji} {label}
          </button>
        ))}
      </div>

      {/* Buscador */}
      <div className="card card-sm" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Search size={13} style={{ color: 'var(--gray-400)' }} />
        <input
          className="form-input"
          style={{ border: 'none', padding: 0, background: 'transparent' }}
          placeholder={`Buscar en ${currentType.label}...`}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Tabla */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading"><div className="spinner" />Cargando...</div>
        ) : items.length === 0 ? (
          <div className="empty-state" style={{ padding: 60, textAlign: 'center' }}>
            <BookOpen size={36} style={{ color: 'var(--gray-300)', marginBottom: 12 }} />
            <div style={{ color: 'var(--gray-500)', marginBottom: 8 }}>Sin registros en {currentType.label}</div>
            {canEdit && (
              <button className="btn btn-primary btn-sm" onClick={openCreate}><Plus size={12} /> Agregar primero</button>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--gray-500)', fontWeight: 600 }}>Código</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--gray-500)', fontWeight: 600 }}>Nombre</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--gray-500)', fontWeight: 600 }}>País</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--gray-500)', fontWeight: 600 }}>Región</th>
                {canEdit && <th style={{ padding: '10px 16px', width: 80 }} />}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item._id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: 'monospace', color: 'var(--blue)', fontWeight: 600 }}>
                    {item.code || '—'}
                  </td>
                  <td style={{ padding: '10px 16px', fontWeight: 500, color: 'var(--text)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 4, border: '1px solid var(--border)' }} />
                      ) : canEdit ? (
                        <label title="Subir imagen" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, border: '1px dashed var(--border)', borderRadius: 4, color: 'var(--text3)' }}>
                          <Image size={13} />
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                            const file = e.target.files?.[0]; if (!file) return;
                            try {
                              await uploadCatalogImage(item._id, file);
                              toast('Imagen subida', 'success');
                              // Reload catalog items
                              const r = await getCatalog({ type: activeType, search: search || undefined });
                              setItems(r.data.data || []);
                            } catch { toast('Error al subir imagen', 'error'); }
                          }} />
                        </label>
                      ) : null}
                      <div>
                        {item.name}
                        {item.extra?.descripcion && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>{item.extra.descripcion}</div>}
                        {item.extra?.capacidadM3 && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>{item.extra.teus} TEU · {item.extra.capacidadM3} m³</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text2)' }}>{item.country || '—'}</td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text2)' }}>{item.region || '—'}</td>
                  {canEdit && (
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(item)} title="Editar">
                          <Edit2 size={12} />
                        </button>
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleDelete(item._id, item.name)} title="Desactivar"
                          style={{ color: 'var(--red)' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal de edición */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
                {editing ? 'Editar registro' : 'Nuevo registro'}
              </div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4, display: 'block' }}>Tipo</label>
                <select className="form-select" value={form.type} onChange={e => f('type', e.target.value)}>
                  {Object.entries(TYPE_LABELS).map(([id, { label }]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4, display: 'block' }}>Código (IATA, LOCODE, etc.)</label>
                <input className="form-input" value={form.code} onChange={e => f('code', e.target.value)} placeholder="Ej: MEX, SHA, MAERSK" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4, display: 'block' }}>Nombre *</label>
                <input className="form-input" value={form.name} onChange={e => f('name', e.target.value)} placeholder="Nombre completo" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4, display: 'block' }}>País</label>
                  <input className="form-input" value={form.country} onChange={e => f('country', e.target.value)} placeholder="Ej: México" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4, display: 'block' }}>Región</label>
                  <input className="form-input" value={form.region} onChange={e => f('region', e.target.value)} placeholder="Ej: Pacífico" />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
