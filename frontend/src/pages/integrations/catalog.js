import {
  Mail, MessageSquare, Bot, Users, Globe, Zap, HardDrive, TrendingUp, Send,
} from 'lucide-react';
import { testWhatsApp, testEmail, testOpenAI, testResend } from '../../services/api';

// ── Catálogo de integraciones ─────────────────────────────────────────────────
// Cada campo se guarda cifrado en la base de datos (AES-256-GCM). Los marcados
// como `secret` nunca se devuelven completos desde el servidor: el panel solo
// recibe una pista del valor guardado.
//
// Cada integración tiene su propia pantalla: la lista solo muestra tarjetas y el
// formulario vive en /integrations/<id>.
const askRecipient = (label) => async (test) => {
  const to = window.prompt(`¿A qué dirección enviamos el correo de prueba con ${label}?`);
  if (!to) return null;
  return test({ testTo: to });
};

export const CATALOG = [
  {
    section: 'Comunicación',
    subtitle: 'Canales por los que el equipo habla con los clientes',
    items: [
      {
        id: 'whatsapp',
        name: 'WhatsApp Business',
        desc: 'Enviar y recibir mensajes desde el CRM (Meta Cloud API)',
        icon: MessageSquare, color: '#25D366',
        docs: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
        webhook: '/api/whatsapp/webhook',
        required: ['META_WA_TOKEN', 'META_WA_PHONE_ID'],
        test: testWhatsApp,
        fields: [
          { key: 'META_WA_TOKEN', label: 'Access Token permanente', secret: true,
            help: 'Meta for Developers → tu app → WhatsApp → Configuración de la API' },
          { key: 'META_WA_PHONE_ID', label: 'Phone Number ID',
            help: 'El identificador del número, no el número de teléfono' },
          { key: 'META_WA_VERIFY_TOKEN', label: 'Verify Token del webhook',
            help: 'Invéntalo tú y pega exactamente el mismo en Meta' },
          { key: 'META_APP_SECRET', label: 'App Secret', secret: true,
            help: 'Valida la firma de los mensajes entrantes' },
        ],
      },
      {
        id: 'resend',
        name: 'Resend',
        desc: 'Correo saliente por API HTTP, sin depender de puertos SMTP',
        icon: Send, color: '#000000',
        docs: 'https://resend.com/docs/introduction',
        required: ['RESEND_API_KEY', 'RESEND_FROM'],
        test: () => askRecipient('Resend')(testResend),
        fields: [
          { key: 'RESEND_API_KEY', label: 'API Key', secret: true, placeholder: 're_...',
            help: 'resend.com → API Keys. Necesita permiso de envío' },
          { key: 'RESEND_FROM', label: 'Remitente', placeholder: 'ACON Internacional <ventas@aconinternacional.com>',
            help: 'El dominio del remitente debe estar verificado en Resend' },
          { key: 'EMAIL_PROVIDER', label: 'Proveedor de correo saliente', type: 'select',
            options: [{ v: 'resend', l: 'Resend (API)' }, { v: 'smtp', l: 'SMTP' }],
            help: 'Define por dónde salen todos los correos del CRM. Si lo dejas vacío se usa Resend cuando hay API Key' },
        ],
      },
      {
        id: 'email',
        name: 'Correo saliente (SMTP)',
        desc: 'Envío de correos, plantillas y notificaciones al equipo',
        icon: Mail, color: '#EA4335',
        required: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'],
        test: () => askRecipient('SMTP')(testEmail),
        fields: [
          { key: 'SMTP_HOST', label: 'Servidor SMTP', placeholder: 'smtp.gmail.com' },
          { key: 'SMTP_PORT', label: 'Puerto', placeholder: '587' },
          { key: 'SMTP_SECURE', label: 'Conexión SSL directa', type: 'select',
            options: [{ v: 'false', l: 'No (STARTTLS, puerto 587)' }, { v: 'true', l: 'Sí (SSL, puerto 465)' }] },
          { key: 'SMTP_USER', label: 'Usuario', placeholder: 'ventas@acon.com' },
          { key: 'SMTP_PASS', label: 'Contraseña', secret: true,
            help: 'En Gmail usa una contraseña de aplicación, no la del correo' },
          { key: 'EMAIL_FROM', label: 'Remitente visible', placeholder: 'ACON Internacional <ventas@acon.com>' },
        ],
      },
    ],
  },
  {
    section: 'Captación de leads',
    subtitle: 'Fuentes que alimentan el pipeline automáticamente',
    items: [
      {
        id: 'meta',
        name: 'Meta Lead Ads',
        desc: 'Recibe leads de formularios de Facebook e Instagram',
        icon: Users, color: '#1877F2',
        docs: 'https://developers.facebook.com/docs/marketing-api/guides/lead-ads',
        webhook: '/api/webhooks/meta',
        required: ['META_ACCESS_TOKEN', 'META_PAGE_ID'],
        fields: [
          { key: 'META_APP_ID', label: 'App ID' },
          { key: 'META_ACCESS_TOKEN', label: 'Access Token de la página', secret: true },
          { key: 'META_PAGE_ID', label: 'Page ID' },
          { key: 'META_WEBHOOK_VERIFY_TOKEN', label: 'Verify Token del webhook',
            help: 'Invéntalo tú y pégalo igual en la configuración del webhook en Meta' },
        ],
      },
      {
        id: 'linkedin',
        name: 'LinkedIn',
        desc: 'Captura leads de LinkedIn Lead Gen Forms',
        icon: Globe, color: '#0A66C2',
        webhook: '/api/webhooks/linkedin',
        required: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
        fields: [
          { key: 'LINKEDIN_CLIENT_ID', label: 'Client ID' },
          { key: 'LINKEDIN_CLIENT_SECRET', label: 'Client Secret', secret: true },
          { key: 'LINKEDIN_ACCESS_TOKEN', label: 'Access Token', secret: true },
        ],
      },
    ],
  },
  {
    section: 'Inteligencia artificial',
    subtitle: 'Motor de los agentes: scoring, respuestas sugeridas y análisis',
    items: [
      {
        id: 'openai',
        name: 'OpenAI',
        desc: 'Califica leads, redacta respuestas y analiza el pipeline',
        icon: Bot, color: '#10A37F',
        docs: 'https://platform.openai.com/api-keys',
        required: ['OPENAI_API_KEY'],
        test: testOpenAI,
        fields: [
          { key: 'OPENAI_API_KEY', label: 'API Key', secret: true, placeholder: 'sk-...' },
          { key: 'OPENAI_MODEL', label: 'Modelo', placeholder: 'gpt-4o-mini',
            help: 'gpt-4o-mini es el más económico; gpt-4o da mejores análisis' },
        ],
      },
    ],
  },
  {
    section: 'Google Workspace',
    subtitle: 'Credenciales de la app; cada usuario conecta su cuenta aparte',
    items: [
      {
        id: 'google',
        name: 'Google (Gmail y Calendar)',
        desc: 'Permite que el equipo vincule su correo y agenda al CRM',
        icon: Mail, color: '#4285F4',
        docs: 'https://console.cloud.google.com/apis/credentials',
        required: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
        fields: [
          { key: 'GOOGLE_CLIENT_ID', label: 'Client ID' },
          { key: 'GOOGLE_CLIENT_SECRET', label: 'Client Secret', secret: true },
          { key: 'GOOGLE_REDIRECT_URI', label: 'URI de redirección autorizada',
            help: 'Debe coincidir carácter por carácter con la registrada en Google Cloud' },
        ],
      },
    ],
  },
  {
    section: 'Almacenamiento y datos',
    subtitle: 'Archivos adjuntos y tipo de cambio',
    items: [
      {
        id: 's3',
        name: 'Amazon S3',
        desc: 'Guarda documentos de operaciones (BL, pedimentos, facturas)',
        icon: HardDrive, color: '#FF9900',
        required: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET'],
        fields: [
          { key: 'AWS_ACCESS_KEY_ID', label: 'Access Key ID' },
          { key: 'AWS_SECRET_ACCESS_KEY', label: 'Secret Access Key', secret: true },
          { key: 'AWS_REGION', label: 'Región', placeholder: 'us-east-1' },
          { key: 'S3_BUCKET', label: 'Nombre del bucket' },
        ],
      },
      {
        id: 'banxico',
        name: 'Banxico (tipo de cambio)',
        desc: 'Tipo de cambio USD/MXN oficial para cotizaciones',
        icon: TrendingUp, color: '#006341',
        docs: 'https://www.banxico.org.mx/SieAPIRest/service/v1/token',
        required: ['BANXICO_TOKEN'],
        fields: [
          { key: 'BANXICO_TOKEN', label: 'Token de la API SIE', secret: true,
            help: 'Gratuito: se solicita en el portal de Banxico' },
          { key: 'DEFAULT_EXCHANGE_RATE', label: 'Tipo de cambio de respaldo', placeholder: '17.50',
            help: 'Se usa solo si la API no responde' },
        ],
      },
    ],
  },
  {
    section: 'Automatización',
    subtitle: 'Conexión con Zapier, Make y n8n',
    items: [
      {
        id: 'automation',
        name: 'Webhook genérico y n8n',
        desc: 'Recibe leads de cualquier plataforma externa',
        icon: Zap, color: '#FF4F00',
        webhook: '/api/webhooks/generic',
        required: ['WEBHOOK_API_KEY'],
        fields: [
          { key: 'WEBHOOK_API_KEY', label: 'API Key del webhook genérico', secret: true,
            help: 'Se envía en la cabecera x-api-key de cada petición entrante' },
          { key: 'N8N_API_KEY', label: 'API Key de n8n', secret: true },
        ],
      },
    ],
  },
];

export const ALL_INTEGRATIONS = CATALOG.flatMap(group =>
  group.items.map(item => ({ ...item, section: group.section }))
);

export const findIntegration = (id) => ALL_INTEGRATIONS.find(i => i.id === id) || null;

// El backend ya devuelve los webhooks como URL completa; solo se antepone la base
// de la API cuando llega una ruta relativa (evita duplicar el dominio).
const API_BASE = (process.env.REACT_APP_API_URL || window.location.origin).replace(/\/+$/, '');
export const absoluteUrl = (url) =>
  /^https?:\/\//i.test(url) ? url : `${API_BASE}/${String(url).replace(/^\/+/, '')}`;
