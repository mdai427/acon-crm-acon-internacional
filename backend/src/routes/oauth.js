const express = require('express');
const { FRONTEND_URL, BACKEND_URL, clean } = require('../config/urls');
const router = express.Router();
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const UserIntegration = require('../models/UserIntegration');
const oauthState = require('../services/oauthState');
const { auth, checkPerm } = require('../middleware/auth');

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
    clean(process.env.GOOGLE_REDIRECT_URI) || `${BACKEND_URL}/api/oauth/google/callback`
  );
}

// Se usa el middleware compartido: estas rutas tenían su propia verificación
// que solo comprobaba la firma del token. No miraba si la cuenta seguía activa
// ni si la sesión había sido revocada, así que un usuario dado de baja seguía
// leyendo su Gmail y gastando IA desde aquí.

// GET /api/oauth/google/url - generate OAuth URL
router.get('/google/url', auth, checkPerm('integrations.connect'), (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(400).json({ success: false, message: 'Google OAuth no configurado. Agrega GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.' });
  }
  const oauth2Client = getOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: oauthState.issue(req.user.id, 'google'),
  });
  res.json({ success: true, url });
});

// GET /api/oauth/google/callback - exchange code for tokens
router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  const frontendUrl = FRONTEND_URL;

  if (!code || !state) {
    return res.redirect(`${frontendUrl}/integrations?error=missing_params`);
  }

  // El state es de un solo uso y caduca: si no se canjea, el callback no viene
  // del flujo que este servidor inició.
  const claim = oauthState.consume(state, 'google');
  if (!claim) {
    return res.redirect(`${frontendUrl}/integrations?error=invalid_state`);
  }
  const userId = claim.userId;

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
