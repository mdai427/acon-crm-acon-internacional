// ============================================
// ACON CRM - Servidor Principal
// ============================================
require('dotenv').config();

// Antes que nada: si los secretos no son seguros, no se arranca.
require('./config/validateEnv').validateEnv();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');

const cookieParser = require('cookie-parser');
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
const mailboxesRoutes = require('./routes/mailboxes');
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
const jobsRoutes       = require('./routes/jobs');
const playbooksRoutes  = require('./routes/playbooks');

// Registro de handlers de jobs (debe cargarse antes de que lleguen peticiones)
require('./services/jobHandlers');

const app = express();
// Detrás del proxy de EasyPanel/Traefik: necesario para que el rate limiting
// use la IP real del cliente (X-Forwarded-For) y no la del proxy.
app.set('trust proxy', 1);

// URLs normalizadas (sin barra final): CORS debe coincidir exactamente con el
// header Origin del navegador, que nunca lleva "/" al final.
const { FRONTEND_URL: FRONTEND_ORIGIN } = require('./config/urls');
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ['GET', 'POST']
  }
});

connectDB();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", FRONTEND_ORIGIN],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));
app.use(cors({
  origin: FRONTEND_ORIGIN,
  credentials: true,
  // La cabecera del doble envío de CSRF tiene que estar permitida o el
  // navegador bloquea la petición en el preflight.
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));
app.use(cookieParser());
app.use(morgan('dev'));

const webhookLimiter = rateLimit({ windowMs: 60000, max: 60, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60000, max: 10, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true });
const setupLimiter = rateLimit({ windowMs: 60 * 60000, max: 3, standardHeaders: true, legacyHeaders: false });

// Límite general: hasta ahora solo el login y los webhooks tenían tope, así que
// un token robado podía volcar toda la base de leads sin resistencia. El límite
// se cuenta por usuario autenticado cuando lo hay, no por IP: detrás de una
// oficina con IP única, contar por IP castigaría a todo el equipo junto.
// El limitador corre antes del middleware de auth, así que req.user todavía no
// existe: se cuenta por token (hasheado, nunca en claro en memoria del
// limitador) y se cae a la IP para las rutas anónimas.
const crypto = require('crypto');
function rateLimitKey(req) {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) return 'tk:' + crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
  return 'ip:' + (req.ip || 'desconocida');
}

const apiLimiter = rateLimit({
  windowMs: 60000, max: 300, standardHeaders: true, legacyHeaders: false,
  keyGenerator: rateLimitKey,
  message: { success: false, message: 'Demasiadas peticiones, espera un momento' },
});

// Los endpoints de IA cuestan dinero por llamada: van mucho más apretados.
const aiLimiter = rateLimit({
  windowMs: 60000, max: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: rateLimitKey,
  message: { success: false, message: 'Límite de peticiones de IA alcanzado, espera un minuto' },
});

// Los eventos de WhatsApp llegan de a muchos: una campaña de mil destinatarios
// genera miles de `message.status` en pocos minutos, y el tope general de los
// webhooks (60/min) los rebotaría con 429. La firma HMAC ya autentica cada
// entrega, así que el límite aquí solo protege de una avalancha.
const waWebhookLimiter = rateLimit({
  windowMs: 60000, max: 600, standardHeaders: true, legacyHeaders: false,
  keyGenerator: rateLimitKey,
});
app.use('/api/webhooks/labia', waWebhookLimiter);
app.use('/api/webhooks', (req, res, next) =>
  (req.path === '/labia' ? next() : webhookLimiter(req, res, next)));
app.use('/api/n8n',      webhookLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/setup', setupLimiter);

app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => { req.io = io; next(); });

// Se aplica después del body parser y antes de las rutas. Los webhooks quedan
// fuera: ya tienen su propio límite y no deben competir con el tráfico del CRM.
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/webhooks') || req.path.startsWith('/n8n')) return next();
  return apiLimiter(req, res, next);
});
app.use(['/api/agents', '/api/copilot', '/api/playbooks'], aiLimiter);

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
app.use('/api/mailboxes',    mailboxesRoutes);
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
app.use('/api/jobs',         jobsRoutes);
app.use('/api/playbooks',    playbooksRoutes);
app.use('/api/flows',        require('./routes/flows'));
app.use('/api/flow-runs',    require('./routes/flows').runs);
app.use('/api/commissions',  require('./routes/commissions'));
app.use('/api/search',       require('./routes/search'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/exchange-rate', require('./routes/exchangeRate'));
app.use('/api/catalog',       require('./routes/catalog'));
app.use('/api/sequences',     require('./routes/sequences'));
app.use('/api/audit',         require('./routes/audit'));
app.use('/api/erp',           require('./routes/erp'));
app.use('/api/calls',         require('./routes/calls'));
app.use('/api/ai-usage',      require('./routes/aiUsage'));
app.use('/api/superadmin',    require('./routes/superadmin'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'ACON CRM API v2.0' }));

// ── Cache admin endpoints (solo admin) ──────────────────────────
const { stats: cacheStats, flush: cacheFlush } = require('./services/cache');
const jwt = require('jsonwebtoken');
app.get('/api/cache/stats', (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (user.role !== 'admin') return res.status(403).json({ success: false });
    res.json({ success: true, data: cacheStats() });
  } catch { res.status(401).json({ success: false }); }
});
app.post('/api/cache/flush', (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (user.role !== 'admin') return res.status(403).json({ success: false });
    cacheFlush();
    res.json({ success: true, message: 'Cache vaciado' });
  } catch { res.status(401).json({ success: false }); }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(err.status || 500).json({
    success: false,
    message: isDev ? (err.message || 'Error interno del servidor') : 'Error interno del servidor',
  });
});

setupSocketHandlers(io);
startCronJobs(io);
require('./services/flows/engine').subscribe();

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 ACON CRM Backend corriendo en puerto ${PORT}`);
  console.log(`📡 WebSocket activo | 🌍 ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = { app, io };
