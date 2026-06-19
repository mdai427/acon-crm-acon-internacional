import React, { useState, useEffect } from 'react';
import { getTemplates2, createTemplate, updateTemplate, deleteTemplate } from '../services/api';
import { Plus, Edit2, Trash2, FileText } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

const STAGES = ['general','new','contacted','qualified','proposal','negotiation','closed_won','closed_lost'];
const CHANNELS = ['whatsapp','email','call_script'];
const STAGE_LABELS = {
  general: 'General', new: 'Nuevo', contacted: 'Contactado', qualified: 'Calificado',
  proposal: 'Propuesta', negotiation: 'Negociación', closed_won: 'Ganado', closed_lost: 'Perdido'
};
const CHANNEL_LABELS = { whatsapp: 'WhatsApp', email: 'Email', call_script: 'Script de llamada' };

const emptyForm = { name: '', stage: 'general', channel: 'whatsapp', subject: '', body: '' };

export default function TemplatesPage({ toast }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [stageFilter, setStageFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');

  const load = () => {
    setLoading(true);
    const params = {};
    if (stageFilter) params.stage = stageFilter;
    if (channelFilter) params.channel = channelFilter;
    getTemplates2(params)
      .then(r => setTemplates(r.data.data || []))
      .catch(() => toast('Error al cargar plantillas', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [stageFilter, channelFilter]);

  const openCreate = () => { setForm(emptyForm); setEditId(null); setShowModal(true); };
  const openEdit = (t) => { setForm({ name: t.name, stage: t.stage, channel: t.channel, subject: t.subject || '', body: t.body }); setEditId(t._id); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name || !form.body) return toast('Nombre y cuerpo son requeridos', 'error');
    try {
      if (editId) {
        await updateTemplate(editId, form);
        toast('Plantilla actualizada', 'success');
      } else {
        await createTemplate(form);
        toast('Plantilla creada', 'success');
      }
      setShowModal(false);
      load();
    } catch (e) {
      toast(e.response?.data?.message || 'Error al guardar', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTemplate(confirmDelete);
      toast('Plantilla eliminada', 'success');
      setConfirmDelete(null);
      load();
    } catch {
      toast('Error al eliminar', 'error');
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Plantillas de comunicación</h1>
          <p className="page-subtitle">Mensajes reutilizables por etapa y canal</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} /> Nueva plantilla
        </button>
      </div>

      {/* Filters */}
      <div className="filters-row" style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <select className="input" value={stageFilter} onChange={e => setStageFilter(e.target.value)} style={{ width: 180 }}>
          <option value="">Todas las etapas</option>
          {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
        </select>
        <select className="input" value={channelFilter} onChange={e => setChannelFilter(e.target.value)} style={{ width: 180 }}>
          <option value="">Todos los canales</option>
          {CHANNELS.map(c => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /> Cargando...</div>
      ) : templates.length === 0 ? (
        <div className="empty-state">
          <FileText size={40} opacity={0.3} />
          <p>No hay plantillas. Crea la primera.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {templates.map(t => (
            <div key={t._id} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{t.name}</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <span className="badge badge-info">{STAGE_LABELS[t.stage] || t.stage}</span>
                    <span className="badge">{CHANNEL_LABELS[t.channel] || t.channel}</span>
                  </div>
                  {t.subject && <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>Asunto: {t.subject}</div>}
                  <div style={{ fontSize: 13, color: 'var(--text2)', whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'hidden' }}>{t.body}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)}><Edit2 size={14} /></button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => setConfirmDelete(t._id)}><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{editId ? 'Editar plantilla' : 'Nueva plantilla'}</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="form-grid" style={{ display: 'grid', gap: 12 }}>
              <div>
                <label className="label">Nombre</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej. Primer contacto WhatsApp" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="label">Etapa</label>
                  <select className="input" value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}>
                    {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Canal</label>
                  <select className="input" value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}>
                    {CHANNELS.map(c => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
                  </select>
                </div>
              </div>
              {form.channel === 'email' && (
                <div>
                  <label className="label">Asunto</label>
                  <input className="input" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Asunto del correo" />
                </div>
              )}
              <div>
                <label className="label">Cuerpo <span style={{ color: 'var(--text3)', fontSize: 11 }}>— usa {'{{nombre}}'}, {'{{empresa}}'}, {'{{servicio}}'}</span></label>
                <textarea className="input" rows={6} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Hola {{nombre}}, te contactamos de ACON Internacional..." />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave}>Guardar plantilla</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Eliminar plantilla"
        message="Esta acción no se puede deshacer."
        danger
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
