const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

let data = [];
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  console.log('Socket room:', socket);
  socket.on(socket.room, (msg) => {
    socket.join(msg.room);
    if (!data[msg.room]) { 
      data[msg.room] = {};
    }
    data[msg.room][msg.id] = { x: msg.x, y: msg.y};
    // io.to(socket.room).emit("position", data[socket.room]);
    io.emit(data.room, data); // Emit to all connected clients
    });
  socket.on('disconnect', () => {
    delete data[socket.room][socket.id];
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});