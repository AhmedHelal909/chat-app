'use strict';

const config = require('./config');

/**
 * Keeps track of rooms and the clients inside them.
 * A "client" is: { id, username, ws, room, inCall }
 */
class RoomManager {
  constructor() {
    // roomName -> { clients: Map<clientId, client>, history: [] }
    this.rooms = new Map();
  }

  join(roomName, client) {
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, { clients: new Map(), history: [] });
    }
    this.rooms.get(roomName).clients.set(client.id, client);
    client.room = roomName;
  }

  leave(client) {
    const room = this.rooms.get(client.room);
    if (!room) return;
    room.clients.delete(client.id);
    if (room.clients.size === 0) this.rooms.delete(client.room); // free memory
    client.room = null;
  }

  isUsernameTaken(roomName, username) {
    const room = this.rooms.get(roomName);
    if (!room) return false;
    const wanted = username.toLowerCase();
    return [...room.clients.values()].some((c) => c.username.toLowerCase() === wanted);
  }

  getClient(roomName, clientId) {
    return this.rooms.get(roomName)?.clients.get(clientId);
  }

  getUsers(roomName) {
    const room = this.rooms.get(roomName);
    if (!room) return [];
    return [...room.clients.values()].map(({ id, username, inCall }) => ({ id, username, inCall }));
  }

  getCallPeers(roomName, exceptId) {
    return this.getUsers(roomName).filter((u) => u.inCall && u.id !== exceptId);
  }

  addToHistory(roomName, message) {
    const room = this.rooms.get(roomName);
    if (!room) return;
    room.history.push(message);
    if (room.history.length > config.historyLimit) room.history.shift();
  }

  getHistory(roomName) {
    return this.rooms.get(roomName)?.history ?? [];
  }

  broadcast(roomName, payload, exceptId = null) {
    const room = this.rooms.get(roomName);
    if (!room) return;
    const data = JSON.stringify(payload);
    for (const client of room.clients.values()) {
      if (client.id !== exceptId && client.ws.readyState === 1) client.ws.send(data);
    }
  }
}

module.exports = new RoomManager();
