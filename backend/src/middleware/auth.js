const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { can } = require('../config/permissions');

const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Sin token de autenticación' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Usuario no válido o inactivo' });
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
