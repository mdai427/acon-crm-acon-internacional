const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const { getAuthClientForUser } = require('./oauth');

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'No autorizado' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Token inválido' });
  }
};

function decodeBase64(data) {
  try {
    return Buffer.from(data, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function extractBody(payload) {
  if (!payload) return '';
  if (payload.body?.data) return decodeBase64(payload.body.data);
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64(part.body.data);
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeBase64(part.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
  }
  return '';
}

// GET /api/gmail/messages?contactEmail=&maxResults=
router.get('/messages', auth, async (req, res) => {
  const { contactEmail, maxResults = 20 } = req.query;
  if (!contactEmail) return res.status(400).json({ success: false, message: 'contactEmail es requerido' });

  try {
    const authClient = await getAuthClientForUser(req.user.id);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    const q = `from:${contactEmail} OR to:${contactEmail}`;
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q,
      maxResults: parseInt(maxResults),
    });

    const messages = listRes.data.messages || [];
    if (messages.length === 0) return res.json({ success: true, data: [] });

    const details = await Promise.all(
      messages.slice(0, 20).map(m =>
        gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' })
          .catch(() => null)
      )
    );

    const result = details
      .filter(Boolean)
      .map(r => {
        const headers = r.data.payload?.headers || [];
        const get = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
        return {
          id: r.data.id,
          threadId: r.data.threadId,
          subject: get('Subject') || '(sin asunto)',
          from: get('From'),
          to: get('To'),
          date: get('Date'),
          snippet: r.data.snippet,
          body: extractBody(r.data.payload),
          labelIds: r.data.labelIds || [],
          isUnread: (r.data.labelIds || []).includes('UNREAD'),
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ success: true, data: result });
  } catch (err) {
    if (err.message?.includes('No hay integración')) {
      return res.status(400).json({ success: false, message: 'Conecta Gmail primero', code: 'NOT_CONNECTED' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/gmail/send - send email via Gmail
router.post('/send', auth, async (req, res) => {
  const { to, subject, body, threadId } = req.body;
  try {
    const authClient = await getAuthClientForUser(req.user.id);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      body,
    ].join('\r\n');

    const encoded = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const params = { userId: 'me', resource: { raw: encoded } };
    if (threadId) params.resource.threadId = threadId;

    const sent = await gmail.users.messages.send(params);
    res.json({ success: true, data: { id: sent.data.id } });
  } catch (err) {
    if (err.message?.includes('No hay integración')) {
      return res.status(400).json({ success: false, message: 'Conecta Gmail primero', code: 'NOT_CONNECTED' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
