const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { can } = require('../config/permissions');
const authCookie = require('../services/authCookie');

const auth = async (req, res, next) => {
  try {
    // La sesión viaja en una cookie httpOnly; se acepta también la cabecera
    // Authorization para clientes que no son el navegador (scripts, n8n).
    const token = authCookie.readToken(req);
    if (!token) return res.status(401).json({ success: false, message: 'Sin token de autenticación' });

    // Con cookie, el navegador la manda sola: hace falta el token CSRF para
    // distinguir una petición de nuestra propia página de una provocada por
    // otro sitio.
    if (authCookie.needsCsrfCheck(req) && !authCookie.csrfIsValid(req)) {
      return res.status(403).json({ success: false, message: 'Token CSRF ausente o inválido', code: 'CSRF' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Usuario no válido o inactivo' });
    }

    // Sesiones revocadas: el token se emitió antes del último cambio de
    // contraseña o de rol. `iat` viene en segundos.
    if (user.sessionsValidFrom && decoded.iat * 1000 < new Date(user.sessionsValidFrom).getTime()) {
      return res.status(401).json({ success: false, message: 'Sesión expirada, vuelve a iniciar sesión' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token inválido' });
  }
};

// Solo admin
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Acceso restringido a administradores' });
  }
  next();
};

// Admin o gerencia/dirección
const managerOnly = (req, res, next) => {
  if (!['admin', 'direccion', 'gerencia'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Acceso restringido a gerencia' });
  }
  next();
};

// Permiso granular: checkPerm('leads.view')
const checkPerm = (perm) => (req, res, next) => {
  if (!can(req.user?.role, perm)) {
    return res.status(403).json({ success: false, message: `Sin permiso: ${perm}`, required: perm });
  }
  next();
};

module.exports = { auth, adminOnly, managerOnly, checkPerm };
