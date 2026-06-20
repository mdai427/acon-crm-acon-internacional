import React, { useEffect, useState, useCallback } from 'react';
import {
  getLead, updateLead, getActivities, createActivity,
  draftEmail, rescoreLead, sendEmail,
  getGmailMessages, sendGmailMessage, getCalendarEvents, createCalendarEvent
} from '../services/api';
import { ScoreBadge, StageBadge, SourceBadge } from '../components/Badges';
import { Mail, Calendar, FileText, MessageSquare, RefreshCw, Plus, Send, Video, Clock, MapPin } from 'lucide-react';

const STAGES = ['new','contacted','qualified','proposal','negotiation','closed_won','closed_lost'];
const STAGE_LABELS = { new:'Nuevo', contacted:'Contactado', qualified:'Calificado', proposal:'Propuesta', negotiation:'Negociación', closed_won:'Ganado', closed_lost:'Perdido' };

const TABS = [
  { id: 'info',      label: 'Información', Icon: FileText },
  { id: 'activity',  label: 'Actividades', Icon: MessageSquare },
  { id: 'emails',    label: 'Correos',     Icon: Mail },
  { id: 'calendar',  label: 'Calendario',  Icon: Calendar },
];

export default function LeadDetail({ leadId, toast, onBack }) {
  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('info');
  const [noteText, setNoteText] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({});
  const [draftLoading, setDraftLoading] = useState(false);
  const [draft, setDraft] = useState(null);

  // Emails
  const [emails, setEmails] = useState([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [replySubject, setReplySubject] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  const [composeForm, setComposeForm] = useState({ to: '', subject: '', body: '' });

  // Calendar
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [eventForm, setEventForm] = useState({ title: '', start: '', end: '', attendees: '', description: '', location: '' });

  const load = async () => {
    try {
      const [lRes, aRes] = await Promise.all([getLead(leadId), getActivities(leadId)]);
      const l = lRes.data.data;
      setLead(l);
      setForm({ stage: l.stage, value: l.value, priority: l.priority, notes: l.notes });
      setActivities(aRes.data.data || []);
    } catch { toast('Error al cargar lead', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [leadId]);

  const loadEmails = useCallback(async () => {
    if (!lead) return;
    const contactEmail = lead.contact?.email || lead.email;
    if (!contactEmail) { toast('Este lead no tiene email de contacto', 'error'); return; }
    setEmailsLoading(true);
    try {
      const r = await getGmailMessages(contactEmail);
      setEmails(r.data.data || []);
    } catch (err) {
      if (err.response?.data?.code === 'NOT_CONNECTED') {
        toast('Conecta Gmail en Integraciones primero', 'error');
      } else {
        toast(err.response?.data?.message || 'Error al cargar correos', 'error');
      }
    } finally { setEmailsLoading(false); }
  }, [lead]);

  const loadCalendar = useCallback(async () => {
    if (!lead) return;
    setEventsLoading(true);
    try {
      const r = await getCalendarEvents(lead.company);
      setEvents(r.data.data || []);
    } catch (err) {
      if (err.response?.data?.code === 'NOT_CONNECTED') {
        toast('Conecta Google Calendar en Integraciones primero', 'error');
      } else {
        toast(err.response?.data?.message || 'Error al cargar eventos', 'error');
      }
    } finally { setEventsLoading(false); }
  }, [lead]);

  useEffect(() => {
    if (tab === 'emails' && lead) loadEmails();
    if (tab === 'calendar' && lead) loadCalendar();
  }, [tab, lead]);

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

  const handleSendGmail = async (e) => {
    e.preventDefault();
    try {
      await sendGmailMessage({
        to: composeForm.to || (lead.contact?.email || lead.email),
        subject: composeForm.subject,
        body: composeForm.body,
      });
      toast('Correo enviado via Gmail', 'success');
      setShowCompose(false);
      setComposeForm({ to: '', subject: '', body: '' });
      loadEmails();
    } catch (err) {
      toast(err.response?.data?.message || 'Error al enviar', 'error');
    }
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    try {
      const attendeeList = eventForm.attendees.split(',').map(s => s.trim()).filter(Boolean);
      const contactEmail = lead.contact?.email || lead.email;
      if (contactEmail && !attendeeList.includes(contactEmail)) attendeeList.push(contactEmail);

      const r = await createCalendarEvent({
        title: eventForm.title,
        start: eventForm.start,
        end: eventForm.end || undefined,
        attendees: attendeeList,
        description: `Lead ACON: ${lead.company}\n${eventForm.description}`,
        location: eventForm.location,
        leadId,
      });
      toast('Evento creado en Google Calendar', 'success');
      setShowNewEvent(false);
      setEventForm({ title: '', start: '', end: '', attendees: '', description: '', location: '' });
      loadCalendar();
      if (r.data.data?.hangoutLink) {
        toast(`Meet: ${r.data.data.hangoutLink}`, 'info');
      }
    } catch (err) {
      toast(err.response?.data?.message || 'Error al crear evento', 'error');
    }
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--gray-200)' }}>
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: 'transparent',
            color: tab === id ? 'var(--navy-900)' : 'var(--gray-400)',
            borderBottom: tab === id ? '2px solid var(--orange-500)' : '2px solid transparent',
          }}>
            <Icon size={14} strokeWidth={1.75} /> {label}
          </button>
        ))}
      </div>

      {/* ── TAB: INFO ── */}
      {tab === 'info' && (
        <div className="detail-grid">
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
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Agregar Nota / Actividad</div>
              <textarea className="form-input" rows={3} placeholder="Escribe una nota, resultado de llamada, etc." value={noteText} onChange={e => setNoteText(e.target.value)} style={{ marginBottom: 10 }} />
              <button className="btn btn-primary btn-sm" onClick={addNote}>Guardar Nota</button>
            </div>
          </div>
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
      )}

      {/* ── TAB: ACTIVITY ── */}
      {tab === 'activity' && (
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 14 }}>Historial Completo</div>
          <div style={{ marginBottom: 16 }}>
            <textarea className="form-input" rows={3} placeholder="Escribe una nota o actividad..." value={noteText} onChange={e => setNoteText(e.target.value)} style={{ marginBottom: 8 }} />
            <button className="btn btn-primary btn-sm" onClick={addNote}>Guardar</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activities.map(a => (
              <div key={a._id} style={{ padding: '12px 14px', background: 'var(--gray-50)', borderRadius: 10, border: '1px solid var(--gray-200)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 600, textTransform: 'uppercase' }}>
                    {a.type === 'whatsapp' ? '💬' : a.type === 'email' ? '📧' : a.type === 'call' ? '📞' : a.type === 'stage_change' ? '🔄' : '📝'} {a.type}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{new Date(a.createdAt).toLocaleDateString('es-MX', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>{a.content}</div>
                {a.user && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>— {a.user.name}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB: EMAILS ── */}
      {tab === 'emails' && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedEmail ? '1fr 1fr' : '1fr', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0B2545' }}>
                Correos con {contactEmail || contactName}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={loadEmails} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <RefreshCw size={12} /> Actualizar
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => { setShowCompose(true); setComposeForm({ to: contactEmail, subject: '', body: '' }); }} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Plus size={12} /> Nuevo Correo
                </button>
              </div>
            </div>

            {showCompose && (
              <form onSubmit={handleSendGmail} className="card" style={{ marginBottom: 14, border: '1px solid #F2641E30' }}>
                <div style={{ fontWeight: 700, marginBottom: 12, color: '#0B2545' }}>Nuevo Correo</div>
                <div className="form-group">
                  <label className="form-label">Para</label>
                  <input className="form-input" value={composeForm.to} onChange={e => setComposeForm(f => ({...f, to: e.target.value}))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Asunto</label>
                  <input className="form-input" value={composeForm.subject} onChange={e => setComposeForm(f => ({...f, subject: e.target.value}))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Mensaje</label>
                  <textarea className="form-input" rows={5} value={composeForm.body} onChange={e => setComposeForm(f => ({...f, body: e.target.value}))} required />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Send size={12} /> Enviar
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCompose(false)}>Cancelar</button>
                </div>
              </form>
            )}

            {emailsLoading ? (
              <div className="loading"><div className="spinner" />Cargando correos...</div>
            ) : emails.length === 0 ? (
              <div className="card">
                <div className="empty-state">
                  <Mail size={36} color="#9AA3AE" />
                  <p style={{ color: '#9AA3AE' }}>No se encontraron correos con este contacto.</p>
                  <p style={{ fontSize: 12, color: '#C4C9D1' }}>Asegúrate de haber conectado Gmail en Integraciones.</p>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {emails.map(email => (
                  <div
                    key={email.id}
                    onClick={() => setSelectedEmail(selectedEmail?.id === email.id ? null : email)}
                    style={{
                      padding: '12px 16px', background: '#fff',
                      border: `1px solid ${selectedEmail?.id === email.id ? '#F2641E' : '#E3E6EA'}`,
                      borderRadius: 10, cursor: 'pointer',
                      boxShadow: email.isUnread ? '0 2px 8px rgba(242,100,30,.08)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: email.isUnread ? 700 : 500, color: '#0B2545', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {email.subject}
                      </span>
                      {email.isUnread && <span style={{ background: '#F2641E', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 20, marginLeft: 8, flexShrink: 0 }}>NUEVO</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#9AA3AE', marginBottom: 4 }}>{email.from}</div>
                    <div style={{ fontSize: 12, color: '#5A6472', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.snippet}</div>
                    <div style={{ fontSize: 10, color: '#C4C9D1', marginTop: 4 }}>{new Date(email.date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedEmail && (
            <div className="card" style={{ position: 'sticky', top: 20, alignSelf: 'flex-start' }}>
              <div style={{ fontWeight: 700, color: '#0B2545', marginBottom: 8 }}>{selectedEmail.subject}</div>
              <div style={{ fontSize: 12, color: '#9AA3AE', marginBottom: 4 }}>De: {selectedEmail.from}</div>
              <div style={{ fontSize: 12, color: '#9AA3AE', marginBottom: 12 }}>{new Date(selectedEmail.date).toLocaleString('es-MX')}</div>
              <div style={{ fontSize: 13, color: '#1A1F2E', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 300, overflowY: 'auto', background: '#F9FAFB', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                {selectedEmail.body || selectedEmail.snippet}
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => { setShowCompose(true); setComposeForm({ to: contactEmail, subject: `Re: ${selectedEmail.subject}`, body: '' }); setSelectedEmail(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <Send size={12} /> Responder
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: CALENDAR ── */}
      {tab === 'calendar' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0B2545' }}>
              Eventos relacionados con {lead.company}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={loadCalendar} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <RefreshCw size={12} /> Actualizar
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowNewEvent(true)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Plus size={12} /> Nueva Reunión
              </button>
            </div>
          </div>

          {showNewEvent && (
            <form onSubmit={handleCreateEvent} className="card" style={{ marginBottom: 16, border: '1px solid #4285F430' }}>
              <div style={{ fontWeight: 700, marginBottom: 14, color: '#0B2545' }}>Nueva Reunión</div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Título</label>
                  <input className="form-input" placeholder="Reunión con cliente" value={eventForm.title} onChange={e => setEventForm(f => ({...f, title: e.target.value}))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Ubicación (opcional)</label>
                  <input className="form-input" placeholder="Zoom, Oficinas ACON, etc." value={eventForm.location} onChange={e => setEventForm(f => ({...f, location: e.target.value}))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Inicio</label>
                  <input className="form-input" type="datetime-local" value={eventForm.start} onChange={e => setEventForm(f => ({...f, start: e.target.value}))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Fin (opcional)</label>
                  <input className="form-input" type="datetime-local" value={eventForm.end} onChange={e => setEventForm(f => ({...f, end: e.target.value}))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Invitados adicionales (emails separados por coma)</label>
                <input className="form-input" placeholder="ejemplo@empresa.com, otro@cliente.com" value={eventForm.attendees} onChange={e => setEventForm(f => ({...f, attendees: e.target.value}))} />
                <div style={{ fontSize: 11, color: '#9AA3AE', marginTop: 4 }}>El email del contacto ({contactEmail || '—'}) se agrega automáticamente.</div>
              </div>
              <div className="form-group">
                <label className="form-label">Descripción (opcional)</label>
                <textarea className="form-input" rows={2} value={eventForm.description} onChange={e => setEventForm(f => ({...f, description: e.target.value}))} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Calendar size={12} /> Crear en Google Calendar
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowNewEvent(false)}>Cancelar</button>
              </div>
            </form>
          )}

          {eventsLoading ? (
            <div className="loading"><div className="spinner" />Cargando eventos...</div>
          ) : events.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <Calendar size={36} color="#9AA3AE" />
                <p style={{ color: '#9AA3AE' }}>No hay eventos próximos para este lead.</p>
                <button className="btn btn-primary btn-sm" onClick={() => setShowNewEvent(true)}>
                  <Plus size={13} /> Crear primera reunión
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {events.map(ev => {
                const start = new Date(ev.start);
                const isPast = start < new Date();
                return (
                  <div key={ev.id} style={{
                    background: '#fff', border: '1px solid #E3E6EA', borderRadius: 12,
                    padding: '14px 18px', opacity: isPast ? 0.7 : 1,
                    borderLeft: `4px solid ${isPast ? '#9AA3AE' : '#4285F4'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#0B2545' }}>{ev.title}</div>
                      {isPast && <span style={{ fontSize: 10, color: '#9AA3AE', fontWeight: 600 }}>PASADO</span>}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#5A6472' }}>
                        <Clock size={12} color="#4285F4" />
                        {start.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {ev.location && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#5A6472' }}>
                          <MapPin size={12} color="#EA4335" /> {ev.location}
                        </div>
                      )}
                      {ev.hangoutLink && (
                        <a href={ev.hangoutLink} target="_blank" rel="noreferrer" style={{
                          display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
                          color: '#00897B', textDecoration: 'none', fontWeight: 600,
                        }}>
                          <Video size={12} /> Google Meet
                        </a>
                      )}
                    </div>
                    {ev.attendees?.length > 0 && (
                      <div style={{ marginTop: 8, fontSize: 11, color: '#9AA3AE' }}>
                        👥 {ev.attendees.map(a => a.email).join(', ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
