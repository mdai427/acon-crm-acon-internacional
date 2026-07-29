// Prueba de autorización por rol contra el router real, sin base de datos:
// se sustituye el middleware de auth por uno que inyecta el rol a probar.
const express = require('express');
const request = { };

const ROLES = ['admin','direccion','gerencia','executive','operaciones','marketing','finanzas','viewer'];

// Sustituir middleware/auth.auth antes de cargar las rutas
const authModule = require('./middleware/auth');
let CURRENT_ROLE = 'viewer';
const realAuth = authModule.auth;
authModule.auth = (req, res, next) => {
  req.user = { _id: '507f1f77bcf86cd799439011', role: CURRENT_ROLE, email: 'x@y.z', name: 'Prueba' };
  next();
};

const app = express();
app.use(express.json());
app.use('/api/marketing', require('./routes/marketing'));
app.use('/api/commissions', require('./routes/commissions'));
app.use('/api/quotes', require('./routes/quotes'));
app.use('/api/email', require('./routes/email'));
app.use('/api/audit', require('./routes/audit'));

const CASES = [
  ['POST', '/api/marketing/campaigns/507f1f77bcf86cd799439011/launch', 'lanzar campaña masiva'],
  ['PUT',  '/api/commissions/507f1f77bcf86cd799439011',                'marcar comisión pagada'],
  ['PUT',  '/api/quotes/507f1f77bcf86cd799439011',                     'editar cotización'],
  ['POST', '/api/email/suppressions',                                  'bloquear un correo'],
  ['GET',  '/api/audit',                                               'ver auditoría'],
];

const server = app.listen(0, async () => {
  const port = server.address().port;
  console.log('acción'.padEnd(28) + ROLES.map(r => r.slice(0,6).padEnd(7)).join(''));
  console.log('-'.repeat(28 + ROLES.length * 7));
  for (const [method, path, label] of CASES) {
    const cells = [];
    for (const role of ROLES) {
      CURRENT_ROLE = role;
      const res = await fetch(`http://localhost:${port}${path}`, {
        method, headers: { 'content-type': 'application/json' },
        body: method === 'GET' ? undefined : '{}',
      });
      // 403 = bloqueado por permisos. Cualquier otro código = pasó el control
      // (y falla más adelante por no haber base de datos, que es lo esperado).
      cells.push((res.status === 403 ? '  ⛔' : '  ✅').padEnd(7));
    }
    console.log(label.padEnd(28) + cells.join(''));
  }
  server.close();
});
