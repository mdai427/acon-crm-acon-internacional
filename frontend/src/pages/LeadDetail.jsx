import React, { useEffect, useState } from 'react';
import { getLead, updateLead, getActivities, createActivity, draftEmail, rescoreLead, sendEmail } from '../services/api';
import { ScoreBadge, StageBadge, SourceBadge } from '../components/Badges';
import { UserPlus, Trash2 } from 'lucide-react';

const STAGES = ['new','contacted','qualified','proposal','negotiation','closed_won','closed_lost'];
const STAGE_LABELS = { new:'Nuevo', contacted:'Contactado', qualified:'Calificado', proposal:'Propuesta', negotiation:'Negociación', closed_won:'Ganado', closed_lost:'Perdido' };

export default function LeadDetail({ leadId, toast, onBack }) {
  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({});
  const [draftLoading, setDraftLoading] = useState(false);
  const [draft, setDraft] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [newContact, setNewContact] = useState({ name: '', email: '', phone: '', role: '' });
  const [showContactForm, setShowContactForm] = useState(false);

  const load = async () => {
    try {
      const [lRes, aRes] = await Promise.all([getLead(leadId), getActivities(leadId)]);
      const l = lRes.data.data;
      setLead(l);
      setForm({ stage: l.stage, value: l.value, priority: l.priority, notes: l.notes });
      setContacts(l.additionalContacts || []);
      setActivities(aRes.data.data || []);
    } catch { toast('Error al cargar lead', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [leadId]);

  const addNote = async () => {
    if (!noteText.trim()) return;
    try {
      await createActivity({ lead: leadId, type: 'note', content: noteText, direction: 'internal' });
      setNoteText('');
      toast('Nota agregada', 'success');
      load();
    } catch { toast('Error al agregar nota', 'error'); }
  };

  const handleUpdate = async () => {
    try {
      await updateLead(leadId, form);
      toast('Lead actualizado', 'success');
      setEditMode(false);
      load();
    } catch { toast('Error al actualizar', 'error'); }
  };

  const handleRescore = async () => {
    try {
      await rescoreLead(leadId);
      toast('Score actualizado con IA', 'success');
      load();
    } catch { toast('OpenAI no configurado', 'error'); }
  };

  const addContact = async () => {
    if (!newContact.name) return toast('El nombre es requerido', 'error');
    const updated = [...contacts, newContact];
    try {
      await updateLead(leadId, { additionalContacts: updated });
      setContacts(updated);
      setNewContact({ name: '', email: '', phone: '', role: '' });
      setShowContactForm(false);
      toast('Contacto agregado', 'success');
    } catch { toast('Error al agregar contacto', 'error'); }
  };

  const removeContact = async (idx) => {
    const updated = contacts.filter((_, i) => i !== idx);
    try {
      await updateLead(leadId, { additionalContacts: updated });
      setContacts(updated);
      toast('Contacto eliminado', 'success');
    } catch { toast('Error al eliminar contacto', 'error'); }
  };

  const handleDraftEmail = async () => {
    setDraftLoading(true);
    try {
      const r = await draftEmail({ leadId, purpose: 'seguimiento' });
      setDraft(r.data.data);
    } catch { toast('Error al generar borrador (configura OPENAI_API_KEY)', 'error'); }
    finally { setDraftLoading(false); }
  };

  const sendDraft = async () => {
    if (!draft) return;
    try {
      await sendEmail({ to: lead.contact?.email || lead.email, subject: draft.subject, html: draft.body, leadId });
      toast('Email enviado', 'success');
      setDraft(null);
      load();
    } catch { toast('Error al enviar email', 'error'); }
  };

  if (loading) return <div className="loading"><div className="spinner" />Cargando...</div>;
  if (!lead) return null;

  const contactName = lead.contact?.name || lead.contact || '';
  const contactEmail = lead.contact?.email || lead.email || '';

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Volver</button>
          <div>
            <div className="page-title">{lead.company}</div>
            <div className="page-sub">{contactName} · {contactEmail}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <ScoreBadge score={lead.score || 0} />
          <StageBadge stage={lead.stage} />
          <button className="btn btn-ghost btn-sm" onClick={handleRescore}>🤖 Re-Score IA</button>
          <button className="btn btn-ghost btn-sm" onClick={handleDraftEmail} disabled={draftLoading}>
            {draftLoading ? '...' : '✉️ Borrador IA'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setEditMode(!editMode)}>
            {editMode ? 'Cancelar' : '✏️ Editar'}
          </button>
        </div>
      </div>

      {/* Borrador IA */}
      {draft && (
        <div className="card" style={{ marginBottom: 16, border: '1px solid var(--orange)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>✉️ Borrador Generado por IA</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={sendDraft}>Enviar</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}>Descartar</button>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>Asunto: {draft.subject}</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', whiteSpace: 'pre-wrap', background: 'var(--gray-50)', borderRadius: 8, padding: 12 }}>{draft.body}</div>
        </div>
      )}

      <div className="detail-grid">
        {/* Info */}
        <div>
          {editMode ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 14 }}>Editar Lead</div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Etapa</label>
                  <select className="form-select" value={form.stage} onChange={e => setForm(f => ({...f, stage: e.target.value}))}>
                    {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Prioridad</label>
                  <select className="form-select" value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value}))}>
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Valor estimado (USD)</label>
                <input className="form-input" type="number" value={form.value} onChange={e => setForm(f => ({...f, value: e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Notas internas</label>
                <textarea className="form-input" rows={3} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={handleUpdate}>Guardar</button>
                <button className="btn btn-ghost" onClick={() => setEditMode(false)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 14 }}>Información del Lead</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {[
                  ['Empresa', lead.company],
                  ['Contacto', contactName],
                  ['Email', contactEmail],
                  ['WhatsApp', lead.contact?.whatsapp || lead.whatsapp || '—'],
                  ['Fuente', lead.source],
                  ['País', lead.country],
                  ['Ciudad', lead.city || '—'],
                  ['Valor', `$${(lead.value || 0).toLocaleString()} USD`],
                  ['Prioridad', lead.priority],
                  ['Score IA', lead.score || 0],
                  ['Días sin contacto', lead.daysSinceLastContact || 0],
                  ['Servicios', (lead.services || []).join(', ') || '—'],
                ].map(([label, val]) => (
                  <div key={label} className="detail-field">
                    <div className="detail-label">{label}</div>
                    <div className="detail-val">{val}</div>
                  </div>
                ))}
              </div>
              {lead.aiNotes && (
                <div style={{ marginTop: 14, padding: 12, background: 'rgba(240,123,26,.08)', border: '1px solid rgba(240,123,26,.2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 600, marginBottom: 4 }}>🤖 Análisis IA</div>
                  <div style={{ fontSize: 13, color: 'var(--text2)' }}>{lead.aiNotes}</div>
                </div>
              )}
            </div>
          )}

          {/* Contactos adicionales */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 700 }}>Contactos</div>
              <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setShowContactForm(v => !v)}>
                <UserPlus size={13} /> Agregar
              </button>
            </div>
            {/* Contacto principal */}
            <div style={{ padding: '8px 10px', background: 'var(--gray-50)', borderRadius: 7, border: '1px solid var(--gray-200)', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{contactName} <span style={{ fontSize: 10, color: 'var(--orange-500)', marginLeft: 5 }}>Principal</span></div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{contactEmail}</div>
                  {(lead.contact?.whatsapp || lead.whatsapp) && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{lead.contact?.whatsapp || lead.whatsapp}</div>}
                </div>
              </div>
            </div>
            {/* Contactos adicionales */}
            {contacts.map((c, i) => (
              <div key={i} style={{ padding: '8px 10px', background: 'var(--gray-50)', borderRadius: 7, border: '1px solid var(--gray-200)', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name} {c.role && <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 5 }}>{c.role}</span>}</div>
                  {c.email && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{c.email}</div>}
                  {c.phone && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{c.phone}</div>}
                </div>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', padding: '2px 6px' }} onClick={() => removeContact(i)}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {showContactForm && (
              <div style={{ marginTop: 10, padding: 12, background: 'var(--gray-50)', borderRadius: 8, border: '1px solid var(--gray-200)' }}>
                <div className="form-row" style={{ marginBottom: 8 }}>
                  <input className="form-input" placeholder="Nombre *" value={newContact.name} onChange={e => setNewContact(c => ({...c, name: e.target.value}))} />
                  <input className="form-input" placeholder="Cargo / Rol" value={newContact.role} onChange={e => setNewContact(c => ({...c, role: e.target.value}))} />
                </div>
                <div className="form-row" style={{ marginBottom: 10 }}>
                  <input className="form-input" placeholder="Email" value={newContact.email} onChange={e => setNewContact(c => ({...c, email: e.target.value}))} />
                  <input className="form-input" placeholder="Teléfono / WhatsApp" value={newContact.phone} onChange={e => setNewContact(c => ({...c, phone: e.target.value}))} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={addContact}>Guardar Contacto</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowContactForm(false)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>

          {/* Agregar nota */}
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Agregar Nota / Actividad</div>
            <textarea className="form-input" rows={3} placeholder="Escribe una nota, resultado de llamada, etc." value={noteText} onChange={e => setNoteText(e.target.value)} style={{ marginBottom: 10 }} />
            <button className="btn btn-primary btn-sm" onClick={addNote}>Guardar Nota</button>
          </div>
        </div>

        {/* Actividades */}
        <div>
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 14 }}>Historial de Actividades</div>
            {activities.length === 0 && (
              <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: 20 }}>Sin actividades registradas</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 500, overflowY: 'auto' }}>
              {activities.map(a => (
                <div key={a._id} style={{ padding: '10px 12px', background: 'var(--gray-50)', borderRadius: 8, border: '1px solid var(--gray-200)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 600, textTransform: 'uppercase' }}>
                      {a.type === 'whatsapp' ? '💬' : a.type === 'email' ? '📧' : a.type === 'call' ? '📞' : a.type === 'stage_change' ? '🔄' : '📝'} {a.type}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text3)' }}>{new Date(a.createdAt).toLocaleDateString('es-MX', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text2)' }}>{a.content}</div>
                  {a.user && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>— {a.user.name}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
