// ============================================
// ACON CRM - Servidor Principal
// ============================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');

const rateLimit = require('express-rate-limit');
const connectDB = require('./config/database');
const { setupSocketHandlers } = require('./services/socketService');
const { startCronJobs } = require('./services/cronService');

// Rutas
const authRoutes = require('./routes/auth');
const leadsRoutes = require('./routes/leads');
const contactsRoutes = require('./routes/contacts');
const pipelineRoutes = require('./routes/pipeline');
const activitiesRoutes = require('./routes/activities');
const whatsappRoutes = require('./routes/whatsapp');
const emailRoutes = require('./routes/email');
const agentsRoutes = require('./routes/agents');
const reportsRoutes = require('./routes/reports');
const webhooksRoutes = require('./routes/webhooks');
const usersRoutes = require('./routes/users');
const integrationsRoutes = require('./routes/integrations');
const configRoutes = require('./routes/config');
const n8nRoutes    = require('./routes/n8n');
const operationsRoutes = require('./routes/operations');
const quotesRoutes     = require('./routes/quotes');
const followupsRoutes  = require('./routes/followups');
const templatesRoutes  = require('./routes/templates');
const { router: oauthRoutes } = require('./routes/oauth');
const calendarRoutes   = require('./routes/userCalendar');
const gmailRoutes      = require('./routes/gmail');
const marketingRoutes  = require('./routes/marketing');
const copilotRoutes    = require('./routes/copilot');
const postVentaRoutes  = require('./routes/postventa');
const adsRoutes        = require('./routes/ads');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

connectDB();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('dev'));

const webhookLimiter = rateLimit({ windowMs: 60000, max: 60, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60000, max: 20, standardHeaders: true, legacyHeaders: false });
app.use('/api/webhooks', webhookLimiter);
app.use('/api/n8n',      webhookLimiter);
app.use('/api/auth/login', authLimiter);

app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => { req.io = io; next(); });

// ============================================
// RUTAS API
// ============================================
app.use('/api/auth',         authRoutes);
app.use('/api/leads',        leadsRoutes);
app.use('/api/contacts',     contactsRoutes);
app.use('/api/pipeline',     pipelineRoutes);
app.use('/api/activities',   activitiesRoutes);
app.use('/api/whatsapp',     whatsappRoutes);
app.use('/api/email',        emailRoutes);
app.use('/api/agents',       agentsRoutes);
app.use('/api/reports',      reportsRoutes);
app.use('/api/webhooks',     webhooksRoutes);
app.use('/api/users',        usersRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/config',       configRoutes);
app.use('/api/n8n',          n8nRoutes);
app.use('/api/operations',   operationsRoutes);
app.use('/api/quotes',       quotesRoutes);
app.use('/api/followups',    followupsRoutes);
app.use('/api/templates',    templatesRoutes);
app.use('/api/oauth',        oauthRoutes);
app.use('/api/calendar',     calendarRoutes);
app.use('/api/gmail',        gmailRoutes);
app.use('/api/marketing',    marketingRoutes);
app.use('/api/copilot',      copilotRoutes);
app.use('/api/postventa',    postVentaRoutes);
app.use('/api/ads',          adsRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'ACON CRM API v2.0' }));

// ── Cache admin endpoints (solo admin) ──────────────────────────
const { stats: cacheStats, flush: cacheFlush } = require('./services/cache');
const jwt = require('jsonwebtoken');
app.get('/api/cache/stats', (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const user = jwt.verify(token, process.env.JWT_SECRET);
    if (user.role !== 'admin') return res.status(403).json({ success: false });
    res.json({ success: true, data: cacheStats() });
  } catch { res.status(401).json({ success: false }); }
});
app.post('/api/cache/flush', (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const user = jwt.verify(token, process.env.JWT_SECRET);
    if (user.role !== 'admin') return res.status(403).json({ success: false });
    cacheFlush();
    res.json({ success: true, message: 'Cache vaciado' });
  } catch { res.status(401).json({ success: false }); }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Error interno del servidor' });
});

setupSocketHandlers(io);
startCronJobs(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 ACON CRM Backend corriendo en puerto ${PORT}`);
  console.log(`📡 WebSocket activo | 🌍 ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = { app, io };
