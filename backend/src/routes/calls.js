// ============================================
// Llamadas telefónicas (Twilio Voice)
// ============================================
// Endpoints del CRM (con sesión) + webhooks de Twilio (validados por firma).
const express = require('express');
const router = express.Router();
const { auth, checkPerm } = require('../middleware/auth');
const Call = require('../models/Call');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const twilioService = require('../services/twilioService');

// ─────────────────────────────────────────
// GET /api/calls/token — token para el marcador del navegador
// ─────────────────────────────────────────
router.get('/token', auth, checkPerm('calls.make'), (req, res) => {
  try {
    const data = twilioService.createVoiceToken(req.user._id.toString());
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────
// GET /api/calls/status-config — ¿está lista la integración?
// ─────────────────────────────────────────
router.get('/status-config', auth, (req, res) => {
  res.json({
    success: true,
    data: {
      configured: twilioService.isConfigured(),
      callerId: process.env.TWILIO_CALLER_ID || '',
    },
  });
});

// ─────────────────────────────────────────
// GET /api/calls — historial (filtrable por lead)
// ─────────────────────────────────────────
router.get('/', auth, checkPerm('calls.view'), async (req, res) => {
  try {
    const { leadId, limit = 50 } = req.query;
    const filter = {};
    if (leadId) filter.lead = leadId;

    const calls = await Call.find(filter)
      .populate('user', 'name email')
      .populate('lead', 'company contact')
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 50, 200))
      .lean();

    res.json({ success: true, data: calls });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────
// GET /api/calls/:id — detalle con transcripción
// ─────────────────────────────────────────
router.get('/:id', auth, checkPerm('calls.view'), async (req, res) => {
  try {
    const call = await Call.findById(req.params.id)
      .populate('user', 'name email')
      .populate('lead', 'company contact phone')
      .lean();
    if (!call) return res.status(404).json({ success: false, message: 'Llamada no encontrada' });
    res.json({ success: true, data: call });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═════════════════════════════════════════
// WEBHOOKS DE TWILIO
// Twilio los llama con POST urlencoded y firma X-Twilio-Signature.
// ═════════════════════════════════════════
function twilioOnly(req, res, next) {
  if (!twilioService.validateWebhook(req)) {
    console.warn('[calls] webhook rechazado: firma de Twilio inválida', req.originalUrl);
    return res.status(403).send('Forbidden');
  }
  next();
}

// ─────────────────────────────────────────
// POST /api/calls/voice — TwiML: conecta al cliente y graba
// Es la "Voice URL" de la TwiML App.
// ─────────────────────────────────────────
router.post('/voice', twilioOnly, async (req, res) => {
  res.type('text/xml');
  try {
    const to = twilioService.normalizePhone(req.body.To || req.body.to);
    const leadId = req.body.leadId || null;
    const userId = twilioService.userIdFromIdentity(req.body.From || req.body.Caller);

    if (!to) return res.send(twilioService.sayErrorTwiml('Número de destino inválido.'));

    await Call.create({
      lead: leadId || undefined,
      user: userId || undefined,
      direction: 'outbound',
      from: process.env.TWILIO_CALLER_ID,
      to,
      callSid: req.body.CallSid,
      status: 'initiated',
      startedAt: new Date(),
    });

    res.send(twilioService.buildDialTwiml({ to }));
  } catch (error) {
    console.error('[calls] voice webhook:', error);
    res.send(twilioService.sayErrorTwiml('Ocurrió un error al conectar la llamada.'));
  }
});

// ─────────────────────────────────────────
// POST /api/calls/status — ciclo de vida del tramo hacia el cliente
// ─────────────────────────────────────────
router.post('/status', twilioOnly, async (req, res) => {
  res.sendStatus(204); // Twilio no espera contenido
  try {
    // ParentCallSid es la llamada del navegador; CallSid, el tramo al cliente.
    const parentSid = req.body.ParentCallSid;
    const call = await Call.findOne(parentSid ? { callSid: parentSid } : { callSid: req.body.CallSid });
    if (!call) return;

    const status = req.body.CallStatus;
    const update = { status };
    if (parentSid) update.childSid = req.body.CallSid;
    if (status === 'in-progress' && !call.answeredAt) update.answeredAt = new Date();
    if (['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(status)) {
      update.endedAt = new Date();
      update.duration = Number(req.body.CallDuration || req.body.DialCallDuration || 0);
      if (req.body.Price) {
        update.price = Math.abs(Number(req.body.Price));
        update.priceUnit = req.body.PriceUnit;
      }
      // Sin grabación no habrá transcripción: no dejamos el estado en "pendiente".
      if (status !== 'completed' && call.transcription?.status === 'pending') {
        update['transcription.status'] = 'skipped';
      }
    }

    const updated = await Call.findByIdAndUpdate(call._id, update, { new: true });
    if (update.endedAt) await logActivity(updated, req.io);
  } catch (error) {
    console.error('[calls] status webhook:', error.message);
  }
});

// ─────────────────────────────────────────
// POST /api/calls/recording — grabación lista → transcribir
// ─────────────────────────────────────────
router.post('/recording', twilioOnly, async (req, res) => {
  res.sendStatus(204);
  try {
    const sid = req.body.CallSid; // el de la llamada del navegador (parent)
    const call = await Call.findOne({ $or: [{ callSid: sid }, { childSid: sid }] });
    if (!call) return;

    call.recording = {
      sid: req.body.RecordingSid,
      url: req.body.RecordingUrl,
      duration: Number(req.body.RecordingDuration || 0),
    };
    await call.save();

    // La transcripción tarda; se hace fuera del ciclo del webhook.
    transcribeCall(call._id, req.io).catch(err =>
      console.error('[calls] transcripción:', err.message));
  } catch (error) {
    console.error('[calls] recording webhook:', error.message);
  }
});

// ─────────────────────────────────────────
// POST /api/calls/:id/transcribe — reintento manual
// ─────────────────────────────────────────
router.post('/:id/transcribe', auth, checkPerm('calls.view'), async (req, res) => {
  const call = await Call.findById(req.params.id);
  if (!call) return res.status(404).json({ success: false, message: 'Llamada no encontrada' });
  if (!call.recording?.url) {
    return res.status(400).json({ success: false, message: 'La llamada no tiene grabación' });
  }
  transcribeCall(call._id, req.io).catch(err => console.error('[calls] transcripción:', err.message));
  res.json({ success: true, message: 'Transcripción en proceso' });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

// Descarga el audio y lo pasa por Whisper. Deja el resultado en la llamada y en
// la actividad del lead, para que quede en el timeline.
async function transcribeCall(callId, io) {
  const call = await Call.findById(callId);
  if (!call?.recording?.url) return;

  await Call.findByIdAndUpdate(callId, {
    'transcription.status': 'processing',
    'transcription.updatedAt': new Date(),
  });

  try {
    const audio = await twilioService.downloadRecording(call.recording.url);
    const result = await twilioService.transcribeAudio(audio, `llamada-${call._id}.mp3`);

    const updated = await Call.findByIdAndUpdate(callId, {
      transcription: {
        status: 'done',
        text: result.text,
        language: result.language,
        provider: result.provider,
        updatedAt: new Date(),
      },
    }, { new: true });

    await logActivity(updated, io, { withTranscription: true });
  } catch (error) {
    await Call.findByIdAndUpdate(callId, {
      'transcription.status': 'failed',
      'transcription.error': error.message,
      'transcription.updatedAt': new Date(),
    });
    throw error;
  }
}

const formatDuration = (seconds) => {
  const s = Number(seconds) || 0;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
};

// Crea (o completa) la actividad de tipo `call` en el timeline del lead.
async function logActivity(call, io, { withTranscription = false } = {}) {
  if (!call?.lead) return;

  const summary = `Llamada saliente a ${call.to} — ${call.status} (${formatDuration(call.duration)})`;
  const content = withTranscription && call.transcription?.text
    ? call.transcription.text
    : summary;

  const activity = await Activity.findOneAndUpdate(
    { 'metadata.callId': call._id },
    {
      lead: call.lead,
      user: call.user,
      type: 'call',
      direction: 'outbound',
      subject: summary,
      content,
      metadata: {
        callId: call._id,
        duration: call.duration,
        status: call.status,
        recordingSid: call.recording?.sid,
        hasTranscription: !!call.transcription?.text,
      },
    },
    { upsert: true, new: true }
  );

  if (call.status === 'completed') {
    await Lead.findByIdAndUpdate(call.lead, { lastContactDate: new Date() });
  }
  io?.emit('activity_new', { leadId: String(call.lead), activity });
  io?.emit('call_updated', { callId: String(call._id), leadId: String(call.lead) });
}

module.exports = router;
