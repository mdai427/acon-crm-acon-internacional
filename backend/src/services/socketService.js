const jwt = require('jsonwebtoken');

const setupSocketHandlers = (io) => {
  // Middleware de autenticación para sockets
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Sin token'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
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
    socket.on('join_lead', (leadId) => {
      socket.join(`lead_${leadId}`);
    });

    socket.on('leave_lead', (leadId) => {
      socket.leave(`lead_${leadId}`);
    });

    // Typing indicator para chat
    socket.on('typing', ({ leadId, channel }) => {
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
