// WebSocket utility functions for managing rooms and connections
const { v4: uuidv4 } = require("uuid");
const WebSocket = require("ws"); // Add this import!

/**
 * Add a WebSocket connection to a room
 * @param {WebSocket} ws - The WebSocket connection
 * @param {string} roomId - The room identifier
 * @param {Object} rooms - The rooms object containing all active rooms
 */
function joinRoom(ws, roomId, rooms, role = "unknown") {
  console.log(
    "joinRoom called - roomId:",
    roomId,
    "role:",
    role,
    "type:",
    typeof role
  );

  if (!rooms[roomId]) {
    rooms[roomId] = new Set();
  }

  // Assign peer ID and role to the WebSocket
  ws.peerId = uuidv4();
  ws.role = role || "unknown";
  ws.roomId = roomId;

  // Add to room
  rooms[roomId].add(ws);

  console.log(`Peer ${ws.peerId} (${ws.role}) joined room ${roomId}`);

  // Get current roles in room
  const rolesInRoom = Array.from(rooms[roomId]).map((client) => ({
    peerId: client.peerId,
    role: client.role,
  }));

  // Send join confirmation to the joining peer
  ws.send(
    JSON.stringify({
      type: "joined",
      peerId: ws.peerId,
      room: roomId,
      count: rooms[roomId].size,
      roles: rolesInRoom,
    })
  );

  // Notify other peers in the room
  const joinMessage = JSON.stringify({
    type: "peer-joined",
    peerId: ws.peerId,
    role: role,
    room: roomId,
    count: rooms[roomId].size,
    roles: rolesInRoom,
  });

  rooms[roomId].forEach((client) => {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(joinMessage);
    }
  });
}

/**
 * Remove a WebSocket connection from a room
 * @param {WebSocket} ws - The WebSocket connection
 * @param {string} roomId - The room identifier
 * @param {Object} rooms - The rooms object containing all active rooms
 */
function leaveRoom(ws, roomId, rooms) {
  if (!rooms[roomId] || !rooms[roomId].has(ws)) {
    return;
  }

  rooms[roomId].delete(ws);
  console.log(`Peer ${ws.peerId} left room ${roomId}`);

  // Get updated roles
  const rolesInRoom = Array.from(rooms[roomId]).map((client) => ({
    peerId: client.peerId,
    role: client.role,
  }));

  // Notify remaining peers
  const leaveMessage = JSON.stringify({
    type: "peer-left",
    peerId: ws.peerId,
    room: roomId,
    count: rooms[roomId].size,
    roles: rolesInRoom,
  });

  rooms[roomId].forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(leaveMessage);
    }
  });

  // Clean up empty room
  if (rooms[roomId].size === 0) {
    delete rooms[roomId];
  }
}

/**
 * Handle client disconnection and clean up room membership
 * @param {WebSocket} ws - The WebSocket connection that disconnected
 * @param {Object} rooms - The rooms object containing all active rooms
 */
function handleDisconnection(ws, rooms) {
  if (ws.roomId) {
    leaveRoom(ws, ws.roomId, rooms);
  }
}

/**
 * Broadcast a message to all clients in a specific room
 * @param {string} roomId - The room identifier
 * @param {string} message - The message to broadcast
 * @param {Object} rooms - The rooms object containing all active rooms
 */
function broadcastMessage(roomId, message, rooms) {
  if (!rooms[roomId]) return;

  const broadcastData = JSON.stringify({
    type: "message",
    message: message,
    room: roomId,
  });

  rooms[roomId].forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(broadcastData);
    }
  });
}

/**
 * Get room information including peer count
 * @param {string} roomId - The room identifier
 * @param {Object} rooms - The rooms object containing all active rooms
 * @returns {Object} Room information
 */
function getRoomInfo(roomId, rooms) {
  if (!rooms[roomId]) {
    return { count: 0, roles: [] };
  }

  const rolesInRoom = Array.from(rooms[roomId]).map((client) => ({
    peerId: client.peerId,
    role: client.role,
  }));

  return {
    count: rooms[roomId].size,
    roles: rolesInRoom,
  };
}

module.exports = {
  joinRoom,
  leaveRoom,
  broadcastMessage,
  getRoomInfo,
  handleDisconnection,
};
