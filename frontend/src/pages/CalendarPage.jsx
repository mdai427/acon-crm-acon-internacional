import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import {
  getMyActivities, getTeamActivities, createActivity, completeActivity,
  getCalendarEvents, createCalendarEvent, deleteCalendarEvent, getOAuthStatus
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Plus, RefreshCw, Users, ExternalLink, X, Check, AlertCircle } from 'lucide-react';

// Configure date-fns localizer
const locales = { 'es': es };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }), getDay, locales });

const TYPE_META = {
  call:     { label: 'Llamada',   color: '#3B82F6' },
  note:     { label: 'Nota',      color: '#6B7280' },
  task:     { label: 'Tarea',     color: '#F59E0B' },
  meeting:  { label: 'Reunión',   color: '#8B5CF6' },
  email:    { label: 'Email',     color: '#10B981' },
  whatsapp: { label: 'WhatsApp',  color: '#25D366' },
  gcal:     { label: 'Google Cal', color: '#EA4335' },
};

const MESSAGES = {
  allDay: 'Todo el día',
  previous: '‹',
  next: '›',
  today: 'Hoy',
  month: 'Mes',
  week: 'Semana',
  day: 'Día',
  agenda: 'Agenda',
  date: 'Fecha',
  time: 'Hora',
  event: 'Evento',
  noEventsInRange: 'Sin actividades en este período',
};

