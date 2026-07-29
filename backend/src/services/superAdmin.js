// ============================================
// Cuenta de super admin (dueño de la plataforma)
// ============================================
//
// Sus credenciales viven en el entorno, no en el panel: quien administra el CRM
// no debe poder crear ni editar esta cuenta, porque es la que ve el costo real
// de la IA y define el margen de reventa.
//
//   SUPERADMIN_EMAIL=owner@tuempresa.com
//   SUPERADMIN_PASSWORD=una-contraseña-larga
//   SUPERADMIN_NAME=Super Admin        (opcional)
//
// Al arrancar se crea o se actualiza el usuario con ese correo y rol
// 'superadmin'. Si cambias la contraseña en el entorno, en el siguiente
// arranque queda sincronizada.

const User = require('../models/User');

async function ensureSuperAdmin() {
  const email = String(process.env.SUPERADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!email || !password) {
    console.log('ℹ️  Super admin no configurado (define SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD)');
    return null;
  }
  if (String(password).length < 8) {
    console.error('⚠️  SUPERADMIN_PASSWORD demasiado corta (mínimo 8 caracteres): cuenta no creada');
    return null;
  }

  const name = process.env.SUPERADMIN_NAME || 'Super Admin';
  const existing = await User.findOne({ email });

  if (!existing) {
    // El hash lo aplica el pre-save del modelo.
    const created = await User.create({ name, email, password, role: 'superadmin', isActive: true });
    console.log(`👑 Super admin creado: ${email}`);
    return created;
  }

  // Cuenta ya existente: se fuerza el rol y se sincroniza la contraseña del
  // entorno, que es la fuente de verdad.
  existing.role = 'superadmin';
  existing.isActive = true;
  existing.name = name;
  if (!(await existing.comparePassword(password))) {
    existing.password = password;
    console.log(`👑 Super admin: contraseña sincronizada desde el entorno (${email})`);
  }
  await existing.save();
  return existing;
}

// Middleware: solo el dueño de la plataforma.
const superAdminOnly = (req, res, next) => {
  if (req.user?.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: 'Acceso restringido al super administrador' });
  }
  next();
};

module.exports = { ensureSuperAdmin, superAdminOnly };
