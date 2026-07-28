// ============================================================
// ACON CRM - Ad Platforms (Meta, LinkedIn, Google Ads)
// ============================================================
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const UserIntegration = require('../models/UserIntegration');

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'No autorizado' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { return res.status(401).json({ success: false, message: 'Token inválido' }); }
};

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL  = process.env.BACKEND_URL  || 'http://localhost:5000';

// ─── META (Facebook / Instagram Ads) ───────────────────────

router.get('/meta/url', auth, (req, res) => {
  const state = Buffer.from(JSON.stringify({ userId: req.user.id, ts: Date.now() })).toString('base64');
  const params = new URLSearchParams({
    client_id:     process.env.META_APP_ID || '',
    redirect_uri:  `${BACKEND_URL}/api/ads/meta/callback`,
    scope:         'ads_management,ads_read,business_management,pages_read_engagement',
    response_type: 'code',
    state,
  });
  res.json({ success: true, data: { url: `https://www.facebook.com/v19.0/dialog/oauth?${params}` } });
});

router.get('/meta/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`${FRONTEND_URL}/marketing?tab=ads&error=meta_denied`);
  try {
    const { userId } = JSON.parse(Buffer.from(state, 'base64').toString());
    // Exchange code for token
    const tokenRes = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: {
        client_id:     process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri:  `${BACKEND_URL}/api/ads/meta/callback`,
        code,
      },
    });
    const { access_token, expires_in } = tokenRes.data;
    // Get user/account info
    const meRes = await axios.get('https://graph.facebook.com/v19.0/me', {
      params: { fields: 'id,name,email', access_token },
    });
    await UserIntegration.findOneAndUpdate(
      { userId, provider: 'meta_ads' },
      {
        userId, provider: 'meta_ads',
        providerEmail: meRes.data.email || meRes.data.name,
        accessToken: access_token,
        expiresAt: expires_in ? new Date(Date.now() + expires_in * 1000) : null,
        scopes: ['ads_management', 'ads_read'],
        meta: { userId: meRes.data.id, name: meRes.data.name },
      },
      { upsert: true, new: true }
    );
    res.redirect(`${FRONTEND_URL}/marketing?tab=ads&connected=meta`);
  } catch (err) {
    console.error('Meta callback error:', err.response?.data || err.message);
    res.redirect(`${FRONTEND_URL}/marketing?tab=ads&error=meta_failed`);
  }
});

// ─── LINKEDIN ADS ───────────────────────────────────────────

router.get('/linkedin/url', auth, (req, res) => {
  const state = Buffer.from(JSON.stringify({ userId: req.user.id, ts: Date.now() })).toString('base64');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.LINKEDIN_CLIENT_ID || '',
    redirect_uri:  `${BACKEND_URL}/api/ads/linkedin/callback`,
    state,
    scope:         'r_ads r_ads_reporting w_organization_social rw_ads',
  });
  res.json({ success: true, data: { url: `https://www.linkedin.com/oauth/v2/authorization?${params}` } });
});

router.get('/linkedin/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`${FRONTEND_URL}/marketing?tab=ads&error=linkedin_denied`);
  try {
    const { userId } = JSON.parse(Buffer.from(state, 'base64').toString());
    const tokenRes = await axios.post(
      'https://www.linkedin.com/oauth/v2/accessToken',
      new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  `${BACKEND_URL}/api/ads/linkedin/callback`,
        client_id:     process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const { access_token, expires_in } = tokenRes.data;
    const profileRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    await UserIntegration.findOneAndUpdate(
      { userId, provider: 'linkedin_ads' },
      {
        userId, provider: 'linkedin_ads',
        providerEmail: profileRes.data.email || profileRes.data.name,
        accessToken: access_token,
        expiresAt: expires_in ? new Date(Date.now() + expires_in * 1000) : null,
        scopes: ['r_ads', 'w_organization_social'],
        meta: { sub: profileRes.data.sub, name: profileRes.data.name },
      },
      { upsert: true, new: true }
    );
    res.redirect(`${FRONTEND_URL}/marketing?tab=ads&connected=linkedin`);
  } catch (err) {
    console.error('LinkedIn callback error:', err.response?.data || err.message);
    res.redirect(`${FRONTEND_URL}/marketing?tab=ads&error=linkedin_failed`);
  }
});

// ─── GOOGLE ADS ─────────────────────────────────────────────
// Reuses existing Google OAuth — just adds googleads scope

