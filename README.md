# 🚀 ACON CRM — Sistema Completo
## ACON Worldwide Logística Internacional

---

## 📁 Estructura del Proyecto

```
acon-crm/
├── backend/                   # Node.js + Express + MongoDB
│   ├── src/
│   │   ├── index.js           # Servidor principal + Socket.io
│   │   ├── config/
│   │   │   └── database.js    # Conexión MongoDB
│   │   ├── models/
│   │   │   ├── User.js        # Usuarios (admin, ejecutivo, viewer)
│   │   │   ├── Lead.js        # Prospectos/Contactos (entidad central)
│   │   │   └── Activity.js    # Actividades (WA, email, llamadas, notas)
│   │   ├── middleware/
│   │   │   └── auth.js        # JWT + roles
│   │   ├── routes/
│   │   │   ├── auth.js        # Login, registro, perfil
│   │   │   ├── leads.js       # CRUD completo de leads
│   │   │   ├── pipeline.js    # Kanban, mover etapas
│   │   │   ├── whatsapp.js    # Envío + Webhook Meta WA
│   │   │   ├── email.js       # SMTP + plantillas
│   │   │   ├── agents.js      # Endpoints de agentes IA
│   │   │   ├── reports.js     # KPIs, dashboard, exportar CSV
│   │   │   ├── webhooks.js    # Meta Lead Ads, genérico, LinkedIn
│   │   │   ├── users.js       # Gestión de equipo
│   │   │   ├── activities.js  # Historial de interacciones
│   │   │   └── integrations.js # Estado de conexiones
│   │   └── services/
│   │       ├── aiAgent.js     # 4 agentes OpenAI (scoring, reply, draft, análisis)
│   │       ├── cronService.js # Jobs automáticos (alertas, rescoring)
│   │       └── socketService.js # WebSocket tiempo real
│   └── .env.example           # Variables de entorno
│
└── frontend/                  # React (o usar el HTML preview)
    └── src/
        ├── App.jsx
        ├── pages/             # Dashboard, Leads, Pipeline, WhatsApp, etc.
        ├── components/        # Componentes reutilizables
        ├── services/          # axios, socket.io-client
        └── context/           # AuthContext, LeadsContext
```

---

## ⚡ Instalación Rápida

### 1. Requisitos
- Node.js v18+
- MongoDB (local o Atlas)
- Cuenta Meta Business (WhatsApp + Facebook)
- API Key de OpenAI (opcional, mejora IA)

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
# → Edita .env con tus credenciales
npm run dev        # Desarrollo
npm start          # Producción
```

### 3. Frontend (React)

```bash
cd frontend
npm install
npm start          # http://localhost:3000
```

### 4. Solo el preview HTML
Abre `ACON_CRM_Preview.html` directamente en el navegador.

---

## 🔌 Configurar Integraciones

### WhatsApp (Meta Cloud API)
1. Ir a [developers.facebook.com](https://developers.facebook.com)
2. Crear app → WhatsApp Business
3. Copiar `Phone Number ID` y `Access Token` → `.env`
4. Configurar webhook: `https://TU-DOMINIO/api/whatsapp/webhook`
5. Verify Token: el valor de `META_WA_VERIFY_TOKEN` en `.env`

### Facebook Lead Ads
1. En Meta Business → Configuración → Suscripciones de webhook
2. URL: `https://TU-DOMINIO/api/webhooks/meta`
3. Verify Token: valor de `META_WEBHOOK_VERIFY_TOKEN`
4. Suscribirse a: `leadgen`

### LinkedIn (via Make/Zapier)
1. Crear un Zap: LinkedIn Lead Gen Form → HTTP POST
2. URL: `https://TU-DOMINIO/api/webhooks/linkedin`
3. Headers: `x-api-key: TUS_PRIMEROS_20_CHARS_JWT_SECRET`

### Email SMTP (Gmail)
1. Google Account → Seguridad → Contraseñas de aplicación
2. Generar contraseña para "Correo"
3. Poner en `.env`: `SMTP_USER=tu@gmail.com`, `SMTP_PASS=contraseña-app`

### OpenAI (Agentes IA)
1. [platform.openai.com](https://platform.openai.com) → API Keys
2. Poner en `.env`: `OPENAI_API_KEY=sk-...`

---

## 🤖 Los 4 Agentes de IA

| Agente | Función | Trigger |
|--------|---------|---------|
| **Scoring** | Puntúa leads 0-100 | Al crear o editar lead |
| **Auto-Reply** | Responde WhatsApp/email si no hay respuesta en 30min | Mensaje entrante |
| **Email Draft** | Genera borrador personalizado | Botón en lead detail |
| **Pipeline Analysis** | Insights del pipeline del ejecutivo | Dashboard / bajo demanda |

---

## 🔐 Roles de Usuario

| Rol | Acceso |
|-----|--------|
| `admin` | Todo: ver todos los leads, reportes globales, gestión de usuarios |
| `executive` | Solo sus propios leads y actividades |
| `viewer` | Solo lectura (reportes) |

---

## 📡 API Reference (principales endpoints)

### Auth
```
POST /api/auth/login          → { token, user }
GET  /api/auth/me             → user actual
POST /api/auth/register       → crear usuario (solo admin)
```

### Leads
```
GET    /api/leads             → lista con filtros
GET    /api/leads/:id         → detalle + actividades
POST   /api/leads             → crear lead
PUT    /api/leads/:id         → actualizar
POST   /api/leads/:id/assign  → reasignar ejecutivo
GET    /api/leads/pipeline    → conteo por etapa
```

### WhatsApp
```
POST /api/whatsapp/send       → enviar mensaje
POST /api/whatsapp/template   → enviar plantilla aprobada
GET  /api/whatsapp/conversations/:leadId
GET  /api/whatsapp/webhook    → verificación Meta
POST /api/whatsapp/webhook    → mensajes entrantes (Meta)
```

### Email
```
POST /api/email/send          → enviar email individual
POST /api/email/bulk          → envío masivo
GET  /api/email/templates     → plantillas disponibles
```

### Agentes IA
```
POST /api/agents/draft-email  → generar borrador con IA
POST /api/agents/rescore/:id  → re-puntuar lead
```

### Reportes
```
GET /api/reports/dashboard    → KPIs y stats
GET /api/reports/team         → performance del equipo (admin)
GET /api/reports/ai-insights  → análisis IA del pipeline
GET /api/reports/export       → descarga CSV
```

### Webhooks (externos)
```
GET  /api/webhooks/meta       → verificación Meta
POST /api/webhooks/meta       → leads de Facebook Ads
POST /api/webhooks/generic    → cualquier fuente (Zapier/n8n)
POST /api/webhooks/linkedin   → leads de LinkedIn
```

---

## 🛠 Stack Tecnológico

**Backend:**
- Node.js + Express
- MongoDB + Mongoose
- Socket.io (tiempo real)
- JWT + bcrypt (auth)
- Nodemailer (email)
- Axios (Meta API, OpenAI)
- node-cron (jobs automáticos)
- OpenAI SDK (agentes IA)

**Frontend (incluido en HTML preview):**
- React 18
- Recharts (gráficas)
- Socket.io-client (notificaciones tiempo real)

**Integraciones:**
- Meta WhatsApp Business Cloud API
- Meta Facebook Lead Ads
- OpenAI GPT-4o
- SMTP (Gmail/Outlook)
- LinkedIn vía Zapier/Make
- Generic webhook para n8n, Make, Zapier

---

## 📞 Contacto ACON
Sarahi Noriega · 314 123 6953
sarahi.noriega@aconinternacional.com
aconinternacional.com
