const mongoose = require('mongoose');

// Crea el admin inicial desde ADMIN_EMAIL/ADMIN_PASSWORD si aún no existe ninguno.
// Con ADMIN_FORCE_UPDATE=true, crea o actualiza (nombre y clave) el admin con ese email.
const seedAdmin = async () => {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, ADMIN_FORCE_UPDATE } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;

  const User = require('../models/User');
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
    await seedAdmin().catch(err => console.error(`⚠️ No se pudo crear el admin inicial: ${err.message}`));
  } catch (error) {
    console.error(`❌ Error MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
