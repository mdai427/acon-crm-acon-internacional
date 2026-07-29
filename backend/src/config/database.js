const mongoose = require('mongoose');

// Crea el admin inicial desde ADMIN_EMAIL/ADMIN_PASSWORD si aún no existe ninguno.
// Con ADMIN_FORCE_UPDATE=true, crea o actualiza (nombre y clave) el admin con ese email.
const seedAdmin = async () => {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, ADMIN_FORCE_UPDATE } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;

  const User = require('../models/User');

  // Se avisa si la contraseña del entorno no cumple la política, pero NO se
  // bloquea la siembra: dejar al administrador fuera de su propio CRM es peor
  // que una contraseña floja, y un fallo aquí antes pasaba desapercibido en un
  // log mientras el login rechazaba credenciales que "deberían" funcionar.
  const { validatePassword } = require('../utils/passwordPolicy');
  const check = validatePassword(ADMIN_PASSWORD, { email: ADMIN_EMAIL, name: ADMIN_NAME });
  if (!check.ok) {
    console.warn(`\n⚠️  ADMIN_PASSWORD no cumple la política: ${check.message}`);
    console.warn('   La cuenta se crea igualmente, pero cámbiala desde el CRM en cuanto entres.\n');
  }
  const forceUpdate = String(ADMIN_FORCE_UPDATE).toLowerCase() === 'true';

  const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() }).select('+password');
  if (existing) {
    if (!forceUpdate) return;
    existing.name = ADMIN_NAME || existing.name;
    existing.password = ADMIN_PASSWORD; // el pre('save') lo hashea
    existing.role = 'admin';
    await existing.save();
    console.log(`✅ Admin actualizado desde env (ADMIN_FORCE_UPDATE): ${ADMIN_EMAIL}`);
    return;
  }

  const count = await User.countDocuments({ role: 'admin' });
  if (count > 0 && !forceUpdate) return;

  await User.create({
    name: ADMIN_NAME || 'Administrador',
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: 'admin',
  });
  console.log(`✅ Admin inicial creado desde env: ${ADMIN_EMAIL}`);
};

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/acon_crm', {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`✅ MongoDB conectado: ${conn.connection.host}`);
      // Un fallo aquí deja a alguien sin poder entrar: se registra de forma
    // visible, con el motivo concreto, no como una línea más del arranque.
    await seedAdmin().catch(err => {
      console.error('\n❌ NO SE PUDO CREAR NI ACTUALIZAR EL ADMIN INICIAL');
      console.error(`   Motivo: ${err.message}`);
      console.error('   Revisa ADMIN_EMAIL y ADMIN_PASSWORD. Si ya no puedes entrar,');
      console.error('   usa: node src/scripts/resetPassword.js <correo> <contraseña-nueva>\n');
    });

    // Cuenta del dueño de la plataforma, definida en el entorno
    await require('../services/superAdmin').ensureSuperAdmin()
      .catch(err => console.error(`⚠️ No se pudo preparar el super admin: ${err.message}`));

    // Carga la configuración de integraciones guardada desde el panel
    await require('../services/settingsService').hydrateEnv()
      .catch(err => console.error(`⚠️ No se pudo cargar la configuración guardada: ${err.message}`));
  } catch (error) {
    console.error(`❌ Error MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
