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

// GET /api/calendar/events?leadId=&q=
router.get('/events', auth, async (req, res) => {
  const { leadId, q } = req.query;
  try {
    const authClient = await getAuthClientForUser(req.user.id);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      maxResults: 50,
      singleEvents: true,
      orderBy: 'startTime',
      q: q || undefined,
    });

    const events = (response.data.items || []).map(e => ({
      id: e.id,
      title: e.summary,
      description: e.description,
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      location: e.location,
      attendees: (e.attendees || []).map(a => ({ email: a.email, name: a.displayName })),
      hangoutLink: e.hangoutLink,
      status: e.status,
    }));

    res.json({ success: true, data: events });
  } catch (err) {
    if (err.message?.includes('No hay integración')) {
      return res.status(400).json({ success: false, message: 'Conecta Google Calendar primero', code: 'NOT_CONNECTED' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/calendar/events - create event
router.post('/events', auth, async (req, res) => {
  const { title, description, start, end, attendees, leadId, location } = req.body;
  try {
    const authClient = await getAuthClientForUser(req.user.id);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const event = {
      summary: title,
      description: description || '',
      location: location || '',
      start: { dateTime: start, timeZone: 'America/Mexico_City' },
      end: { dateTime: end || new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString(), timeZone: 'America/Mexico_City' },
      attendees: (attendees || []).map(email => ({ email })),
      conferenceData: {
        createRequest: { requestId: `acon-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } }
      },
    };

    const created = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1,
      sendUpdates: 'all',
    });

    res.json({ success: true, data: {
      id: created.data.id,
      title: created.data.summary,
      start: created.data.start?.dateTime,
      end: created.data.end?.dateTime,
      hangoutLink: created.data.hangoutLink,
      htmlLink: created.data.htmlLink,
    }});
  } catch (err) {
    if (err.message?.includes('No hay integración')) {
      return res.status(400).json({ success: false, message: 'Conecta Google Calendar primero', code: 'NOT_CONNECTED' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/calendar/events/:eventId
router.delete('/events/:eventId', auth, async (req, res) => {
  try {
    const authClient = await getAuthClientForUser(req.user.id);
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    await calendar.events.delete({ calendarId: 'primary', eventId: req.params.eventId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
