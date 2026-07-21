import React, { useState, useEffect, useCallback } from 'react';
import {
  getMyActivities, getTeamActivities, createActivity, completeActivity,
  getCalendarEvents, createCalendarEvent, deleteCalendarEvent, getOAuthStatus
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  ChevronLeft, ChevronRight, Plus, RefreshCw, Calendar,
  Phone, FileText, CheckSquare, Users, Mail, MessageSquare,
  ExternalLink, X, Check, AlertCircle, GoogleIcon
} from 'lucide-react';

const TYPE_META = {
  call:     { label: 'Llamada',   color: '#3B82F6', bg: '#EFF6FF' },
  note:     { label: 'Nota',      color: '#6B7280', bg: '#F9FAFB' },
  task:     { label: 'Tarea',     color: '#F59E0B', bg: '#FFFBEB' },
  meeting:  { label: 'Reunión',   color: '#8B5CF6', bg: '#F5F3FF' },
  email:    { label: 'Email',     color: '#10B981', bg: '#F0FDF4' },
  whatsapp: { label: 'WhatsApp',  color: '#25D366', bg: '#F0FDF4' },
};

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function getCalendarDays(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days = [];
  // Pad start
  for (let i = 0; i < first.getDay(); i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  // Pad end to complete 6 rows
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function isSameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dateKey(d) {
  return d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : '';
}

export default function CalendarPage({ toast, onSelectLead }) {
  const { user } = useAuth();
  const canViewTeam = ['admin', 'gerencia', 'direccion'].includes(user?.role);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState(now);
  const [view, setView] = useState('month'); // month | week | list
  const [showTeam, setShowTeam] = useState(false);

  const [activities, setActivities] = useState([]);
  const [gcalEvents, setGcalEvents] = useState([]);
  const [gcalConnected, setGcalConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [gcalLoading, setGcalLoading] = useState(false);

  const [showNewModal, setShowNewModal] = useState(false);
  const [newForm, setNewForm] = useState({ type: 'task', content: '', dueDate: '', dueTime: '', syncGcal: false, attendees: '' });
  const [saving, setSaving] = useState(false);

  const [typeFilter, setTypeFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = new Date(viewYear, viewMonth, 1).toISOString();
      const to = new Date(viewYear, viewMonth + 1, 0, 23, 59, 59).toISOString();
      const fn = (showTeam && canViewTeam) ? getTeamActivities : getMyActivities;
      const r = await fn({ from, to });
      setActivities(r.data.data || []);
    } catch { toast('Error al cargar actividades', 'error'); }
    finally { setLoading(false); }
  }, [viewYear, viewMonth, showTeam, canViewTeam]);

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
    getOAuthStatus().then(r => {
      const connected = r.data.data?.google?.connected;
      setGcalConnected(!!connected);
    }).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (gcalConnected) loadGcal(); }, [gcalConnected, loadGcal]);

  // Build day → items map
  const dayMap = {};
  activities.forEach(a => {
    const d = a.taskData?.dueDate ? new Date(a.taskData.dueDate) : new Date(a.createdAt);
    const k = dateKey(d);
    if (!dayMap[k]) dayMap[k] = [];
    dayMap[k].push({ ...a, _src: 'crm', _date: d });
  });
  gcalEvents.forEach(e => {
    const d = new Date(e.start);
    const k = dateKey(d);
    if (!dayMap[k]) dayMap[k] = [];
    dayMap[k].push({ ...e, _src: 'gcal', _date: d });
  });

  const calDays = getCalendarDays(viewYear, viewMonth);

  const selectedKey = dateKey(selectedDay);
  const selectedItems = (dayMap[selectedKey] || [])
    .filter(i => typeFilter === 'all' || i.type === typeFilter || (typeFilter === 'gcal' && i._src === 'gcal'))
    .sort((a, b) => a._date - b._date);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const handleComplete = async (id) => {
    try {
      await completeActivity(id);
      setActivities(acts => acts.map(a => a._id === id ? { ...a, taskData: { ...a.taskData, completed: true } } : a));
      toast('Tarea completada', 'success');
    } catch { toast('Error', 'error'); }
  };

  const handleDeleteGcal = async (eventId) => {
    if (!confirm('¿Eliminar evento de Google Calendar?')) return;
    try {
      await deleteCalendarEvent(eventId);
      setGcalEvents(evs => evs.filter(e => e.id !== eventId));
      toast('Evento eliminado', 'success');
    } catch { toast('Error al eliminar evento', 'error'); }
  };

  const handleSaveNew = async () => {
    if (!newForm.content.trim()) return toast('Escribe una descripción', 'error');
    setSaving(true);
    try {
      const dueDate = newForm.dueDate
        ? new Date(`${newForm.dueDate}T${newForm.dueTime || '09:00'}`)
        : selectedDay;

      // Create CRM activity
      await createActivity({
        type: newForm.type,
        content: newForm.content,
        taskData: { dueDate, completed: false },
      });

      // Optionally sync to Google Calendar
      if (newForm.syncGcal && gcalConnected) {
        const start = dueDate.toISOString();
        const end = new Date(dueDate.getTime() + 60 * 60 * 1000).toISOString();
        await createCalendarEvent({
          title: newForm.content,
          start,
          end,
          attendees: newForm.attendees ? newForm.attendees.split(',').map(s => s.trim()).filter(Boolean) : [],
        });
      }

      toast('Actividad creada', 'success');
      setShowNewModal(false);
      setNewForm({ type: 'task', content: '', dueDate: '', dueTime: '', syncGcal: false, attendees: '' });
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
            <button
              className={`btn btn-sm ${showTeam ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setShowTeam(t => !t)}
            >
              <Users size={13} /> {showTeam ? 'Equipo' : 'Solo yo'}
            </button>
          )}
          {gcalConnected && (
            <button className="btn btn-ghost btn-sm" onClick={loadGcal} disabled={gcalLoading}>
              <RefreshCw size={13} className={gcalLoading ? 'spin' : ''} /> GCal
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={load}>
            <RefreshCw size={13} />
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNewModal(true)}>
            <Plus size={13} /> Nueva actividad
          </button>
        </div>
      </div>

      {/* Google Calendar connect banner */}
      {!gcalConnected && (
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#1D4ED8', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={15} />
          Google Calendar no conectado. Ve a <strong>Configuración → Integraciones</strong> para sincronizar tus eventos.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        {/* Calendar grid */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <button className="btn btn-ghost btn-sm" onClick={prevMonth}><ChevronLeft size={16} /></button>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{MONTHS[viewMonth]} {viewYear}</span>
            <button className="btn btn-ghost btn-sm" onClick={nextMonth}><ChevronRight size={16} /></button>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid var(--border)' }}>
            {DAYS.map(d => (
              <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text3)' }}>{d}</div>
            ))}
          </div>

          {/* Day cells */}
          {loading ? (
            <div className="loading" style={{ height: 300 }}><div className="spinner" /></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
              {calDays.map((day, i) => {
                const k = dateKey(day);
                const items = dayMap[k] || [];
                const isToday = isSameDay(day, now);
                const isSelected = isSameDay(day, selectedDay);
                return (
                  <div
                    key={i}
                    onClick={() => day && setSelectedDay(day)}
                    style={{
                      minHeight: 80, padding: '6px 8px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                      background: isSelected ? 'var(--primary-light, #EFF6FF)' : 'transparent',
                      cursor: day ? 'pointer' : 'default', position: 'relative',
                    }}
                  >
                    {day && (
                      <>
                        <div style={{
                          fontSize: 12, fontWeight: isToday ? 700 : 400,
                          color: isToday ? 'var(--primary)' : day.getDay() === 0 || day.getDay() === 6 ? 'var(--text3)' : 'var(--text)',
                          width: 22, height: 22, lineHeight: '22px', textAlign: 'center',
                          background: isToday ? 'var(--primary)' : 'transparent',
                          color: isToday ? '#fff' : undefined,
                          borderRadius: '50%',
                        }}>{day.getDate()}</div>
                        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {items.slice(0, 3).map((item, j) => {
                            const meta = item._src === 'gcal'
                              ? { color: '#EA4335', bg: '#FEE2E2' }
                              : (TYPE_META[item.type] || TYPE_META.note);
                            return (
                              <div key={j} style={{
                                fontSize: 10, padding: '1px 5px', borderRadius: 4,
                                background: meta.bg, color: meta.color,
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                fontWeight: 500,
                              }}>
                                {item._src === 'gcal' ? '📅 ' : ''}{item.content || item.title}
                              </div>
                            );
                          })}
                          {items.length > 3 && (
                            <div style={{ fontSize: 10, color: 'var(--text3)' }}>+{items.length - 3} más</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Day detail panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
              {selectedDay.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>

            {/* Type filter */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {[{ k: 'all', label: 'Todo' }, { k: 'task', label: 'Tareas' }, { k: 'call', label: 'Llamadas' }, { k: 'meeting', label: 'Reuniones' }, { k: 'gcal', label: '📅 GCal' }].map(({ k, label }) => (
                <button
                  key={k}
                  className={`btn btn-sm ${typeFilter === k ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: 11, padding: '3px 10px' }}
                  onClick={() => setTypeFilter(k)}
                >{label}</button>
              ))}
            </div>

            {selectedItems.length === 0 ? (
              <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                Sin actividades este día
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedItems.map((item, i) => {
                  if (item._src === 'gcal') {
                    return (
                      <div key={i} style={{ background: '#FEE2E2', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#B91C1C', display: 'flex', alignItems: 'center', gap: 6 }}>
                          📅 {item.title}
                          {item.htmlLink && (
                            <a href={item.htmlLink} target="_blank" rel="noreferrer" style={{ color: '#B91C1C' }}><ExternalLink size={12} /></a>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#991B1B', marginTop: 3 }}>
                          {new Date(item.start).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                          {item.hangoutLink && <a href={item.hangoutLink} target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: '#1D4ED8' }}>Meet</a>}
                        </div>
                        <button
                          onClick={() => handleDeleteGcal(item.id)}
                          style={{ marginTop: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#DC2626' }}
                        ><X size={11} /> Eliminar</button>
                      </div>
                    );
                  }
                  const meta = TYPE_META[item.type] || TYPE_META.note;
                  const isCompleted = item.taskData?.completed;
                  return (
                    <div key={i} style={{ background: meta.bg, borderRadius: 8, padding: '10px 12px', borderLeft: `3px solid ${meta.color}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: meta.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{meta.label}</div>
                          <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 2, textDecoration: isCompleted ? 'line-through' : 'none' }}>
                            {item.content}
                          </div>
                          {item.lead && (
                            <button
                              onClick={() => onSelectLead && onSelectLead(item.lead._id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--primary)', padding: 0, marginTop: 4 }}
                            >
                              {item.lead.name}{item.lead.company ? ` · ${item.lead.company}` : ''}
                            </button>
                          )}
                        </div>
                        {item.type === 'task' && !isCompleted && (
                          <button
                            onClick={() => handleComplete(item._id)}
                            style={{ background: 'none', border: '1px solid #16A34A', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: '#16A34A', display: 'flex', alignItems: 'center', gap: 4 }}
                          ><Check size={11} /> Hecho</button>
                        )}
                        {isCompleted && <span style={{ fontSize: 11, color: '#16A34A' }}>✓ Completada</span>}
                      </div>
                      {item.taskData?.dueDate && (
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                          {new Date(item.taskData.dueDate).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              className="btn btn-primary btn-sm"
              style={{ width: '100%', marginTop: 14 }}
              onClick={() => {
                setNewForm(f => ({ ...f, dueDate: selectedDay.toISOString().slice(0, 10) }));
                setShowNewModal(true);
              }}
            ><Plus size={13} /> Agregar al {selectedDay.getDate()}</button>
          </div>

          {/* Legend */}
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 8 }}>LEYENDA</div>
            {Object.entries(TYPE_META).map(([k, m]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: m.color }} />
                <span style={{ fontSize: 12, color: 'var(--text)' }}>{m.label}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: '#EA4335' }} />
              <span style={{ fontSize: 12, color: 'var(--text)' }}>Google Calendar</span>
            </div>
          </div>
        </div>
      </div>

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
                  {Object.entries(TYPE_META).map(([k, m]) => (
                    <option key={k} value={k}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Descripción *</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="¿Qué actividad vas a realizar?"
                  value={newForm.content}
                  onChange={e => setNewForm(f => ({ ...f, content: e.target.value }))}
                />
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
                      <label className="form-label">Invitados (emails separados por coma)</label>
                      <input
                        className="form-input"
                        placeholder="correo@empresa.com, otro@empresa.com"
                        value={newForm.attendees}
                        onChange={e => setNewForm(f => ({ ...f, attendees: e.target.value }))}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowNewModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveNew} disabled={saving}>
                {saving ? 'Guardando...' : 'Crear actividad'}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin 1s linear infinite}`}</style>
    </div>
  );
}
