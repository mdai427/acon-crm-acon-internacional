// ============================================
// Política de contraseñas
// ============================================
//
// El mínimo anterior eran 6 caracteres sin más requisitos. Con bcrypt de coste
// 12 y 10 intentos cada 15 minutos, una contraseña de 6 caracteres se adivina
// igual si es común: el límite de intentos no protege contra "123456".
//
// El criterio es longitud primero (es lo que más entropía aporta) y rechazo de
// las contraseñas que aparecen en todas las listas de filtraciones.

const MIN_LENGTH = 12;

// No es una lista exhaustiva —eso requiere un servicio como HIBP— pero cubre
// las que realmente se prueban primero en un ataque.
const COMMON = new Set([
  '123456', '123456789', '12345678', 'password', 'contraseña', 'qwerty',
  'abc123', '111111', '123123', 'admin', 'administrador', 'letmein',
  'welcome', 'bienvenido', 'iloveyou', 'monkey', 'dragon', 'football',
  'password1', 'password123', 'qwerty123', 'acon123', 'acon2024', 'acon2025',
]);

/**
 * @param {string} password
 * @param {{ email?: string, name?: string }} context datos del usuario, para
 *        rechazar contraseñas derivadas de su propio nombre o correo
 * @returns {{ ok: boolean, message?: string }}
 */
function validatePassword(password, context = {}) {
  const value = String(password || '');

  if (value.length < MIN_LENGTH) {
    return { ok: false, message: `La contraseña debe tener al menos ${MIN_LENGTH} caracteres` };
  }
  if (value.length > 200) {
    return { ok: false, message: 'La contraseña es demasiado larga (máximo 200 caracteres)' };
  }

  const lower = value.toLowerCase();
  // Se comprueba también la raíz sin dígitos ni signos al final: "password1234"
  // y "Qwerty!!" son la misma contraseña de siempre con adorno.
  const root = lower.replace(/[0-9!@#$%^&*._-]+$/, '');
  if (COMMON.has(lower) || COMMON.has(root)) {
    return { ok: false, message: 'Esa contraseña es de las más usadas: elige otra' };
  }

  // Una contraseña de un solo carácter repetido pasa el mínimo de longitud
  // pero no aporta nada.
  if (new Set(value).size < 5) {
    return { ok: false, message: 'La contraseña tiene muy poca variedad de caracteres' };
  }

  const localPart = String(context.email || '').split('@')[0].toLowerCase();
  if (localPart.length >= 4 && lower.includes(localPart)) {
    return { ok: false, message: 'La contraseña no puede contener tu correo' };
  }
  const name = String(context.name || '').toLowerCase().trim();
  if (name.length >= 4 && lower.includes(name)) {
    return { ok: false, message: 'La contraseña no puede contener tu nombre' };
  }

  return { ok: true };
}

module.exports = { validatePassword, MIN_LENGTH };
