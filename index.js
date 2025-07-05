const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});
const rooms = ['room1']; // Define your rooms here
let data = {};
data['room1'] = {};
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  socket.on('room1', (msg) => {
    console.log('Message received:', msg);
    if (!data['room1']) { 
      data['room1'] = {};
    }
    data['room1'][msg.id] = { x: msg.x, y: msg.y};
    // io.to(socket.room).emit("position", data[socket.room]);
    io.emit('room1', data); // Emit to all connected clients
    });
  // socket.on('disconnect', () => {
  //   console.log('A user disconnected:', socket.id);
  //   delete data[socket.room][socket.id];
  // });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});