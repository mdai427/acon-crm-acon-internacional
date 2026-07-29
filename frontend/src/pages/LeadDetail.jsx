import React, { useEffect, useState, useCallback } from 'react';
import {
  getLead, updateLead, getActivities, createActivity,
  draftEmail, rescoreLead, sendEmail,
  getGmailMessages, sendGmailMessage, getCalendarEvents, createCalendarEvent,
  uploadLeadAttachment, deleteLeadAttachment, getLeadAttachmentUrl,
  getMailboxes,
} from '../services/api';
import { ScoreBadge, StageBadge, SourceBadge } from '../components/Badges';
import { Mail, Calendar, FileText, MessageSquare, RefreshCw, Plus, Send, Video, Clock, MapPin, CheckSquare, Square, Building2, Zap, Paperclip, Trash2, Download, Phone } from 'lucide-react';
import { triggerLeadResearch } from '../services/api';
import AISuggestionsPanel from '../components/AISuggestionsPanel';
import CallPanel from '../components/CallPanel';
import { completeActivity } from '../services/api';
import { usePipelineStages } from '../hooks/usePipelineStages';

// Las etapas son configurables: llegan del backend con usePipelineStages.

const TABS = [
  { id: 'info',      label: 'Información', Icon: FileText },
  { id: 'research',  label: 'Empresa IA',  Icon: Building2 },
  { id: 'activity',  label: 'Timeline',    Icon: MessageSquare },
  { id: 'archivos',  label: 'Archivos',    Icon: Paperclip },
  { id: 'emails',    label: 'Correos',     Icon: Mail },
  { id: 'llamadas',  label: 'Llamadas',    Icon: Phone },
  { id: 'calendar',  label: 'Calendario',  Icon: Calendar },
];

