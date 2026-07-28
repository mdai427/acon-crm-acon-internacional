import React, { useState, useEffect, useRef } from 'react';
import { getLeads, getConversation, sendWhatsApp } from '../services/api';

export default function WhatsAppPage({ toast }) {
  const [leads, setLeads] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const messagesRef = useRef();

  useEffect(() => {
    getLeads({ limit: 50 }).then(r => {
      const list = r.data.data || [];
      setLeads(list);
      if (list.length > 0) setActiveId(list[0]._id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeId) return;
    getConversation(activeId)
      .then(r => setMessages(r.data.data || []))
      .catch(() => setMessages([]));
  }, [activeId]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  const activeLead = leads.find(l => l._id === activeId);

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
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 15 }}>
          💬 WhatsApp CRM
        </div>
        {leads.length === 0 && (
          <div style={{ padding: 20, color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>
            No hay leads con WhatsApp
          </div>
        )}
        {leads.map(l => (
          <div key={l._id} className={`wa-item ${activeId === l._id ? 'active' : ''}`}
            onClick={() => setActiveId(l._id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="avatar" style={{ flexShrink: 0 }}>
                {l.company?.slice(0,2).toUpperCase() || 'LE'}
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.company}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.contact?.name || l.contact}
                </div>
              </div>
              {l.whatsapp && <span style={{ fontSize: 10, color: 'var(--green)' }}>●</span>}
            </div>
          </div>
        ))}
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
