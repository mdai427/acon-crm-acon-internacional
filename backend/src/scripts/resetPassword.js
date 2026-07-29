#!/usr/bin/env node
// ============================================
// Recuperación de acceso
// ============================================
//
//   node src/scripts/resetPassword.js <correo> <contraseña-nueva>
//
// Se ejecuta en el servidor, con acceso al entorno y a la base. Reactiva la
// cuenta si estaba desactivada y revoca las sesiones abiertas.
//
// No aplica la política de contraseñas: es la vía de rescate, y si el problema
// fue precisamente una contraseña rechazada, exigirla otra vez dejaría a la
// persona fuera. Elige una buena de todos modos.

require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const [email, password] = process.argv.slice(2);

  if (!email || !password) {
    console.error('Uso: node src/scripts/resetPassword.js <correo> <contraseña-nueva>');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Falta MONGODB_URI en el entorno');
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const User = require('../models/User');

  const user = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (!user) {
    console.error(`No existe ningún usuario con el correo ${email}`);
    const total = await User.countDocuments();
    if (total) {
      const list = await User.find().select('email role isActive').lean();
      console.error('\nUsuarios registrados:');
      for (const u of list) console.error(`  ${u.email}  (${u.role}${u.isActive ? '' : ', desactivado'})`);
    } else {
      console.error('La base no tiene ningún usuario: define ADMIN_EMAIL y ADMIN_PASSWORD y reinicia.');
    }
    await mongoose.disconnect();
    process.exit(1);
  }

  user.password = password;          // el pre('save') del modelo lo hashea
  user.isActive = true;
  user.sessionsValidFrom = new Date(); // cierra las sesiones abiertas
  await user.save();

  console.log(`✅ Contraseña actualizada para ${user.email} (rol: ${user.role})`);
  console.log('   Las sesiones abiertas quedaron cerradas.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌ Error:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
