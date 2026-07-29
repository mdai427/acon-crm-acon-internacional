// ============================================
// Validación del entorno al arrancar
// ============================================
//
// Un despliegue con secretos débiles o ausentes arrancaba igual y fallaba de
// formas silenciosas: HMAC calculados con clave vacía, configuración cifrada
// con el mismo secreto que firma las sesiones, tokens firmados con una clave
// adivinable. Es mejor no arrancar que arrancar inseguro.

const crypto = require('crypto');

// 32 caracteres hex = 16 bytes de entropía. Es el mínimo razonable para HS256;
// el .env.example sugiere `openssl rand -hex 32` (64 caracteres).
const MIN_SECRET_LENGTH = 32;

// Valores del .env.example: si alguien despliega sin cambiarlos, el secreto es
// público.
const PLACEHOLDER = /^CAMBIAME/i;

function checkSecret(name, value, errors, { required = true } = {}) {
  if (!value) {
    if (required) errors.push(`${name} no está definida`);
    return;
  }
  if (PLACEHOLDER.test(value)) {
    errors.push(`${name} sigue con el valor de ejemplo — genera uno real con "openssl rand -hex 32"`);
    return;
  }
  if (value.length < MIN_SECRET_LENGTH) {
    errors.push(`${name} es demasiado corta (${value.length} caracteres, mínimo ${MIN_SECRET_LENGTH})`);
  }
}

/**
 * Comprueba los secretos críticos. Lanza si algo impide operar de forma segura.
 * @param {{ exitOnFailure?: boolean }} options
 */
function validateEnv({ exitOnFailure = true } = {}) {
  const errors = [];
  const warnings = [];

  checkSecret('JWT_SECRET', process.env.JWT_SECRET, errors);

  // ENCRYPTION_KEY cifra las credenciales de las integraciones. Antes caía a
  // JWT_SECRET: rotar el secreto de sesión dejaba ilegible toda la
  // configuración guardada, y una filtración comprometía las dos cosas.
  checkSecret('ENCRYPTION_KEY', process.env.ENCRYPTION_KEY, errors);
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY === process.env.JWT_SECRET) {
    errors.push('ENCRYPTION_KEY y JWT_SECRET son iguales: usa dos claves distintas');
  }

  if (!process.env.MONGODB_URI) errors.push('MONGODB_URI no está definida');

  // Opcionales, pero si están mal configuradas hay funciones que fallan en
  // silencio, así que se avisa sin bloquear el arranque.
  if (!process.env.WEBHOOK_API_KEY) {
    warnings.push('WEBHOOK_API_KEY sin definir: los webhooks de ingesta (Zapier/Make/n8n) responderán 503');
  }
  if (!process.env.RESEND_WEBHOOK_SECRET && process.env.RESEND_API_KEY) {
    warnings.push('RESEND_WEBHOOK_SECRET sin definir: no se aceptará correo entrante ni eventos de entrega');
  }
  if (process.env.ADMIN_FORCE_UPDATE === 'true') {
    warnings.push('ADMIN_FORCE_UPDATE=true: la contraseña del admin se reescribe con la del entorno en cada despliegue');
  }

  for (const warning of warnings) console.warn(`⚠️  ${warning}`);

  if (errors.length) {
    console.error('\n❌ Configuración insegura — el servidor no va a arrancar:\n');
    for (const error of errors) console.error(`   • ${error}`);

    // Un mensaje que solo dice "revisa .env.example" deja el servicio caído sin
    // explicar cómo salir de ahí. Aquí van los valores listos para pegar.
    console.error('\n   Genera los que falten y ponlos en las variables de entorno:\n');
    for (const name of ['JWT_SECRET', 'ENCRYPTION_KEY', 'WEBHOOK_API_KEY']) {
      if (errors.some(e => e.startsWith(name)) || (name === 'WEBHOOK_API_KEY' && !process.env[name])) {
        console.error(`     ${name}=${crypto.randomBytes(32).toString('hex')}`);
      }
    }
    console.error('\n   Ojo al cambiar ENCRYPTION_KEY en una instalación que ya funcionaba:');
    console.error('   las credenciales de integraciones guardadas se descifran con la clave');
    console.error('   anterior y se migran solas al primer arranque. No borres JWT_SECRET.\n');

    if (exitOnFailure) process.exit(1);
    throw new Error(errors.join('; '));
  }

  return { warnings };
}

module.exports = { validateEnv, MIN_SECRET_LENGTH };
