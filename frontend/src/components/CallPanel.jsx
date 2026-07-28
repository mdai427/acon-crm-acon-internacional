import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, RefreshCw, FileText, Loader2 } from 'lucide-react';
import { getVoiceToken, getVoiceStatus, getCalls, retryTranscript } from '../services/api';

// Marcador de llamadas del lead (Twilio Voice). El audio va por el navegador:
// el SDK abre una llamada contra nuestra TwiML App y el backend la conecta con
// el cliente, la graba y la transcribe.
//
// El SDK se carga bajo demanda para no meter ~200 kB en el bundle inicial de
// quien nunca llama.

const STATUS_LABEL = {
  idle: 'Listo para llamar',
  connecting: 'Conectando…',
  ringing: 'Timbrando…',
  'in-call': 'En llamada',
  ending: 'Colgando…',
};

const CALL_STATUS_LABEL = {
  completed: 'Contestada', 'no-answer': 'Sin respuesta', busy: 'Ocupado',
  failed: 'Fallida', canceled: 'Cancelada', 'in-progress': 'En curso',
  ringing: 'Timbrando', initiated: 'Iniciada', queued: 'En cola',
};

const formatDuration = (seconds) => {
  const s = Number(seconds) || 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const formatDate = (iso) => new Date(iso).toLocaleString('es-MX', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
});

function TranscriptionBlock({ call, onRetry }) {
  const [open, setOpen] = useState(false);
  const t = call.transcription || {};

  if (t.status === 'done' && t.text) {
    return (
      <div style={{ marginTop: 8 }}>
        <button onClick={() => setOpen(o => !o)} style={{
          display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none',
          padding: 0, cursor: 'pointer', color: 'var(--orange)', fontSize: 12, fontWeight: 600,
        }}>
          <FileText size={13} /> {open ? 'Ocultar transcripción' : 'Ver transcripción'}
        </button>
        {open && (
          <div style={{
            marginTop: 6, padding: '10px 12px', borderRadius: 8,
            background: 'var(--gray-50)', fontSize: 12.5, color: 'var(--text2)',
            whiteSpace: 'pre-wrap', lineHeight: 1.55, maxHeight: 260, overflowY: 'auto',
          }}>{t.text}</div>
        )}
      </div>
    );
  }

  if (t.status === 'processing' || t.status === 'pending') {
    return <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text3)' }}>Transcribiendo…</div>;
  }

  if (t.status === 'failed') {
    return (
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--red)' }}>Transcripción fallida</span>
        {call.recording?.url && (
          <button onClick={() => onRetry(call._id)} style={{
            display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
            padding: 0, cursor: 'pointer', color: 'var(--orange)', fontSize: 12, fontWeight: 600,
          }}>
            <RefreshCw size={12} /> Reintentar
          </button>
        )}
      </div>
    );
  }

  return null;
}

