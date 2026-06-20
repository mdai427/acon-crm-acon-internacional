const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const UserIntegration = require('../models/UserIntegration');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/oauth/google/callback`
  );
}

// Middleware auth
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

// GET /api/oauth/google/url - generate OAuth URL
router.get('/google/url', auth, (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(400).json({ success: false, message: 'Google OAuth no configurado. Agrega GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.' });
  }
  const oauth2Client = getOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: req.user.id,
  });
  res.json({ success: true, url });
});

// GET /api/oauth/google/callback - exchange code for tokens
router.get('/google/callback', async (req, res) => {
  const { code, state: userId } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  if (!code || !userId) {
    return res.redirect(`${frontendUrl}/integrations?error=missing_params`);
  }

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    await UserIntegration.findOneAndUpdate(
      { userId, provider: 'google' },
      {
        userId,
        provider: 'google',
        providerEmail: userInfo.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(tokens.expiry_date),
        scopes: SCOPES,
      },
      { upsert: true, new: true }
    );

    res.redirect(`${frontendUrl}/integrations?connected=google&email=${encodeURIComponent(userInfo.email)}`);
  } catch (err) {
    console.error('OAuth callback error:', err.message);
    res.redirect(`${frontendUrl}/integrations?error=oauth_failed`);
  }
});

// GET /api/oauth/status - list user's connected integrations
router.get('/status', auth, async (req, res) => {
  try {
    const integrations = await UserIntegration.find({ userId: req.user.id });
    const map = {};
    for (const i of integrations) {
      map[i.provider] = {
        connected: true,
        email: i.providerEmail,
        expiresAt: i.expiresAt,
      };
    }
    res.json({ success: true, data: map });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/oauth/disconnect/:provider
router.delete('/disconnect/:provider', auth, async (req, res) => {
  try {
    await UserIntegration.findOneAndDelete({ userId: req.user.id, provider: req.params.provider });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Helper: get authenticated OAuth2 client for a user
async function getAuthClientForUser(userId) {
  const integration = await UserIntegration.findOne({ userId, provider: 'google' });
  if (!integration) throw new Error('No hay integración de Google para este usuario');

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: integration.accessToken,
    refresh_token: integration.refreshToken,
    expiry_date: integration.expiresAt?.getTime(),
  });

  // Auto-refresh if needed
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      integration.accessToken = tokens.access_token;
      if (tokens.expiry_date) integration.expiresAt = new Date(tokens.expiry_date);
      await integration.save();
    }
  });

  return oauth2Client;
}

module.exports = { router, getAuthClientForUser };
