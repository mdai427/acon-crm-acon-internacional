const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth, adminOnly } = require('../middleware/auth');
const { audit } = require('../services/auditService');
const authCookie = require('../services/authCookie');
const { validatePassword } = require('../utils/passwordPolicy');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email y contraseña requeridos' });
    }

    const user = await User.findOne({ email: String(email).toLowerCase().trim(), isActive: true });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
    }

    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });
    audit({ req, action: 'login', entity: 'User', entityId: user._id, entityLabel: user.email }).catch(() => {});

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // El token va en una cookie httpOnly (inaccesible al JavaScript de la
    // página) y además en el cuerpo, para los clientes que no son navegador.
    const csrfToken = authCookie.issue(res, token);

    res.json({
      success: true,
      token,
      csrfToken,
      user: user.toJSON()
    });
  } catch (error) {
    console.error("[auth]", error);
    res.status(500).json({ success: false, message: "Error interno. Intenta de nuevo." });
  }
});

// POST /api/auth/register (solo admin puede crear usuarios)
router.post('/register', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;

    const check = validatePassword(password, { email, name });
    if (!check.ok) return res.status(400).json({ success: false, message: check.message });

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ success: false, message: 'El email ya está registrado' });
    }

    const user = await User.create({ name, email, password, role, phone });
    res.status(201).json({ success: true, user });
  } catch (error) {
    console.error("[auth]", error);
    res.status(500).json({ success: false, message: "Error interno. Intenta de nuevo." });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  res.json({ success: true, user: req.user });
});

// PUT /api/auth/profile
router.put('/profile', auth, async (req, res) => {
  try {
    const allowed = ['name', 'phone', 'avatar', 'notifications'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.json({ success: true, user });
  } catch (error) {
    console.error("[auth]", error);
    res.status(500).json({ success: false, message: "Error interno. Intenta de nuevo." });
  }
});

// PUT /api/auth/change-password
router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    if (!(await user.comparePassword(currentPassword))) {
      return res.status(400).json({ success: false, message: 'Contraseña actual incorrecta' });
    }

    const check = validatePassword(newPassword, { email: user.email, name: user.name });
    if (!check.ok) return res.status(400).json({ success: false, message: check.message });
    
    user.password = newPassword;
    // Cierra las sesiones abiertas en otros dispositivos: si alguien robó el
    // token, cambiar la contraseña tiene que dejarlo fuera.
    user.sessionsValidFrom = new Date();
    await user.save();

    // El token actual también queda invalidado, así que se emite uno nuevo para
    // no echar de la sesión a quien acaba de cambiar su propia contraseña.
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    const csrfToken = authCookie.issue(res, token);
    res.json({ success: true, message: 'Contraseña actualizada', token, csrfToken });
  } catch (error) {
    console.error("[auth]", error);
    res.status(500).json({ success: false, message: "Error interno. Intenta de nuevo." });
  }
});

// POST /api/auth/logout — borra la cookie de sesión.
// Con el token en localStorage bastaba con que el frontend lo olvidara; con
// cookie httpOnly solo el servidor puede eliminarla.
router.post('/logout', (req, res) => {
  authCookie.clear(res);
  res.json({ success: true, message: 'Sesión cerrada' });
});

// POST /api/auth/setup — crea el primer admin si no existe ninguno (solo funciona una vez)
router.post('/setup', async (req, res) => {
  try {
    const count = await User.countDocuments({ role: 'admin' });
    if (count > 0) {
      return res.status(403).json({ success: false, message: 'Ya existe un administrador. Usa /login.' });
    }

    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'name, email y password requeridos' });
    }

    const check = validatePassword(password, { email, name });
    if (!check.ok) return res.status(400).json({ success: false, message: check.message });

    const admin = await User.create({ name, email, password, role: 'admin' });

    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    console.log(`✅ Admin inicial creado: ${email}`);
    const csrfToken = authCookie.issue(res, token);
    res.status(201).json({ success: true, token, csrfToken, user: admin.toJSON() });
  } catch (error) {
    console.error("[auth]", error);
    res.status(500).json({ success: false, message: "Error interno. Intenta de nuevo." });
  }
});

module.exports = router;
