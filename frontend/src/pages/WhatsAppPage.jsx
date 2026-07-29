import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getConversations, getConversation, sendWhatsApp, markConversationRead } from '../services/api';
import { Search, MessageSquare, Mail } from 'lucide-react';

// Bandeja de conversaciones: WhatsApp y correo en la misma lista, porque para
// el asesor es una sola conversación con el cliente.
const FILTROS = [
  { id: 'todas',   label: 'Todas' },
  { id: 'unread',  label: 'Sin leer' },
  { id: 'read',    label: 'Leídas' },
];

const relativo = (iso) => {
  if (!iso) return '';
  const minutos = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (minutos < 1) return 'ahora';
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 1440) return `${Math.floor(minutos / 60)} h`;
  const dias = Math.floor(minutos / 1440);
  if (dias < 7) return `${dias} d`;
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
};

export default function WhatsAppPage({ toast }) {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [filtro, setFiltro] = useState('todas');
  const [busqueda, setBusqueda] = useState('');
  const messagesRef = useRef();

  const loadConversations = useCallback(async () => {
    try {
      const r = await getConversations();
      const list = r.data.data || [];
      setConversations(list);
      setActiveId(prev => prev || list[0]?.leadId || null);
    } catch {
      setConversations([]);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (!activeId) return;
    getConversation(activeId)
      .then(r => setMessages(r.data.data || []))
      .catch(() => setMessages([]));

    // Abrir la conversación la marca como leída.
    markConversationRead(activeId)
      .then(() => setConversations(list =>
        list.map(c => (c.leadId === activeId ? { ...c, unread: 0 } : c))))
      .catch(() => {});
  }, [activeId]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  const activeConv = conversations.find(c => c.leadId === activeId);
  const activeLead = activeConv?.lead;

  const visibles = conversations.filter(c => {
    if (filtro === 'unread' && !c.unread) return false;
    if (filtro === 'read' && c.unread) return false;
    if (busqueda.trim()) {
      const texto = `${c.lead?.company || ''} ${c.lead?.contact?.name || c.lead?.contact || ''}`.toLowerCase();
      if (!texto.includes(busqueda.toLowerCase())) return false;
    }
    return true;
  });

  const sinLeer = conversations.reduce((n, c) => n + (c.unread ? 1 : 0), 0);

  const send = async () => {
    if (!input.trim() || !activeLead) return;
    const phone = activeLead.whatsapp || activeLead.contact?.whatsapp;
    if (!phone) return toast('Este lead no tiene WhatsApp', 'error');
    setSending(true);
    try {
      await sendWhatsApp({ to: phone, message: input, leadId: activeId });
      setMessages(m => [...m, {
        direction: 'outbound', content: input,
        createdAt: new Date().toISOString(), isAuto: false
      }]);
      setInput('');
      toast('Mensaje enviado', 'success');
    } catch (e) {
      toast(e.response?.data?.message || 'Error al enviar', 'error');
    } finally { setSending(false); }
  };

  const TEMPLATES = [
    { id: 'intro', label: 'Presentación', text: '¡Hola! Soy de ACON Worldwide Logística Internacional. Vi tu interés en nuestros servicios de logística. ¿Tienes un momento para platicar?' },
    { id: 'followup', label: 'Seguimiento', text: '¡Hola! Solo quería saber si tuviste oportunidad de revisar nuestra propuesta. Estamos disponibles para resolver cualquier duda. 🚢' },
    { id: 'quote', label: 'Cotización', text: 'Hola, para poder prepararte una cotización personalizada necesito algunos datos: ¿Qué tipo de carga manejas y cuáles son los orígenes/destinos frecuentes?' },
  ];

  return (
    <div className="wa-layout">
      {/* Lista de chats */}
      <div className="wa-list">
        <div className="wa-list-head">
          <div className="wa-search">
            <Search size={13} />
            <input
              placeholder="Buscar conversación…"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
          </div>
          <div className="wa-filters">
            {FILTROS.map(f => (
              <button
                key={f.id}
                className={`wa-filter${filtro === f.id ? ' is-active' : ''}`}
                onClick={() => setFiltro(f.id)}
              >
                {f.label}
                {f.id === 'unread' && sinLeer > 0 && <span className="wa-filter-count">{sinLeer}</span>}
              </button>
            ))}
          </div>
        </div>

        {visibles.length === 0 && (
          <div style={{ padding: 20, color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>
            {conversations.length === 0
              ? 'Todavía no hay conversaciones'
              : 'Ninguna conversación con ese filtro'}
          </div>
        )}

        {visibles.map(c => {
          const CanalIcon = c.channel === 'email' ? Mail : MessageSquare;
          return (
            <div key={c.leadId} className={`wa-item ${activeId === c.leadId ? 'active' : ''}`}
              onClick={() => setActiveId(c.leadId)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div className="avatar" style={{ flexShrink: 0 }}>
                  {c.lead?.company?.slice(0,2).toUpperCase() || 'LE'}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div className="wa-item-top">
                    <span className={`wa-item-name${c.unread ? ' is-unread' : ''}`}>{c.lead?.company}</span>
                    <span className="wa-item-time">{relativo(c.lastAt)}</span>
                  </div>
                  <div className="wa-item-preview">
                    <CanalIcon size={11} className="wa-item-channel" />
                    {c.direction === 'outbound' && <span className="wa-item-you">Tú: </span>}
                    {c.preview || 'Sin mensajes'}
                  </div>
                </div>
                {c.unread > 0 && <span className="wa-unread">{c.unread}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Chat */}
      {activeLead ? (
        <div className="wa-chat">
          <div className="wa-chatbar">
            <div className="avatar">{activeLead.company?.slice(0,2).toUpperCase()}</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{activeLead.company}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{activeLead.whatsapp || activeLead.contact?.whatsapp || 'Sin número WA'}</div>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}
              onClick={() => setShowTemplates(!showTemplates)}>
              📋 Plantillas
            </button>
          </div>

          {showTemplates && (
            <div style={{ background: 'var(--dark3)', borderBottom: '1px solid var(--border)', padding: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {TEMPLATES.map(t => (
                <button key={t.id} className="btn btn-ghost btn-sm" onClick={() => { setInput(t.text); setShowTemplates(false); }}>
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <div className="wa-messages" ref={messagesRef}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, marginTop: 60 }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>💬</div>
                No hay mensajes aún. Inicia la conversación.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`wa-msg ${m.direction === 'inbound' ? 'in' : m.isAuto ? 'auto' : 'out'}`}>
                <div>{m.content}</div>
                <div style={{ fontSize: 10, opacity: .6, marginTop: 4, textAlign: 'right' }}>
                  {new Date(m.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  {m.isAuto && ' · IA'}
                </div>
              </div>
            ))}
          </div>

          <div className="wa-input">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Escribe un mensaje..."
            />
            <button className="btn btn-primary" onClick={send} disabled={sending || !input.trim()}>
              {sending ? '...' : '➤'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 14 }}>
          Selecciona un lead para chatear
        </div>
      )}
    </div>
  );
}
