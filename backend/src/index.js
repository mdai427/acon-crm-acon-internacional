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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Conectar base de datos
connectDB();

// Middlewares de seguridad
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('dev'));

// Rate limiting para rutas públicas (webhooks, auth)
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 60,             // 60 requests/min por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiadas solicitudes, intenta en un momento' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,                   // 20 intentos de login
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiados intentos, espera 15 minutos' }
});
app.use('/api/webhooks', webhookLimiter);
app.use('/api/n8n',      webhookLimiter);
app.use('/api/auth/login', authLimiter);

// Body parsers - webhook de Meta necesita raw body
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Pasar io a todas las rutas via req
app.use((req, res, next) => {
  req.io = io;
  next();
});

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'ACON CRM API v1.0'
  });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// WebSocket handlers
setupSocketHandlers(io);

// Cron jobs (seguimientos automáticos, alertas, etc.)
startCronJobs(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 ACON CRM Backend corriendo en puerto ${PORT}`);
  console.log(`📡 WebSocket activo`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = { app, io };
