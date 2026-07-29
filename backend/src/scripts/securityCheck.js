#!/usr/bin/env node
// ============================================
// Comprobación de seguridad contra una instancia en marcha
// ============================================
//
//   API_URL=http://localhost:5000 ADMIN_EMAIL=... ADMIN_PASSWORD=... \
//     node src/scripts/securityCheck.js
//
// Verifica de verdad —por HTTP, no leyendo el código— que siguen en pie los
// controles que se corrigieron en la revisión de seguridad: falsificación de
// tokens, webhooks sin firma, escalada a superadmin, fuga del JWT_SECRET,
// permisos por rol, revocación de sesión y límite de intentos.
//
// Pensado para correrlo contra un entorno de staging tras cada despliegue. NO
// lo apuntes a producción: crea usuarios de prueba y agota el límite de login.
//
// IMPORTANTE: la última prueba gasta a propósito el límite de intentos de
// login, que se cuenta por IP y vive en memoria. Después de una corrida, los
// logins desde esa misma IP quedan bloqueados ~15 minutos. Para repetir la
// suite, reinicia el backend, o pasa SKIP_RATE_LIMIT=1 para omitir esa prueba.

require('dotenv').config();

const BASE = (process.env.API_URL || 'http://localhost:5000').replace(/\/$/, '');
const API = `${BASE}/api`;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SECRET = process.env.JWT_SECRET;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !SECRET) {
  console.error('Faltan ADMIN_EMAIL, ADMIN_PASSWORD y JWT_SECRET en el entorno');
  process.exit(1);
}

const jwt = require('jsonwebtoken');