export default function CallPanel({ lead, toast }) {
  const [configured, setConfigured] = useState(false);
  const [calls, setCalls] = useState([]);
  const [status, setStatus] = useState('idle');
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [loading, setLoading] = useState(true);

  const deviceRef = useRef(null);
  const callRef = useRef(null);
  const timerRef = useRef(null);

  const phone = lead?.phone || lead?.mobile || '';

  const loadCalls = useCallback(async () => {
    try {
      const r = await getCalls({ leadId: lead._id });
      setCalls(r.data.data || []);
    } catch {
      // El historial es informativo: un fallo aquí no debe bloquear el marcador.
    }
  }, [lead._id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await getVoiceStatus();
        if (!cancelled) setConfigured(!!r.data.data?.configured);
      } catch {
        if (!cancelled) setConfigured(false);
      }
      await loadCalls();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loadCalls]);

  // Cuelga y libera el dispositivo al salir de la pantalla.
  useEffect(() => () => {
    clearInterval(timerRef.current);
    try { callRef.current?.disconnect(); } catch {}
    try { deviceRef.current?.destroy(); } catch {}
  }, []);

  const stopTimer = () => { clearInterval(timerRef.current); timerRef.current = null; };

  const finish = useCallback(() => {
    stopTimer();
    callRef.current = null;
    setStatus('idle');
    setMuted(false);
    setSeconds(0);
    // La duración y la transcripción las escriben los webhooks de Twilio, que
    // llegan unos segundos después de colgar.
    setTimeout(loadCalls, 4000);
    setTimeout(loadCalls, 20000);
  }, [loadCalls]);

  const startCall = async () => {
    if (!phone) { toast('El lead no tiene teléfono registrado', 'error'); return; }
    setStatus('connecting');
    try {
      const [{ Device }, tokenRes] = await Promise.all([
        import('@twilio/voice-sdk'),
        getVoiceToken(),
      ]);

      const device = new Device(tokenRes.data.data.token, { codecPreferences: ['opus', 'pcmu'] });
      deviceRef.current = device;
      device.on('error', (err) => {
        toast(`Error de Twilio: ${err.message}`, 'error');
        finish();
      });

      const call = await device.connect({ params: { To: phone, leadId: lead._id } });
      callRef.current = call;

      call.on('ringing', () => setStatus('ringing'));
      call.on('accept', () => {
        setStatus('in-call');
        setSeconds(0);
        timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
      });
      call.on('disconnect', finish);
      call.on('cancel', finish);
      call.on('reject', () => { toast('Llamada rechazada', 'info'); finish(); });
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'No se pudo iniciar la llamada';
      toast(msg, 'error');
      finish();
    }
  };

  const hangUp = () => {
    setStatus('ending');
    try { callRef.current?.disconnect(); } catch { finish(); }
  };

  const toggleMute = () => {
    const call = callRef.current;
    if (!call) return;
    const next = !muted;
    call.mute(next);
    setMuted(next);
  };

  const handleRetry = async (callId) => {
    try {
      await retryTranscript(callId);
      toast('Transcripción en proceso', 'info');
      setTimeout(loadCalls, 8000);
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudo transcribir', 'error');
    }
  };

  if (loading) return <div className="loading"><div className="spinner" />Cargando llamadas…</div>;

  const inCall = status !== 'idle';

  return (
    <div>
      {/* Marcador */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, marginBottom: 3 }}>Llamar a {lead.contact || lead.company}</div>
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>
              {phone || 'Sin teléfono registrado'}
              {inCall && <> — {STATUS_LABEL[status]}{status === 'in-call' && ` · ${formatDuration(seconds)}`}</>}
            </div>
          </div>

          {!inCall ? (
            <button
              className="btn btn-primary"
              onClick={startCall}
              disabled={!configured || !phone}
              title={!configured ? 'Configura Twilio en Integraciones' : undefined}
              style={{ display: 'flex', alignItems: 'center', gap: 7 }}
            >
              <Phone size={15} /> Llamar
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={toggleMute} disabled={status !== 'in-call'}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {muted ? <MicOff size={15} /> : <Mic size={15} />} {muted ? 'Activar micrófono' : 'Silenciar'}
              </button>
              <button className="btn" onClick={hangUp} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--red)', color: '#fff', border: 'none',
              }}>
                {status === 'connecting' ? <Loader2 size={15} /> : <PhoneOff size={15} />} Colgar
              </button>
            </div>
          )}
        </div>

        {!configured && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text3)' }}>
            Twilio todavía no está configurado. Un administrador debe completarlo en
            {' '}<strong>Integraciones → Twilio Voice</strong>.
          </div>
        )}
      </div>

      {/* Historial */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>Historial de llamadas</div>
          <button className="btn btn-ghost btn-sm" onClick={loadCalls}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <RefreshCw size={13} /> Actualizar
          </button>
        </div>

        {!calls.length ? (
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Todavía no hay llamadas registradas.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {calls.map(call => (
              <div key={call._id} style={{
                padding: '11px 13px', borderRadius: 10,
                background: 'var(--gray-50)', border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Phone size={14} color="var(--text3)" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{call.to}</span>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {CALL_STATUS_LABEL[call.status] || call.status} · {formatDuration(call.duration)}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 'auto' }}>
                    {formatDate(call.createdAt)}{call.user?.name ? ` · ${call.user.name}` : ''}
                  </span>
                </div>
                <TranscriptionBlock call={call} onRetry={handleRetry} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
