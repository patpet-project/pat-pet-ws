const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: '*', // Adjust as needed for security
  }
});

let data = [];
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  socket.on(socket.room, (msg) => {
    if (!data[socket.room]) { 
      data[socket.room] = {};
    }
    data[socket.room][socket.id] = { x: socket.x, y: socket.y, user: socket.id };
    // io.to(socket.room).emit("position", data[socket.room]);
    io.emit(socket.room, data); // Emit to all connected clients
    });
  socket.on('disconnect', () => {
    delete data[socket.room][socket.id];
    io.to(socket.room).emit("position", data[socket.room][socket.id]);
    console.log('User disconnected:', socket.id);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});