router.get('/google/url', auth, (req, res) => {
  const { google } = require('googleapis');
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${BACKEND_URL}/api/ads/google/callback`
  );
  const state = Buffer.from(JSON.stringify({ userId: req.user.id, ts: Date.now() })).toString('base64');
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/adwords',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state,
  });
  res.json({ success: true, data: { url } });
});

router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`${FRONTEND_URL}/marketing?tab=ads&error=google_ads_denied`);
  try {
    const { google } = require('googleapis');
    const { userId } = JSON.parse(Buffer.from(state, 'base64').toString());
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${BACKEND_URL}/api/ads/google/callback`
    );
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    await UserIntegration.findOneAndUpdate(
      { userId, provider: 'google_ads' },
      {
        userId, provider: 'google_ads',
        providerEmail: userInfo.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scopes: ['adwords'],
      },
      { upsert: true, new: true }
    );
    res.redirect(`${FRONTEND_URL}/marketing?tab=ads&connected=google_ads`);
  } catch (err) {
    console.error('Google Ads callback error:', err.message);
    res.redirect(`${FRONTEND_URL}/marketing?tab=ads&error=google_ads_failed`);
  }
});

// ─── STATUS ─────────────────────────────────────────────────

router.get('/status', auth, async (req, res) => {
  try {
    const integrations = await UserIntegration.find({
      userId: req.user.id,
      provider: { $in: ['meta_ads', 'linkedin_ads', 'google_ads'] },
    }).select('provider providerEmail expiresAt meta');
    res.json({ success: true, data: integrations });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── DISCONNECT ─────────────────────────────────────────────

router.delete('/disconnect/:provider', auth, async (req, res) => {
  try {
    await UserIntegration.deleteOne({ userId: req.user.id, provider: req.params.provider });
    res.json({ success: true, message: 'Desconectado' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── AD ACCOUNTS LIST ───────────────────────────────────────

router.get('/meta/accounts', auth, async (req, res) => {
  try {
    const integration = await UserIntegration.findOne({ userId: req.user.id, provider: 'meta_ads' });
    if (!integration) return res.status(400).json({ success: false, code: 'NOT_CONNECTED' });
    const r = await axios.get('https://graph.facebook.com/v19.0/me/adaccounts', {
      params: { fields: 'id,name,currency,account_status', access_token: integration.accessToken },
    });
    res.json({ success: true, data: r.data.data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.response?.data?.error?.message || err.message });
  }
});

router.get('/linkedin/accounts', auth, async (req, res) => {
  try {
    const integration = await UserIntegration.findOne({ userId: req.user.id, provider: 'linkedin_ads' });
    if (!integration) return res.status(400).json({ success: false, code: 'NOT_CONNECTED' });
    const r = await axios.get('https://api.linkedin.com/v2/adAccountsV2?q=search&search.type.values[0]=BUSINESS&search.status.values[0]=ACTIVE', {
      headers: { Authorization: `Bearer ${integration.accessToken}` },
    });
    res.json({ success: true, data: r.data.elements || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.response?.data?.message || err.message });
  }
});

// ─── CREATE AD CAMPAIGN ─────────────────────────────────────

router.post('/campaign', auth, async (req, res) => {
  const { platform, name, objective, dailyBudget, currency, adAccountId, startDate, endDate, headline, description, targetUrl } = req.body;
  try {
    const integration = await UserIntegration.findOne({ userId: req.user.id, provider: platform });
    if (!integration) return res.status(400).json({ success: false, code: 'NOT_CONNECTED', message: `${platform} no conectado` });

    let result = {};

    if (platform === 'meta_ads') {
      // Create campaign
      const campRes = await axios.post(
        `https://graph.facebook.com/v19.0/${adAccountId}/campaigns`,
        {
          name,
          objective: objective || 'LEAD_GENERATION',
          status: 'PAUSED',
          special_ad_categories: [],
        },
        { params: { access_token: integration.accessToken } }
      );
      result = { campaignId: campRes.data.id, platform: 'meta', status: 'created_paused' };
    } else if (platform === 'linkedin_ads') {
      const campRes = await axios.post(
        'https://api.linkedin.com/v2/adCampaignsV2',
        {
          account: `urn:li:sponsoredAccount:${adAccountId}`,
          name,
          type: 'SPONSORED_UPDATES',
          status: 'DRAFT',
          costType: 'CPM',
          dailyBudget: { amount: String(dailyBudget || 10), currencyCode: currency || 'USD' },
          objectiveType: objective || 'LEAD_GENERATION',
          runSchedule: { start: startDate ? new Date(startDate).getTime() : Date.now() },
        },
        { headers: { Authorization: `Bearer ${integration.accessToken}`, 'X-Restli-Protocol-Version': '2.0.0' } }
      );
      result = { campaignId: campRes.headers['x-restli-id'], platform: 'linkedin', status: 'draft' };
    } else if (platform === 'google_ads') {
      // Google Ads REST API v17 — simplified campaign creation note
      result = { platform: 'google_ads', status: 'pending', message: 'Usa Google Ads Manager para activar — requiere Developer Token aprobado.' };
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Ad campaign error:', err.response?.data || err.message);
    res.status(500).json({ success: false, message: err.response?.data?.error?.message || err.response?.data?.message || err.message });
  }
});

module.exports = router;
