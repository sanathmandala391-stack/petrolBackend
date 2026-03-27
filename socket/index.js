const jwt = require('jsonwebtoken');
const User = require('../models/User');

const setupSocket = (io) => {
  // Authentication middleware for socket
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.name} (${socket.user.role})`);

    // Join role-specific room
    socket.join(socket.user.role);
    
    // Join user-specific room
    socket.join(`user_${socket.user._id}`);

    // If manager, join manager room for alerts
    if (socket.user.role === 'manager') {
      socket.join('managers');
    }

    // Handle operator status updates
    socket.on('operator_status', (data) => {
      io.to('managers').emit('operator_status_update', {
        operatorId: socket.user._id,
        name: socket.user.name,
        ...data
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.name}`);
      
      // Notify managers of operator disconnect
      if (socket.user.role === 'operator') {
        io.to('managers').emit('operator_offline', {
          operatorId: socket.user._id,
          name: socket.user.name
        });
      }
    });

    // Ping for connection health
    socket.on('ping', () => {
      socket.emit('pong');
    });
  });

  return io;
};

module.exports = setupSocket;
