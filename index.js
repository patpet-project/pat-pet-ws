/** @format */

const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

// Nodemon configuration for hot reload
if (process.env.NODE_ENV !== "production") {
  console.log("🔥 Development mode - Hot reload enabled");
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.static("public")); // Serve static files if needed

// CORS middleware for API routes
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Store connected clients and their data
const clients = new Map();
const rooms = new Map();

// Initialize rooms
const ROOMS = ["Main_Screen", "House_Screen"];
ROOMS.forEach((roomId) => {
  rooms.set(roomId, new Map());
});

// Create HTTP server
const server = createServer(app);

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

console.log(`Express server with Socket.IO running on port ${PORT}`);

// Basic Express routes
app.get("/", (req, res) => {
  res.json({
    message: "Multiplayer Socket.IO Server",
    port: PORT,
    status: "running",
    transport: "Socket.IO",
    rooms: Array.from(rooms.keys()),
    totalPlayers: clients.size,
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    connectedClients: clients.size,
    rooms: Array.from(rooms.entries()).map(([roomId, room]) => ({
      roomId,
      playerCount: room.size,
      players: Array.from(room.values()),
    })),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/rooms", (req, res) => {
  const roomsData = Array.from(rooms.entries()).map(([roomId, room]) => ({
    roomId,
    playerCount: room.size,
    players: Array.from(room.values()).map((player) => ({
      id: player.id,
      username: player.username,
      position: player.position,
      joinedAt: player.joinedAt || new Date().toISOString(),
    })),
    maxPlayers: 10, // You can adjust this
  }));
  res.json(roomsData);
});

app.get("/api/rooms/:roomId", (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);

  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  res.json({
    roomId,
    playerCount: room.size,
    players: Array.from(room.values()),
    isActive: room.size > 0,
  });
});

// Socket.IO connection handling
io.on("connection", (socket) => {
  const clientId = uuidv4();
  const shortId = clientId.substring(0, 8);
  console.log(
    `🎮 Client connected: Player_${shortId} (Socket ID: ${socket.id})`
  );

  // Initialize client data with default username
  clients.set(clientId, {
    socket,
    id: clientId,
    socketId: socket.id,
    currentRoom: null,
    position: { x: 192, y: 160 },
    frame: 0,
    username: `Player_${shortId}`, // Default username
    connectedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
  });

  // Send welcome message with client ID
  socket.emit("connected", {
    clientId,
    username: `Player_${shortId}`,
    message: "Connected to multiplayer server",
    availableRooms: Array.from(rooms.keys()),
  });

  // Handle join room with optional username
  socket.on("join_room", (data) => {
    console.log(`📍 ${clientId} attempting to join room: ${data.roomId}`);
    
    // Update username if provided
    if (data.username) {
      const client = clients.get(clientId);
      if (client) {
        client.username = data.username;
        console.log(`🏷️ Updated username for ${clientId}: ${data.username}`);
      }
    }
    
    handleJoinRoom(clientId, data.roomId, data.position);
  });

  // Handle leave room
  socket.on("leave_room", () => {
    console.log(`🚪 ${clientId} leaving room`);
    handleLeaveRoom(clientId);
  });

  // Handle player movement
  socket.on("player_move", (data) => {
    handlePlayerMove(clientId, data.position, data.frame);

    // Update last activity
    const client = clients.get(clientId);
    if (client) {
      client.lastActivity = new Date().toISOString();
    }
  });

  // Handle player animation
  socket.on("player_animation", (data) => {
    handlePlayerAnimation(clientId, data.animation, data.frame);
  });

  // Handle disconnect
  socket.on("disconnect", (reason) => {
    const client = clients.get(clientId);
    const username = client ? client.username : `Player_${shortId}`;
    console.log(`❌ Client disconnected: ${username} (${reason})`);
    handleDisconnect(clientId);
  });

  // Handle connection error
  socket.on("connect_error", (error) => {
    console.error(`🔥 Socket.IO error for client ${clientId}:`, error);
  });

  // Handle ping for connection health
  socket.on("ping", () => {
    socket.emit("pong");
  });
});

function handleJoinRoom(clientId, roomId, position) {
  const client = clients.get(clientId);
  if (!client) {
    console.error(`❌ Client ${clientId} not found when joining room`);
    return;
  }

  // Validate room exists
  if (!rooms.has(roomId)) {
    console.error(`❌ Room ${roomId} does not exist`);
    client.socket.emit("error", { message: "Room does not exist" });
    return;
  }

  // Leave current room if in one
  if (client.currentRoom) {
    handleLeaveRoom(clientId);
  }

  // Join new room
  client.currentRoom = roomId;
  client.position = position || { x: 192, y: 160 };
  client.joinedAt = new Date().toISOString();

  // Join Socket.IO room
  client.socket.join(roomId);

  const room = rooms.get(roomId);
  room.set(clientId, {
    id: clientId,
    socketId: client.socketId,
    username: client.username, // Use updated username
    position: client.position,
    frame: client.frame,
    joinedAt: client.joinedAt,
  });

  console.log(
    `✅ ${client.username} joined room ${roomId} (${room.size} players total)`
  );

  // Send current room state to joining client
  const roomPlayers = Array.from(room.values());
  client.socket.emit("room_state", {
    roomId,
    players: roomPlayers,
    playerCount: room.size,
  });

  // Notify other players in room about new player
  client.socket.to(roomId).emit("player_joined", {
    player: {
      id: clientId,
      socketId: client.socketId,
      username: client.username, // Use updated username
      position: client.position,
      frame: client.frame,
      joinedAt: client.joinedAt,
    },
  });

  // Broadcast updated room info to all clients
  io.emit("room_update", {
    roomId,
    playerCount: room.size,
  });
}

function handleLeaveRoom(clientId) {
  const client = clients.get(clientId);
  if (!client || !client.currentRoom) return;

  const roomId = client.currentRoom;
  const room = rooms.get(roomId);

  if (room) {
    room.delete(clientId);

    // Leave Socket.IO room
    client.socket.leave(roomId);

    // Notify other players about player leaving
    client.socket.to(roomId).emit("player_left", {
      playerId: clientId,
    });

    console.log(
      `🚪 ${client.username} left room ${roomId} (${room.size} players remaining)`
    );

    // Broadcast updated room info to all clients
    io.emit("room_update", {
      roomId,
      playerCount: room.size,
    });
  }

  client.currentRoom = null;
}

function handlePlayerMove(clientId, position, frame) {
  const client = clients.get(clientId);
  if (!client || !client.currentRoom) return;

  // Update client position
  client.position = position;
  client.frame = frame;

  // Update room data
  const room = rooms.get(client.currentRoom);
  if (room && room.has(clientId)) {
    const playerData = room.get(clientId);
    playerData.position = position;
    playerData.frame = frame;

    // Broadcast movement to other players in room (throttled logging)
    if (Math.random() < 0.1) {
      // Only log 10% of movements to reduce spam
      console.log(`🏃 ${client.username} moved in ${client.currentRoom}`);
    }

    // Broadcast movement to other players in room
    client.socket.to(client.currentRoom).emit("player_moved", {
      playerId: clientId,
      position,
      frame,
    });
  }
}

function handlePlayerAnimation(clientId, animation, frame) {
  const client = clients.get(clientId);
  if (!client || !client.currentRoom) return;

  console.log(`🎭 ${client.username} played animation: ${animation}`);

  // Broadcast animation to other players in room
  client.socket.to(client.currentRoom).emit("player_animation", {
    playerId: clientId,
    animation,
    frame,
  });
}

function handleDisconnect(clientId) {
  const client = clients.get(clientId);
  if (client) {
    // Leave current room
    if (client.currentRoom) {
      handleLeaveRoom(clientId);
    }

    // Remove client
    clients.delete(clientId);
    console.log(`🗑️ Cleaned up client data for ${client.username}`);
  }
}

// Additional Socket.IO specific routes
app.get("/api/sockets", (req, res) => {
  const socketsInfo = Array.from(clients.values()).map((client) => ({
    clientId: client.id,
    socketId: client.socketId,
    username: client.username,
    currentRoom: client.currentRoom,
    position: client.position,
    connected: client.socket.connected,
    connectedAt: client.connectedAt,
    lastActivity: client.lastActivity,
  }));

  res.json({
    totalSockets: socketsInfo.length,
    sockets: socketsInfo,
    roomDistribution: Array.from(rooms.entries()).map(([roomId, room]) => ({
      roomId,
      playerCount: room.size,
    })),
  });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    connections: {
      total: clients.size,
      rooms: Array.from(rooms.entries()).map(([roomId, room]) => ({
        roomId,
        players: room.size,
      })),
    },
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Express server with Socket.IO listening on port ${PORT}`);
  console.log(`📡 Socket.IO endpoint: http://localhost:${PORT}`);
  console.log(`🎮 Available rooms: ${Array.from(rooms.keys()).join(", ")}`);
  console.log(`📊 API endpoints:`);
  console.log(`   - GET /api/status - Server status`);
  console.log(`   - GET /api/rooms - Room information`);
  console.log(`   - GET /api/health - Health check`);
});

// Cleanup function for graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down server...");

  // Notify all clients about server shutdown
  io.emit("server_shutdown", { message: "Server is shutting down" });

  io.close(() => {
    console.log("📡 Socket.IO server closed");
    server.close(() => {
      console.log("🚀 Express server closed");
      process.exit(0);
    });
  });
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});