import React, { useState, useEffect } from 'react';
import { getLeads, createLead, deleteLead } from '../services/api';
import { ScoreBadge, StageBadge, SourceBadge } from '../components/Badges';

const STAGES = ['new','contacted','qualified','proposal','negotiation','closed_won','closed_lost'];
const SOURCES = ['web','facebook','instagram','linkedin','referral','whatsapp','email','cold_call','other'];
const SERVICES = ['terrestre_nacional','terrestre_internacional','maritimo','aereo','almacenaje','aduana','distribucion'];

export default function LeadsPage({ toast, onSelect }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ company:'', contact:'', email:'', phone:'', whatsapp:'', source:'web', stage:'new', country:'México', services:[] });

  const load = () => {
    setLoading(true);
    getLeads({ search, stage: stageFilter, limit: 100 })
      .then(r => setLeads(r.data.data || []))
      .catch(() => toast('Error al cargar leads', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, stageFilter]);

  const handleCreate = async () => {
    if (!form.company || !form.contact) return toast('Empresa y contacto son requeridos', 'error');
    try {
      await createLead(form);
      toast('Lead creado exitosamente', 'success');
      setShowModal(false);
      setForm({ company:'', contact:'', email:'', phone:'', whatsapp:'', source:'web', stage:'new', country:'México', services:[] });
      load();
    } catch (e) {
      toast(e.response?.data?.message || 'Error al crear lead', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este lead?')) return;
    try {
      await deleteLead(id);
      toast('Lead eliminado', 'success');
      load();
    } catch { toast('Error al eliminar', 'error'); }
  };

  const toggleService = (svc) => {
    setForm(f => ({
      ...f,
      services: f.services.includes(svc) ? f.services.filter(s => s !== svc) : [...f.services, svc]
    }));
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Leads</div>
          <div className="page-sub">{leads.length} prospectos en total</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Nuevo Lead</button>
      </div>

      {/* Filtros */}
      <div className="card card-sm" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <input className="form-input" style={{ flex: 1 }} placeholder="🔍 Buscar empresa, contacto, email..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-select" style={{ width: 180 }} value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
          <option value="">Todas las etapas</option>
          {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={load}>↻ Actualizar</button>
      </div>

      {/* Tabla */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading"><div className="spinner" />Cargando leads...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Contacto</th>
                  <th>Score</th>
                  <th>Etapa</th>
                  <th>Fuente</th>
                  <th>País</th>
                  <th>Valor</th>
                  <th>Asignado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>
                    No hay leads. ¡Crea el primero!
                  </td></tr>
                )}
                {leads.map(l => (
                  <tr key={l._id} style={{ cursor: 'pointer' }} onClick={() => onSelect(l._id)}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{l.company}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{l.city || l.country}</div>
                    </td>
                    <td>
                      <div>{l.contact?.name || l.contact}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{l.contact?.email || l.email}</div>
                    </td>
                    <td><ScoreBadge score={l.score || 0} /></td>
                    <td><StageBadge stage={l.stage} /></td>
                    <td><SourceBadge source={l.source} /></td>
                    <td style={{ color: 'var(--text2)', fontSize: 12 }}>{l.country}</td>
                    <td style={{ fontWeight: 600, color: 'var(--green)' }}>${(l.value || 0).toLocaleString()}</td>
                    <td>
                      {l.assignedTo ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div className="avatar" style={{ width: 24, height: 24, fontSize: 9 }}>{l.assignedTo.avatar || l.assignedTo.name?.slice(0,2).toUpperCase()}</div>
                          <span style={{ fontSize: 12 }}>{l.assignedTo.name}</span>
                        </div>
                      ) : <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-sm" onClick={() => onSelect(l._id)}>Ver</button>
                      <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6, color: 'var(--red)' }} onClick={() => handleDelete(l._id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal nuevo lead */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Nuevo Lead</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Empresa *</label>
                <input className="form-input" value={form.company} onChange={e => setForm(f => ({...f, company: e.target.value}))} placeholder="Nombre de la empresa" />
              </div>
              <div className="form-group">
                <label className="form-label">Contacto *</label>
                <input className="form-input" value={form.contact} onChange={e => setForm(f => ({...f, contact: e.target.value}))} placeholder="Nombre del contacto" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="email@empresa.com" />
              </div>
              <div className="form-group">
                <label className="form-label">WhatsApp</label>
                <input className="form-input" value={form.whatsapp} onChange={e => setForm(f => ({...f, whatsapp: e.target.value}))} placeholder="+521..." />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Fuente</label>
                <select className="form-select" value={form.source} onChange={e => setForm(f => ({...f, source: e.target.value}))}>
                  {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">País</label>
                <input className="form-input" value={form.country} onChange={e => setForm(f => ({...f, country: e.target.value}))} placeholder="México" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Servicios de interés</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SERVICES.map(s => (
                  <button key={s} type="button"
                    className={`btn btn-sm ${form.services.includes(s) ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => toggleService(s)}>{s}</button>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCreate}>Crear Lead</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