export default function CalendarPage({ toast, onSelectLead }) {
  const { user } = useAuth();
  const canViewTeam = ['admin', 'gerencia', 'direccion'].includes(user?.role);

  const now = new Date();
  const [currentDate, setCurrentDate] = useState(now);
  const [view, setView] = useState('month');
  const [showTeam, setShowTeam] = useState(false);

  const [activities, setActivities] = useState([]);
  const [gcalEvents, setGcalEvents] = useState([]);
  const [gcalConnected, setGcalConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [gcalLoading, setGcalLoading] = useState(false);

  const [showNewModal, setShowNewModal] = useState(false);
  const [newForm, setNewForm] = useState({ type: 'task', content: '', dueDate: '', dueTime: '09:00', syncGcal: false, attendees: '' });
  const [saving, setSaving] = useState(false);

  const [selectedEvent, setSelectedEvent] = useState(null); // detail popover

  // Compute date range for current view
  const [rangeFrom, rangeTo] = useMemo(() => {
    const d = currentDate;
    if (view === 'month') return [new Date(d.getFullYear(), d.getMonth() - 1, 1), new Date(d.getFullYear(), d.getMonth() + 2, 0)];
    if (view === 'week') {
      const start = startOfWeek(d, { weekStartsOn: 0 });
      const end = new Date(start); end.setDate(end.getDate() + 7);
      return [start, end];
    }
    return [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 0)];
  }, [currentDate, view]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fn = (showTeam && canViewTeam) ? getTeamActivities : getMyActivities;
      const r = await fn({ from: rangeFrom.toISOString(), to: rangeTo.toISOString() });
      setActivities(r.data.data || []);
    } catch { toast('Error al cargar actividades', 'error'); }
    finally { setLoading(false); }
  }, [rangeFrom, rangeTo, showTeam, canViewTeam]);

  const loadGcal = useCallback(async () => {
    setGcalLoading(true);
    try {
      const r = await getCalendarEvents();
      setGcalEvents(r.data.data || []);
    } catch (e) {
      if (e.response?.data?.code === 'NOT_CONNECTED') setGcalConnected(false);
    } finally { setGcalLoading(false); }
  }, []);

  useEffect(() => {
    getOAuthStatus().then(r => { setGcalConnected(!!r.data.data?.google?.connected); }).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (gcalConnected) loadGcal(); }, [gcalConnected, loadGcal]);

  // Convert activities + GCal events → react-big-calendar events
  const calEvents = useMemo(() => {
    const evs = [];

    activities.forEach(a => {
      const start = a.taskData?.dueDate ? new Date(a.taskData.dueDate) : new Date(a.createdAt);
      const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 min default
      evs.push({
        id:        a._id,
        title:     a.content || TYPE_META[a.type]?.label || 'Actividad',
        start,
        end,
        allDay:    !a.taskData?.dueDate,
        resource:  { type: a.type, src: 'crm', activity: a },
      });
    });

    gcalEvents.forEach(e => {
      const start = new Date(e.start);
      const end   = new Date(e.end || new Date(start.getTime() + 60 * 60 * 1000));
      evs.push({
        id:       `gcal-${e.id}`,
        title:    e.title || 'Google Calendar',
        start,
        end,
        allDay:   !e.start.includes('T'),
        resource: { type: 'gcal', src: 'gcal', event: e },
      });
    });

    return evs;
  }, [activities, gcalEvents]);

  const eventStyleGetter = (ev) => {
    const color = TYPE_META[ev.resource?.type]?.color || '#6B7280';
    return {
      style: {
        backgroundColor: color,
        borderRadius: '5px',
        opacity: 0.9,
        color: '#fff',
        border: 'none',
        fontSize: 11,
        fontWeight: 500,
        padding: '2px 6px',
      }
    };
  };

  const handleSelectEvent = (ev) => setSelectedEvent(ev);

  const handleSelectSlot = ({ start }) => {
    setNewForm(f => ({ ...f, dueDate: format(start, 'yyyy-MM-dd'), dueTime: format(start, 'HH:mm') }));
    setShowNewModal(true);
  };

  const handleComplete = async (id) => {
    try {
      await completeActivity(id);
      setActivities(acts => acts.map(a => a._id === id ? { ...a, taskData: { ...a.taskData, completed: true } } : a));
      setSelectedEvent(null);
      toast('Tarea completada ✓', 'success');
    } catch { toast('Error', 'error'); }
  };

  const handleDeleteGcal = async (eventId) => {
    if (!confirm('¿Eliminar evento de Google Calendar?')) return;
    try {
      await deleteCalendarEvent(eventId);
      setGcalEvents(evs => evs.filter(e => e.id !== eventId));
      setSelectedEvent(null);
      toast('Evento eliminado', 'success');
    } catch { toast('Error al eliminar evento', 'error'); }
  };

  const handleSaveNew = async () => {
    if (!newForm.content.trim()) return toast('Escribe una descripción', 'error');
    setSaving(true);
    try {
      const dueDate = newForm.dueDate
        ? new Date(`${newForm.dueDate}T${newForm.dueTime || '09:00'}`)
        : new Date();

      await createActivity({ type: newForm.type, content: newForm.content, taskData: { dueDate, completed: false } });

      if (newForm.syncGcal && gcalConnected) {
        const start = dueDate.toISOString();
        const end = new Date(dueDate.getTime() + 60 * 60 * 1000).toISOString();
        await createCalendarEvent({
          title: newForm.content, start, end,
          attendees: newForm.attendees ? newForm.attendees.split(',').map(s => s.trim()).filter(Boolean) : [],
        });
      }

      toast('Actividad creada', 'success');
      setShowNewModal(false);
      setNewForm({ type: 'task', content: '', dueDate: '', dueTime: '09:00', syncGcal: false, attendees: '' });
      load();
      if (gcalConnected) loadGcal();
    } catch (e) { toast(e.response?.data?.message || 'Error al guardar', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Calendario de Actividades</div>
          <div className="page-sub">Visualiza y gestiona tareas, llamadas y reuniones</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canViewTeam && (
            <button className={`btn btn-sm ${showTeam ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setShowTeam(t => !t)}>
              <Users size={13} /> {showTeam ? 'Equipo' : 'Solo yo'}
            </button>
          )}
          {gcalConnected && (
            <button className="btn btn-ghost btn-sm" onClick={loadGcal} disabled={gcalLoading}>
              <RefreshCw size={13} className={gcalLoading ? 'spin' : ''} /> GCal
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /></button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNewModal(true)}>
            <Plus size={13} /> Nueva actividad
          </button>
        </div>
      </div>

      {!gcalConnected && (
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#1D4ED8', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={15} />
          Google Calendar no conectado. Ve a <strong style={{ margin: '0 4px' }}>Configuración → Integraciones</strong> para sincronizar.
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        {Object.entries(TYPE_META).map(([k, m]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: m.color }} />
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{m.label}</span>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <BigCalendar
          localizer={localizer}
          events={calEvents}
          startAccessor="start"
          endAccessor="end"
          titleAccessor="title"
          style={{ height: 660, padding: 16 }}
          culture="es"
          messages={MESSAGES}
          view={view}
          onView={setView}
          date={currentDate}
          onNavigate={setCurrentDate}
          selectable
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={eventStyleGetter}
          views={['month', 'week', 'day', 'agenda']}
          popup
          loading={loading}
        />
      </div>

      {/* Event detail popover */}
      {selectedEvent && (
        <div className="modal-overlay" onClick={() => setSelectedEvent(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: TYPE_META[selectedEvent.resource?.type]?.color || '#6B7280' }} />
                {TYPE_META[selectedEvent.resource?.type]?.label || 'Actividad'}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedEvent(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>{selectedEvent.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
                {format(selectedEvent.start, "EEEE d 'de' MMMM, HH:mm", { locale: es })}
              </div>

              {selectedEvent.resource?.src === 'gcal' && (
                <>
                  {selectedEvent.resource.event?.hangoutLink && (
                    <a href={selectedEvent.resource.event.hangoutLink} target="_blank" rel="noreferrer"
                       style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1D4ED8', fontSize: 13, marginBottom: 8 }}>
                      <ExternalLink size={13} /> Unirse a Meet
                    </a>
                  )}
                  {selectedEvent.resource.event?.htmlLink && (
                    <a href={selectedEvent.resource.event.htmlLink} target="_blank" rel="noreferrer"
                       style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1D4ED8', fontSize: 13, marginBottom: 12 }}>
                      <ExternalLink size={13} /> Ver en Google Calendar
                    </a>
                  )}
                  <button className="btn btn-sm" style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer' }}
                    onClick={() => handleDeleteGcal(selectedEvent.resource.event.id)}>
                    Eliminar evento
                  </button>
                </>
              )}

              {selectedEvent.resource?.src === 'crm' && (
                <>
                  {selectedEvent.resource.activity?.lead && (
                    <button onClick={() => { onSelectLead?.(selectedEvent.resource.activity.lead._id); setSelectedEvent(null); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 13, padding: 0, marginBottom: 12, display: 'block' }}>
                      📋 {selectedEvent.resource.activity.lead.name || selectedEvent.resource.activity.lead.company}
                    </button>
                  )}
                  {selectedEvent.resource.activity?.type === 'task' && !selectedEvent.resource.activity?.taskData?.completed && (
                    <button className="btn btn-primary btn-sm" onClick={() => handleComplete(selectedEvent.resource.activity._id)}>
                      <Check size={13} /> Marcar como completada
                    </button>
                  )}
                  {selectedEvent.resource.activity?.taskData?.completed && (
                    <span style={{ color: '#16A34A', fontSize: 13 }}>✓ Completada</span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Activity Modal */}
      {showNewModal && (
        <div className="modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Nueva Actividad</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNewModal(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select className="form-input" value={newForm.type} onChange={e => setNewForm(f => ({ ...f, type: e.target.value }))}>
                  {Object.entries(TYPE_META).filter(([k]) => k !== 'gcal').map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Descripción *</label>
                <textarea className="form-input" rows={3} placeholder="¿Qué actividad vas a realizar?" value={newForm.content} onChange={e => setNewForm(f => ({ ...f, content: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Fecha</label>
                  <input type="date" className="form-input" value={newForm.dueDate} onChange={e => setNewForm(f => ({ ...f, dueDate: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Hora</label>
                  <input type="time" className="form-input" value={newForm.dueTime} onChange={e => setNewForm(f => ({ ...f, dueTime: e.target.value }))} />
                </div>
              </div>
              {gcalConnected && (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginBottom: 12 }}>
                    <input type="checkbox" checked={newForm.syncGcal} onChange={e => setNewForm(f => ({ ...f, syncGcal: e.target.checked }))} />
                    Sincronizar con Google Calendar
                  </label>
                  {newForm.syncGcal && (
                    <div className="form-group">
                      <label className="form-label">Invitados (emails, separados por coma)</label>
                      <input className="form-input" placeholder="correo@empresa.com" value={newForm.attendees} onChange={e => setNewForm(f => ({ ...f, attendees: e.target.value }))} />
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowNewModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveNew} disabled={saving}>{saving ? 'Guardando...' : 'Crear actividad'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .rbc-calendar { font-family: inherit; color: var(--text); }
        .rbc-toolbar button { font-size: 12px; }
        .rbc-header { font-size: 11px; font-weight: 600; color: var(--text3); padding: 6px; }
        .rbc-event { cursor: pointer; }
        .rbc-today { background: rgba(37,99,235,0.06); }
        @keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin 1s linear infinite}
      `}</style>
    </div>
  );
}