// ── Activity card with task checkbox support ──────────────────────
function ActivityCard({ activity: a, onComplete }) {
  const isTask = a.type === 'task';
  const isDone = a.taskData?.completed;
  const isOverdue = isTask && !isDone && a.taskData?.dueDate && new Date(a.taskData.dueDate) < new Date();

  const TYPE_ICON = {
    whatsapp: '💬', email: '📧', call: '📞',
    stage_change: '🔄', note: '📝', task: null, system: '⚙️',
  };

  return (
    <div style={{
      padding: '10px 12px',
      background: isTask && !isDone ? (isOverdue ? 'rgba(220,38,38,.04)' : 'rgba(242,100,30,.04)') : 'var(--gray-50)',
      borderRadius: 8,
      border: `1px solid ${isTask && !isDone ? (isOverdue ? 'rgba(220,38,38,.2)' : 'rgba(242,100,30,.2)') : 'var(--gray-200)'}`,
      opacity: isDone ? .6 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isTask ? (
            <button
              onClick={onComplete}
              disabled={isDone}
              style={{ background: 'none', border: 'none', cursor: isDone ? 'default' : 'pointer', padding: 0, display: 'flex', color: isDone ? '#16A34A' : 'var(--gray-400)' }}
              title={isDone ? 'Completada' : 'Marcar como completada'}
            >
              {isDone ? <CheckSquare size={15} /> : <Square size={15} />}
            </button>
          ) : (
            <span style={{ fontSize: 14 }}>{TYPE_ICON[a.type] || '📝'}</span>
          )}
          <span style={{ fontSize: 11, color: isTask ? (isOverdue ? '#DC2626' : 'var(--orange)') : 'var(--orange)', fontWeight: 600, textTransform: 'uppercase' }}>
            {isTask ? (isDone ? 'tarea ✓' : isOverdue ? 'tarea vencida' : 'tarea') : a.type}
            {a.isAuto && <span style={{ marginLeft: 5, fontSize: 9, background: '#EDE9FE', color: '#7C3AED', padding: '1px 5px', borderRadius: 10, fontWeight: 700 }}>IA</span>}
          </span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>
          {new Date(a.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div style={{ fontSize: 13, color: isDone ? 'var(--text3)' : 'var(--text2)', textDecoration: isDone ? 'line-through' : 'none', marginLeft: isTask ? 21 : 0 }}>
        {a.content}
      </div>
      {isTask && a.taskData?.dueDate && !isDone && (
        <div style={{ fontSize: 10, marginTop: 4, marginLeft: 21, color: isOverdue ? '#DC2626' : 'var(--gray-400)', fontWeight: isOverdue ? 600 : 400 }}>
          {isOverdue ? '⚠️ Vencía: ' : 'Vence: '}
          {new Date(a.taskData.dueDate).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
        </div>
      )}
      {a.user && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, marginLeft: isTask ? 21 : 0 }}>— {a.user.name}</div>}
    </div>
  );
}

export default function LeadDetail({ leadId, toast, onBack }) {
  const { stages } = usePipelineStages();
  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('info');
  const [noteText, setNoteText] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({});
  const [draftLoading, setDraftLoading] = useState(false);
  const [draft, setDraft] = useState(null);
  const [researchLoading, setResearchLoading] = useState(false);

  // Emails
  const [emails, setEmails] = useState([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [replySubject, setReplySubject] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  const [composeForm, setComposeForm] = useState({ to: '', subject: '', body: '', threadId: null });
  // Remitente: un buzón del CRM (la respuesta vuelve al chat) o la cuenta de
  // Gmail conectada del asesor.
  const [mailboxes, setMailboxes] = useState([]);
  const [senderId, setSenderId] = useState('gmail');
  const [gmailMaxResults, setGmailMaxResults] = useState(20);

  // Calendar
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [eventForm, setEventForm] = useState({ title: '', start: '', end: '', attendees: '', description: '', location: '' });

  // Timeline filters + new activity forms
  const [activityFilter, setActivityFilter] = useState('all');
  const [newActivityType, setNewActivityType] = useState('note');
  const [newActivityContent, setNewActivityContent] = useState('');
  const [newActivityDue, setNewActivityDue] = useState('');
  const [showNewActivity, setShowNewActivity] = useState(false);
  const [savingActivity, setSavingActivity] = useState(false);

  // Attachments
  const [uploadingFile, setUploadingFile] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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

  useEffect(() => {
    getMailboxes()
      .then(r => {
        const list = r.data.data || [];
        setMailboxes(list);
        // Con buzones configurados, ese es el camino por defecto: el correo
        // queda en el chat y la respuesta también.
        if (list.length) setSenderId(list.find(m => m.isDefault)?._id || list[0]._id);
      })
      .catch(() => setMailboxes([]));
  }, []);

  const loadEmails = useCallback(async (maxResults) => {
    if (!lead) return;
    const contactEmail = lead.contact?.email || lead.email;
    if (!contactEmail) { toast('Este lead no tiene email de contacto', 'error'); return; }
    setEmailsLoading(true);
    try {
      const r = await getGmailMessages(contactEmail, maxResults || gmailMaxResults);
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

  const handleResearch = async () => {
    setResearchLoading(true);
    setTab('research');
    try {
      await triggerLeadResearch(leadId);
      toast('Investigación completada', 'success');
      load();
    } catch { toast('Error al investigar empresa', 'error'); }
    finally { setResearchLoading(false); }
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
      if (senderId === 'gmail') {
        await sendGmailMessage({
          to: composeForm.to || (lead.contact?.email || lead.email),
          subject: composeForm.subject,
          body: composeForm.body,
          threadId: composeForm.threadId || undefined,
        });
        toast('Correo enviado via Gmail', 'success');
        loadEmails();
      } else {
        // El salto de línea del textarea se respeta en el HTML final.
        await sendEmail({
          leadId,
          mailboxId: senderId,
          subject: composeForm.subject,
          html: composeForm.body.replace(/\n/g, '<br>'),
          text: composeForm.body,
        });
        toast('Correo enviado — quedó en el chat del lead', 'success');
        load();
      }
      setShowCompose(false);
      setComposeForm({ to: '', subject: '', body: '', threadId: null });
    } catch (err) {
      const message = err.response?.data?.code === 'EMAIL_SUPPRESSED'
        ? 'Este contacto tiene el envío bloqueado por rebotes previos'
        : (err.response?.data?.message || 'Error al enviar');
      toast(message, 'error');
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

  const handleUploadFile = async (file) => {
    if (!file) return;
    setUploadingFile(true);
    try {
      await uploadLeadAttachment(leadId, file);
      toast('Archivo adjuntado', 'success');
      load();
    } catch (err) {
      toast(err.response?.data?.message || 'Error al subir archivo', 'error');
    } finally { setUploadingFile(false); }
  };

  const handleDeleteAttachment = async (attId, name) => {
    if (!window.confirm(`¿Eliminar "${name}"?`)) return;
    try {
      await deleteLeadAttachment(leadId, attId);
      toast('Archivo eliminado', 'success');
      load();
    } catch { toast('Error al eliminar', 'error'); }
  };

  const handleSaveActivity = async () => {
    if (!newActivityContent.trim()) return toast('El contenido es requerido', 'error');
    setSavingActivity(true);
    try {
      const payload = {
        lead: leadId, type: newActivityType, direction: 'internal',
        content: newActivityContent,
      };
      if (newActivityType === 'task' && newActivityDue) {
        payload.taskData = { completed: false, dueDate: new Date(newActivityDue) };
      }
      await createActivity(payload);
      setNewActivityContent('');
      setNewActivityDue('');
      setShowNewActivity(false);
      toast('Actividad registrada', 'success');
      load();
    } catch { toast('Error al guardar', 'error'); }
    finally { setSavingActivity(false); }
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
          <button className="btn btn-ghost btn-sm" onClick={handleResearch} disabled={researchLoading}>
            {researchLoading ? '⏳ Investigando...' : '🔍 Investigar Empresa'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleDraftEmail} disabled={draftLoading}>
            {draftLoading ? '...' : '✉️ Borrador IA'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setEditMode(!editMode)}>
            {editMode ? 'Cancelar' : '✏️ Editar'}
          </button>
        </div>
      </div>

      {/* Envío de correo bloqueado por rebotes */}
      {lead.emailStatus?.canReceive === false && (
        <div className="card" style={{ marginBottom: 16, border: '1px solid #DC262640', background: '#FEF2F2' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 16 }}>🚫</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#991B1B' }}>
                Correo bloqueado para este contacto
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#991B1B', lineHeight: 1.6 }}>
                {lead.emailStatus.blockedReason === 'hard_bounce' && 'La dirección no existe o fue rechazada de forma permanente. '}
                {lead.emailStatus.blockedReason === 'complaint' && 'El contacto marcó un correo nuestro como spam. '}
                {lead.emailStatus.blockedReason === 'soft_bounces' && 'La dirección rebotó varias veces seguidas. '}
                {lead.emailStatus.blockedReason === 'manual' && 'El contacto pidió no recibir más correos. '}
                Seguir enviando dañaría la reputación del dominio, así que el CRM lo detuvo.
                Actualiza el correo del lead o pide a un administrador que lo reactive en Buzones de correo.
                {lead.emailStatus.blockedDetail && (
                  <span style={{ display: 'block', marginTop: 4, opacity: 0.75 }}>
                    Detalle del proveedor: {lead.emailStatus.blockedDetail}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

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
                      {stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
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
            {/* AI Suggestions Panel — Option A */}
            <AISuggestionsPanel
              leadId={leadId}
              stage={lead.stage}
              onTasksCreated={load}
              toast={toast}
            />

            {/* Activity Timeline */}
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 14 }}>Historial de Actividades</div>
              {activities.length === 0 && (
                <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: 20 }}>Sin actividades registradas</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 520, overflowY: 'auto' }}>
                {activities.map(a => (
                  <ActivityCard key={a._id} activity={a} onComplete={async () => {
                    try {
                      await completeActivity(a._id);
                      toast('Tarea completada', 'success');
                      load();
                    } catch { toast('Error', 'error'); }
                  }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: EMPRESA IA ── */}
      {tab === 'research' && (
        <ResearchPanel lead={lead} loading={researchLoading} onResearch={handleResearch} />
      )}

      {/* ── TAB: TIMELINE (ENRICHED) ── */}
      {tab === 'activity' && (() => {
        const TYPE_FILTERS = [
          { id: 'all', label: 'Todos' },
          { id: 'note', label: '📝 Notas' },
          { id: 'call', label: '📞 Llamadas' },
          { id: 'task', label: '✅ Tareas' },
          { id: 'whatsapp_in', label: '💬 WhatsApp' },
          { id: 'email_out', label: '📧 Email' },
          { id: 'stage_change', label: '🔄 Etapa' },
          { id: 'document', label: '📎 Archivos' },
        ];
        const TYPE_GROUPS = { whatsapp_in: 'whatsapp', whatsapp_out: 'whatsapp', email_in: 'email', email_out: 'email' };
        const filteredActivities = activityFilter === 'all'
          ? activities
          : activities.filter(a => a.type === activityFilter || TYPE_GROUPS[a.type] === activityFilter.replace('_in','').replace('_out',''));

        return (
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
            {/* Left: add activity form */}
            <div>
              <div className="card">
                <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 14 }}>Registrar Actividad</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {[
                    { v: 'note', label: '📝 Nota' },
                    { v: 'call', label: '📞 Llamada' },
                    { v: 'task', label: '✅ Tarea' },
                    { v: 'meeting', label: '🤝 Reunión' },
                  ].map(({ v, label }) => (
                    <button key={v} className={`btn btn-sm ${newActivityType === v ? 'btn-navy' : 'btn-ghost'}`}
                      onClick={() => setNewActivityType(v)}>{label}</button>
                  ))}
                </div>
                <textarea
                  className="form-input" rows={3}
                  placeholder={newActivityType === 'call' ? 'Resultado de la llamada...' : newActivityType === 'task' ? 'Descripción de la tarea...' : 'Escribe tu nota...'}
                  value={newActivityContent}
                  onChange={e => setNewActivityContent(e.target.value)}
                  style={{ marginBottom: 10 }}
                />
                {newActivityType === 'task' && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Fecha límite</label>
                    <input type="datetime-local" className="form-input" value={newActivityDue}
                      onChange={e => setNewActivityDue(e.target.value)} />
                  </div>
                )}
                <button className="btn btn-primary btn-sm" style={{ width: '100%' }}
                  onClick={handleSaveActivity} disabled={savingActivity}>
                  {savingActivity ? 'Guardando...' : 'Registrar'}
                </button>
              </div>
            </div>

            {/* Right: filtered timeline */}
            <div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                {TYPE_FILTERS.map(({ id, label }) => (
                  <button key={id} className={`btn btn-sm ${activityFilter === id ? 'btn-navy' : 'btn-ghost'}`}
                    onClick={() => setActivityFilter(id)}>{label}</button>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredActivities.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)', fontSize: 13 }}>
                    Sin actividades en este filtro
                  </div>
                ) : filteredActivities.map(a => (
                  <ActivityCard key={a._id} activity={a} onComplete={async () => {
                    try { await completeActivity(a._id); toast('Tarea completada', 'success'); load(); }
                    catch { toast('Error', 'error'); }
                  }} />
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── TAB: ARCHIVOS ── */}
      {tab === 'archivos' && (
        <div>
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleUploadFile(f); }}
            style={{
              border: `2px dashed ${dragOver ? 'var(--orange)' : 'var(--border)'}`,
              borderRadius: 12, padding: 32, textAlign: 'center', marginBottom: 20,
              background: dragOver ? 'rgba(242,100,30,.04)' : 'transparent',
              transition: 'all .2s',
            }}
          >
            <Paperclip size={28} style={{ color: dragOver ? 'var(--orange)' : 'var(--gray-300)', marginBottom: 8 }} />
            <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 6 }}>
              {uploadingFile ? 'Subiendo...' : 'Arrastra un archivo aquí o'}
            </div>
            {!uploadingFile && (
              <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
                Seleccionar archivo
                <input type="file" style={{ display: 'none' }}
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.xlsx,.xls,.doc,.docx,.txt,.csv"
                  onChange={e => { if (e.target.files[0]) handleUploadFile(e.target.files[0]); e.target.value = ''; }}
                />
              </label>
            )}
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>PDF, imágenes, Excel, Word, CSV · Max 20 MB</div>
          </div>

          {/* File list */}
          {(!lead.attachments || lead.attachments.length === 0) ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 20, fontSize: 13 }}>Sin archivos adjuntos</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lead.attachments.map(att => {
                const isImg = att.mimetype?.startsWith('image/');
                const ext = att.originalName?.split('.').pop()?.toUpperCase() || 'FILE';
                const sizeKb = Math.round((att.size || 0) / 1024);
                return (
                  <div key={att._id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', background: 'var(--white)',
                    border: '1px solid var(--border)', borderRadius: 8,
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--gray-100)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, color: 'var(--text2)', flexShrink: 0 }}>
                      {isImg ? '🖼️' : ext === 'PDF' ? '📄' : ext.includes('XLS') ? '📊' : '📎'}&nbsp;{ext}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {att.originalName}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {sizeKb < 1024 ? `${sizeKb} KB` : `${(sizeKb/1024).toFixed(1)} MB`} · {new Date(att.uploadedAt).toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <a className="btn btn-ghost btn-sm btn-icon" href={getLeadAttachmentUrl(leadId, att._id)} target="_blank" rel="noreferrer" title="Descargar">
                        <Download size={13} />
                      </a>
                      <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--red)' }}
                        onClick={() => handleDeleteAttachment(att._id, att.originalName)} title="Eliminar">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
                {mailboxes.length > 0 && (
                  <div className="form-group">
                    <label className="form-label">Enviar desde</label>
                    <select className="form-input" value={senderId} onChange={e => setSenderId(e.target.value)}>
                      {mailboxes.map(mb => (
                        <option key={mb._id} value={mb._id}>{mb.displayName} — {mb.address}</option>
                      ))}
                      <option value="gmail">Mi cuenta de Gmail conectada</option>
                    </select>
                    <span style={{ fontSize: 11, color: '#9AA3AE' }}>
                      {senderId === 'gmail'
                        ? 'La respuesta llega a tu Gmail, no al chat del lead.'
                        : 'La respuesta del contacto entra al chat de este lead.'}
                    </span>
                  </div>
                )}
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
                {emails.length >= gmailMaxResults && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', marginTop: 4 }}
                    onClick={() => {
                      const next = gmailMaxResults + 20;
                      setGmailMaxResults(next);
                      loadEmails(next);
                    }}
                  >
                    Cargar más correos
                  </button>
                )}
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
                onClick={() => { setShowCompose(true); setComposeForm({ to: contactEmail, subject: `Re: ${selectedEmail.subject}`, body: '', threadId: selectedEmail.threadId }); setSelectedEmail(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <Send size={12} /> Responder en hilo
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: LLAMADAS ── */}
      {tab === 'llamadas' && <CallPanel lead={lead} toast={toast} />}

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

// ── ResearchPanel ─────────────────────────────────────────────────────────────
function ResearchPanel({ lead, loading, onResearch }) {
  const r = lead?.aiResearch;

  const POTENTIAL_COLOR = { Alto: '#16a34a', Medio: '#d97706', Bajo: '#dc2626' };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
        <div style={{ fontWeight: 700, color: '#0B2545', marginBottom: 6 }}>Investigando empresa con IA...</div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>Analizando información de {lead.company}</div>
        <div style={{ marginTop: 20 }}>
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  if (!r) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Building2 size={48} color="#d1d5db" style={{ marginBottom: 16 }} />
        <div style={{ fontWeight: 700, color: '#374151', marginBottom: 6 }}>Sin investigación disponible</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>
          La investigación se genera automáticamente al crear el lead.<br/>
          También puedes generarla manualmente ahora.
        </div>
        <button className="btn btn-primary" onClick={onResearch}>
          🔍 Investigar {lead.company}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header de empresa */}
      <div style={{ background: '#0B2545', borderRadius: 12, padding: '20px 24px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: '#93c5fd', fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>ANÁLISIS EMPRESARIAL IA</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{lead.company}</div>
          <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 4 }}>{r.giro}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#93c5fd', fontWeight: 600, marginBottom: 4 }}>SCORE EMPRESA</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: r.scoreEmpresa >= 70 ? '#4ade80' : r.scoreEmpresa >= 40 ? '#fbbf24' : '#f87171' }}>
            {r.scoreEmpresa}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>/100</div>
        </div>
      </div>

      {/* KPI chips */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div className="card" style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, fontWeight: 600 }}>TAMAÑO</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0B2545' }}>{r.tamano || '—'}</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, fontWeight: 600 }}>EMBARQUES EST.</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0B2545' }}>{r.embarquesEstimados || '—'}</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, fontWeight: 600 }}>POTENCIAL LOGÍSTICO</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: POTENTIAL_COLOR[r.potencialLogistico] || '#374151' }}>
            {r.potencialLogistico || '—'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Tipo de mercancía */}
        {r.tipoMercancia?.length > 0 && (
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 13, color: '#0B2545', marginBottom: 10 }}>📦 Tipo de Mercancía</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {r.tipoMercancia.map((m, i) => (
                <span key={i} style={{ background: '#f0f9ff', color: '#0369a1', fontSize: 12, padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>{m}</span>
              ))}
            </div>
          </div>
        )}

        {/* Países de operación */}
        {r.paisesOperacion?.length > 0 && (
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 13, color: '#0B2545', marginBottom: 10 }}>🌍 Países de Operación</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {r.paisesOperacion.map((p, i) => (
                <span key={i} style={{ background: '#f0fdf4', color: '#15803d', fontSize: 12, padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>{p}</span>
              ))}
            </div>
          </div>
        )}

        {/* Rutas principales */}
        {r.rutasPrincipales?.length > 0 && (
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 13, color: '#0B2545', marginBottom: 10 }}>🛳️ Rutas Principales</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {r.rutasPrincipales.map((rt, i) => (
                <div key={i} style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#F2641E', fontWeight: 700 }}>→</span> {rt}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Oportunidades */}
        {r.oportunidades?.length > 0 && (
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 13, color: '#16a34a', marginBottom: 10 }}>✅ Oportunidades</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {r.oportunidades.map((o, i) => (
                <div key={i} style={{ fontSize: 13, color: '#374151', display: 'flex', gap: 8 }}>
                  <span style={{ color: '#16a34a', flexShrink: 0 }}>•</span> {o}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Riesgos */}
      {r.riesgos?.length > 0 && (
        <div className="card" style={{ border: '1px solid #fecaca' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#dc2626', marginBottom: 10 }}>⚠️ Riesgos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {r.riesgos.map((rg, i) => (
              <div key={i} style={{ fontSize: 13, color: '#374151', display: 'flex', gap: 8 }}>
                <span style={{ color: '#dc2626', flexShrink: 0 }}>•</span> {rg}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recomendación */}
      {r.recomendacion && (
        <div style={{ background: 'rgba(242,100,30,0.06)', border: '1px solid rgba(242,100,30,0.25)', borderRadius: 12, padding: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#F2641E', marginBottom: 8 }}>
            🤖 Recomendación para el Ejecutivo
          </div>
          <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>{r.recomendacion}</div>
        </div>
      )}

      {/* Footer con fuente y botón re-investigar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>📊 {r.fuentesDatos}</div>
        <button className="btn btn-ghost btn-sm" onClick={onResearch} style={{ fontSize: 12 }}>
          🔄 Re-investigar
        </button>
      </div>
    </div>
  );
}
