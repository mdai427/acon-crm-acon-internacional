import React, { useState, useEffect, useRef } from 'react';
import { chatWithCopilot, getCopilotSuggestions } from '../services/api';
import { Bot, X, Send, Sparkles, ChevronRight, RefreshCw, Minimize2 } from 'lucide-react';

const QUICK_PROMPTS = [
  'Analiza mi pipeline y dame prioridades',
  'Redacta un email de seguimiento para un importador de China',
  '¿Cuáles son los incoterms más usados en FCL?',
  'Estrategia para prospectar empresas manufactureras',
  'Diferencia entre FCL y LCL para un cliente nuevo',
  'Cómo calcular el flete aéreo vs marítimo',
];

function MarkdownText({ text }) {
  // Simple markdown: **bold**, bullet points
  const lines = text.split('\n');
  return (
    <div style={{ lineHeight: 1.6 }}>
      {lines.map((line, i) => {
        if (line.startsWith('• ') || line.startsWith('- ') || line.startsWith('✓ ')) {
          return <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 2 }}><span style={{ color: '#F2641E', flexShrink: 0 }}>•</span><span>{line.slice(2)}</span></div>;
        }
        const parts = line.split(/\*\*(.*?)\*\*/g);
        return <div key={i} style={{ marginBottom: line === '' ? 6 : 0 }}>{parts.map((p, j) => j % 2 === 1 ? <strong key={j}>{p}</strong> : p)}</div>;
      })}
    </div>
  );
}

export default function CopilotDrawer({ toast }) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '¡Hola! Soy el Copilot de ACON Internacional 🚢✈️🚛\n\nPuedo ayudarte con tu pipeline, redactar mensajes para leads, analizar métricas o responder preguntas sobre freight forwarding.\n\n¿En qué te ayudo hoy?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (open && suggestions.length === 0) {
      getCopilotSuggestions()
        .then(r => setSuggestions(r.data.data || []))
        .catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async (text) => {
    const userMsg = text || input.trim();
    if (!userMsg) return;
    setInput('');

    const newMessages = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const r = await chatWithCopilot(newMessages.map(m => ({ role: m.role, content: m.content })));
      setMessages(prev => [...prev, { role: 'assistant', content: r.data.data.reply }]);
    } catch (err) {
      const errMsg = err.response?.data?.message || 'Error al conectar con el Copilot. Verifica tu OPENAI_API_KEY.';
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${errMsg}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: '¡Listo! Conversación reiniciada. ¿En qué te ayudo ahora?' }]);
    setSuggestions([]);
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 28, right: 28, zIndex: 1000,
            width: 56, height: 56, borderRadius: '50%', border: 'none',
            background: 'linear-gradient(135deg, #0B2545 0%, #F2641E 100%)',
            color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(242,100,30,.4)',
            transition: 'transform .15s',
          }}
          title="Copilot IA"
        >
          <Bot size={24} />
        </button>
      )}

      {/* Drawer */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 1000,
          width: 400, height: minimized ? 56 : 580,
          background: '#fff', borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,.18)',
          display: 'flex', flexDirection: 'column',
          transition: 'height .2s ease',
          overflow: 'hidden',
          border: '1px solid #E3E6EA',
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #0B2545 0%, #1A3A6B 100%)',
            padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #F2641E, #F59E0B)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={18} color="#fff" />
              </div>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Copilot ACON</div>
                <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 11 }}>Asistente de Freight Forwarding</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={clearChat} title="Limpiar" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.5)', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex' }}>
                <RefreshCw size={14} />
              </button>
              <button onClick={() => setMinimized(!minimized)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.5)', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex' }}>
                <Minimize2 size={14} />
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.5)', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex' }}>
                <X size={14} />
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {m.role === 'assistant' && (
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#0B2545', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 8, alignSelf: 'flex-end' }}>
                        <Bot size={13} color="#F2641E" />
                      </div>
                    )}
                    <div style={{
                      maxWidth: '78%', padding: '10px 13px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background: m.role === 'user' ? '#F2641E' : '#F4F5F7',
                      color: m.role === 'user' ? '#fff' : '#1A1F2E',
                      fontSize: 13, lineHeight: 1.5,
                    }}>
                      {m.role === 'assistant' ? <MarkdownText text={m.content} /> : m.content}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#0B2545', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Bot size={13} color="#F2641E" />
                    </div>
                    <div style={{ padding: '10px 14px', background: '#F4F5F7', borderRadius: '14px 14px 14px 4px', display: 'flex', gap: 4 }}>
                      {[0,1,2].map(i => (
                        <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#9AA3AE', display: 'inline-block', animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Suggestions */}
              {messages.length <= 2 && (
                <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
                  {suggestions.length > 0 ? (
                    <>
                      <div style={{ fontSize: 11, color: '#9AA3AE', marginBottom: 6, fontWeight: 600 }}>SUGERENCIAS IA</div>
                      {suggestions.slice(0, 2).map((s, i) => (
                        <button key={i} onClick={() => sendMessage(s.prompt)} style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginBottom: 5,
                          padding: '8px 12px', borderRadius: 10, border: `1px solid ${s.type === 'hot' ? '#FEE2E2' : s.type === 'warning' ? '#FEF3C7' : '#E3E6EA'}`,
                          background: s.type === 'hot' ? '#FFF5F5' : s.type === 'warning' ? '#FFFBEB' : '#F9FAFB',
                          cursor: 'pointer', textAlign: 'left', fontSize: 12,
                        }}>
                          <span style={{ fontSize: 16, flexShrink: 0 }}>{s.icon}</span>
                          <span style={{ flex: 1, color: '#1A1F2E', fontWeight: 500 }}>{s.text}</span>
                          <ChevronRight size={12} color="#9AA3AE" />
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 11, color: '#9AA3AE', marginBottom: 6, fontWeight: 600 }}>PREGUNTAS RÁPIDAS</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {QUICK_PROMPTS.slice(0, 3).map((p, i) => (
                          <button key={i} onClick={() => sendMessage(p)} style={{ padding: '5px 10px', borderRadius: 20, border: '1px solid #E3E6EA', background: '#fff', fontSize: 11, cursor: 'pointer', color: '#5A6472', fontWeight: 500 }}>
                            {p.slice(0, 28)}…
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Input */}
              <div style={{ padding: '8px 12px 12px', flexShrink: 0, borderTop: '1px solid #F4F5F7' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Pregunta algo sobre tus leads, pipeline o logística..."
                    rows={1}
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: 12, border: '1px solid #E3E6EA',
                      resize: 'none', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                      background: '#F9FAFB', lineHeight: 1.4, maxHeight: 80,
                    }}
                    onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px'; }}
                  />
                  <button
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || loading}
                    style={{
                      width: 38, height: 38, borderRadius: 10, border: 'none',
                      background: input.trim() ? '#F2641E' : '#E3E6EA',
                      color: '#fff', cursor: input.trim() ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}
                  >
                    <Send size={16} />
                  </button>
                </div>
                <div style={{ fontSize: 10, color: '#C4C9D1', marginTop: 5, textAlign: 'center' }}>
                  Powered by GPT-4o · ACON Internacional
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
      `}</style>
    </>
  );
}
