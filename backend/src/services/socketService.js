const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const User = require('../models/User');
const Lead = require('../models/Lead');
const { can } = require('../config/permissions');

// Un ejecutivo solo entra a la sala de sus propios leads. Sin esta comprobación
// el socket era una puerta lateral que saltaba el control que la API REST sí
// aplica: bastaba emitir join_lead con un id ajeno para recibir en tiempo real
// los WhatsApp, llamadas y correos de otro asesor.
async function canWatchLead(user, leadId) {
  if (!can(user.role, 'leads.view')) return false;
  if (user.role !== 'executive') return true;

  const lead = await Lead.findById(leadId).select('assignedTo').lean();
  return !!lead && String(lead.assignedTo) === String(user._id);
}

const setupSocketHandlers = (io) => {
  // Middleware de autenticación para sockets
  io.use(async (socket, next) => {
    // Con la sesión en cookie httpOnly el cliente ya no puede leer el token
    // para pasarlo en `auth`: el navegador manda la cookie sola en el
    // handshake. Se sigue aceptando `auth.token` para clientes que no son
    // navegador.
    const cookies = socket.handshake.headers?.cookie
      ? cookie.parse(socket.handshake.headers.cookie)
      : {};
    const token = cookies.acon_session || socket.handshake.auth?.token;
    if (!token) return next(new Error('Sin token'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

      // El rol se lee de la base, no del token: un token de días seguiría
      // afirmando el rol viejo después de una degradación o una baja.
      const user = await User.findById(decoded.id).select('role isActive').lean();
      if (!user || !user.isActive) return next(new Error('Usuario no válido o inactivo'));

      socket.userId = decoded.id;
      socket.userRole = user.role;
      next();
    } catch (e) {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket conectado: ${socket.userId}`);

    // Unirse a sala personal y de rol
    socket.join(`user_${socket.userId}`);
    socket.join(`role_${socket.userRole}`);

    // Confirmar conexion
    socket.emit('connected', { userId: socket.userId, role: socket.userRole });

    // Unirse a sala de lead especifico (cuando el usuario lo abre)
    socket.on('join_lead', async (leadId) => {
      try {
        const allowed = await canWatchLead({ _id: socket.userId, role: socket.userRole }, leadId);
        if (!allowed) {
          socket.emit('join_denied', { leadId, message: 'Sin acceso a este lead' });
          return;
        }
        socket.join(`lead_${leadId}`);
      } catch (error) {
        console.error('[socket] join_lead:', error.message);
      }
    });

    socket.on('leave_lead', (leadId) => {
      socket.leave(`lead_${leadId}`);
    });

    // Typing indicator para chat. Solo si ya está en la sala, que es donde se
    // comprobó el acceso.
    socket.on('typing', ({ leadId, channel }) => {
      if (!socket.rooms.has(`lead_${leadId}`)) return;
      socket.to(`lead_${leadId}`).emit('user_typing', {
        userId: socket.userId, leadId, channel
      });
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket desconectado: ${socket.userId}`);
    });
  });
};

module.exports = { setupSocketHandlers };