let pass = 0, fail = 0;
function check(ok, label, detail = '') {
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}${detail ? ' — ' + detail : ''}`);
  ok ? pass++ : fail++;
}

async function req(path, { method = 'GET', token, body, headers = {} } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

(async () => {
  console.log('\n── Autenticación ──');
  const login = await req('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  check(login.status === 200 && login.json?.token, 'login válido devuelve token');
  const adminToken = login.json?.token;

  check((await req('/leads')).status === 401, 'sin token → 401');
  check((await req('/leads', { token: 'basura' })).status === 401, 'token corrupto → 401');

  // Token firmado con otro secreto (intento de falsificación)
  const forged = jwt.sign({ id: '507f1f77bcf86cd799439011', role: 'admin' }, 'secreto-del-atacante');
  check((await req('/leads', { token: forged })).status === 401, 'token firmado con otra clave → 401');

  // Algoritmo "none"
  const noneToken = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    + '.' + Buffer.from(JSON.stringify({ id: '507f1f77bcf86cd799439011', role: 'admin' })).toString('base64url') + '.';
  check((await req('/leads', { token: noneToken })).status === 401, 'algoritmo "none" → 401');

  // Token bien firmado pero de un usuario inexistente
  const ghost = jwt.sign({ id: '507f1f77bcf86cd799439099', role: 'admin' }, SECRET);
  check((await req('/leads', { token: ghost })).status === 401, 'usuario inexistente → 401');

  // Rol escalado en el token (el servidor debe leer el rol de la base)
  const me = await req('/auth/me', { token: adminToken });
  const adminId = me.json?.user?._id;

  console.log('\n── Sesión en cookie y CSRF ──');
  // Se repite el login leyendo las cabeceras, para inspeccionar las cookies.
  const loginRaw = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const setCookie = loginRaw.headers.getSetCookie ? loginRaw.headers.getSetCookie() : [loginRaw.headers.get('set-cookie') || ''];
  const sesion = setCookie.find(c => c.startsWith('acon_session=')) || '';
  const csrfCookie = setCookie.find(c => c.startsWith('acon_csrf=')) || '';

  check(sesion.includes('HttpOnly'), 'la cookie de sesión es HttpOnly (inaccesible a un XSS)');
  check(!csrfCookie.includes('HttpOnly'), 'la cookie CSRF sí es legible por la página, como debe');

  const cookieHeader = [sesion.split(';')[0], csrfCookie.split(';')[0]].join('; ');
  const csrfValue = csrfCookie.split('=')[1]?.split(';')[0];

  const conCookie = (extra = {}) => ({ Cookie: cookieHeader, ...extra });
  const getConCookie = await fetch(`${API}/auth/me`, { headers: conCookie() });
  check(getConCookie.status === 200, 'la sesión funciona solo con la cookie');

  const sinCsrf = await fetch(`${API}/email/suppressions`, {
    method: 'POST', headers: conCookie({ 'content-type': 'application/json' }),
    body: JSON.stringify({ address: 'csrf@ejemplo.invalid' }),
  });
  check(sinCsrf.status === 403, 'POST con cookie y sin cabecera CSRF → 403 (CSRF bloqueado)');

  const csrfFalso = await fetch(`${API}/email/suppressions`, {
    method: 'POST', headers: conCookie({ 'content-type': 'application/json', 'x-csrf-token': 'inventado' }),
    body: JSON.stringify({ address: 'csrf2@ejemplo.invalid' }),
  });
  check(csrfFalso.status === 403, 'POST con token CSRF falso → 403');

  const conCsrf = await fetch(`${API}/email/suppressions`, {
    method: 'POST', headers: conCookie({ 'content-type': 'application/json', 'x-csrf-token': csrfValue }),
    body: JSON.stringify({ address: `csrf-ok-${Date.now().toString(36)}@ejemplo.invalid` }),
  });
  check(conCsrf.status === 200, 'POST con token CSRF correcto → permitido', `status ${conCsrf.status}`);

  console.log('\n── Inyección NoSQL ──');
  const nosql = await req('/auth/login', { method: 'POST', body: { email: { $ne: null }, password: { $ne: null } } });
  check(nosql.status !== 200, 'login con operadores $ne → rechazado', `status ${nosql.status}`);

  console.log('\n── Webhooks ──');
  check((await req('/webhooks/generic', { method: 'POST', body: { company: 'X' } })).status === 401, 'webhook genérico sin API key → 401');
  check((await req('/webhooks/linkedin', { method: 'POST', body: { company: 'X' } })).status === 401, 'webhook LinkedIn sin API key → 401');
  check((await req('/webhooks/generic', { method: 'POST', body: { company: 'X' }, headers: { 'x-api-key': 'mala' } })).status === 401, 'webhook con API key incorrecta → 401');
  const resendHook = await req('/webhooks/resend', { method: 'POST', body: { type: 'email.received', data: {} } });
  check(resendHook.status === 401, 'webhook de Resend sin firma → 401');

  console.log('\n── Fuga de secretos ──');
  const cfg = await req('/config', { token: adminToken });
  const raw = JSON.stringify(cfg.json || {});
  check(!raw.includes(SECRET.slice(0, 20)), 'la configuración NO expone parte del JWT_SECRET');
  check(!raw.includes('apiKeyHint'), 'apiKeyHint eliminado del payload');

  console.log('\n── Escalada de privilegios ──');
  const promote = await req(`/users/${adminId}`, { method: 'PUT', token: adminToken, body: { role: 'superadmin' } });
  check(promote.status === 403, 'admin no puede promoverse a superadmin', `status ${promote.status}`);
  const createSuper = await req('/users', { method: 'POST', token: adminToken, body: { name: 'X', email: 'x@y.z', password: 'Larga-Contrasena-2026', role: 'superadmin' } });
  check(createSuper.status === 403, 'admin no puede crear un superadmin', `status ${createSuper.status}`);

  console.log('\n── Política de contraseñas ──');
  const weak = await req('/users', { method: 'POST', token: adminToken, body: { name: 'Débil', email: `debil-${Date.now().toString(36)}@ejemplo.invalid`, password: '123456', role: 'executive' } });
  check(weak.status === 400, 'contraseña de 6 caracteres rechazada');
  const common = await req('/users', { method: 'POST', token: adminToken, body: { name: 'Común', email: `comun-${Date.now().toString(36)}@ejemplo.invalid`, password: 'password1234', role: 'executive' } });
  check(common.status === 400, 'contraseña común rechazada');

  console.log('\n── Permisos por rol ──');
  // Correo único por corrida: la suite debe poder repetirse sin limpiar la base.
  const marca = Date.now().toString(36);
  const execEmail = `prueba-seguridad-${marca}@ejemplo.invalid`;
  const exec = await req('/users', { method: 'POST', token: adminToken, body: { name: 'Cuenta Temporal', email: execEmail, password: 'Flete-Maritimo-Xk92', role: 'executive' } });
  check(exec.status === 201, 'usuario ejecutivo creado', `status ${exec.status}`);
  const execLogin = await req('/auth/login', { method: 'POST', body: { email: execEmail, password: 'Flete-Maritimo-Xk92' } });
  const execToken = execLogin.json?.token;

  check((await req('/marketing/campaigns/507f1f77bcf86cd799439011/launch', { method: 'POST', token: execToken })).status === 403, 'ejecutivo NO puede lanzar campañas');
  check((await req('/audit', { token: execToken })).status === 403, 'ejecutivo NO puede ver auditoría');
  check((await req('/config/settings', { token: execToken })).status === 403, 'ejecutivo NO puede leer la configuración');
  check((await req('/users', { method: 'POST', token: execToken, body: { name: 'a', email: 'b@c.d', password: 'Otra-Contrasena-2026' } })).status === 403, 'ejecutivo NO puede crear usuarios');
  check((await req('/leads', { token: execToken })).status === 200, 'ejecutivo SÍ puede ver sus leads');

  console.log('\n── Revocación de sesión ──');
  const execId = exec.json?.data?._id;
  await req(`/users/${execId}`, { method: 'PUT', token: adminToken, body: { role: 'viewer' } });
  const afterDemote = await req('/leads', { token: execToken });
  check(afterDemote.status === 401, 'token viejo inválido tras cambiar el rol', `status ${afterDemote.status}`);

  if (process.env.SKIP_RATE_LIMIT === '1') {
    console.log('\n── Rate limiting ── (omitido por SKIP_RATE_LIMIT=1)');
  } else {
  console.log('\n── Rate limiting ──');
  let limited = false;
  for (let i = 0; i < 15; i++) {
    const r = await req('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: 'contraseña-incorrecta-a-proposito' } });
    if (r.status === 429) { limited = true; break; }
  }
  check(limited, 'el login se bloquea tras varios intentos fallidos');
  }

  // La cuenta temporal queda desactivada, no borrada: así se conserva su
  // rastro en la auditoría.
  if (execId) await req(`/users/${execId}`, { method: 'DELETE', token: adminToken });

  console.log(`\n${'─'.repeat(50)}\nResultado: ${pass} correctas, ${fail} fallidas\n`);
  process.exit(fail ? 1 : 0);
})();
