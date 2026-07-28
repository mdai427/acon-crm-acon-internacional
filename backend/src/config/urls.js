// URLs públicas del sistema, normalizadas desde el .env.
//
// Se les quita la barra final y los espacios porque estas URLs se concatenan con
// rutas (`${FRONTEND_URL}/marketing`): con barra final saldría "//", que además de
// verse mal rompe los redirect_uri de Google/Meta/LinkedIn, que exigen coincidencia
// exacta con lo registrado en sus consolas.

const clean = (url) => (url || '').trim().replace(/\/+$/, '');

const PORT = process.env.PORT || 5001;

const FRONTEND_URL = clean(process.env.FRONTEND_URL) || 'http://localhost:3000';

// Dónde vive la API de cara al exterior: es la base de los webhooks y callbacks.
const BACKEND_URL =
  clean(process.env.BACKEND_URL) ||
  clean(process.env.PUBLIC_BASE_URL) ||
  `http://localhost:${PORT}`;

const PUBLIC_BASE_URL = clean(process.env.PUBLIC_BASE_URL) || BACKEND_URL;

const isLocalhost = /localhost|127\.0\.0\.1/.test(PUBLIC_BASE_URL);

module.exports = { FRONTEND_URL, BACKEND_URL, PUBLIC_BASE_URL, isLocalhost, clean };
