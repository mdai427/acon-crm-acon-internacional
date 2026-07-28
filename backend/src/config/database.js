const mongoose = require('mongoose');

// Crea el admin inicial desde ADMIN_EMAIL/ADMIN_PASSWORD si aún no existe ninguno.
const seedAdmin = async () => {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;

  const User = require('../models/User');
  const count = await User.countDocuments({ role: 'admin' });
  if (count > 0) return;

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
