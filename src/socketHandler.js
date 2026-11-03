'use strict';

const crypto = require('crypto');
const config = require('./config');
const rooms = require('./roomManager');

// ---------- small helpers ----------

const send = (ws, payload) => {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
};

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

const systemMessage = (text) => ({ type: 'system', text, ts: Date.now() });

// Uploaded files can only point to our own /uploads folder
const SAFE_UPLOAD_URL = /^\/uploads\/[\w-]+\.\w+$/;

// ---------- message handlers (one function per message type) ----------

const handlers = {
  // { type:'join', username, room }
  join(client, data) {
    if (client.room) return send(client.ws, { type: 'error', message: 'Already joined' });

    const username = clean(data.username, config.maxUsernameLength);
    const room = clean(data.room, config.maxRoomLength).toLowerCase() || 'general';

    if (!username) return send(client.ws, { type: 'error', message: 'Username is required' });
    if (rooms.isUsernameTaken(room, username)) {
      return send(client.ws, { type: 'error', message: 'That name is already used in this room' });
    }

    client.username = username;
    rooms.join(room, client);

    send(client.ws, {
      type: 'joined',
      me: { id: client.id, username },
      room,
      users: rooms.getUsers(room),
      history: rooms.getHistory(room),
    });

    rooms.broadcast(room, systemMessage(`${username} joined`), client.id);
    rooms.broadcast(room, { type: 'users', users: rooms.getUsers(room) }, client.id);
  },

  // { type:'chat', text }
  chat(client, data) {
    if (!client.room) return;
    const text = clean(data.text, config.maxMessageLength);
    if (!text) return;

    const message = {
      type: 'message',
      id: crypto.randomUUID(),
      kind: 'text',
      from: { id: client.id, username: client.username },
      text,
      ts: Date.now(),
    };
    rooms.addToHistory(client.room, message);
    rooms.broadcast(client.room, message);
  },

  // { type:'file', file:{ url, name, size, mimetype } }
  file(client, data) {
    if (!client.room) return;
    const file = data.file || {};
    if (!SAFE_UPLOAD_URL.test(file.url || '')) return;

    const message = {
      type: 'message',
      id: crypto.randomUUID(),
      kind: 'file',
      from: { id: client.id, username: client.username },
      file: {
        url: file.url,
        name: clean(file.name, 100),
        size: Number(file.size) || 0,
        mimetype: clean(file.mimetype, 50),
      },
      ts: Date.now(),
    };
    rooms.addToHistory(client.room, message);
    rooms.broadcast(client.room, message);
  },

  // { type:'typing', isTyping:boolean }
  typing(client, data) {
    if (!client.room) return;
    rooms.broadcast(
      client.room,
      { type: 'typing', id: client.id, username: client.username, isTyping: Boolean(data.isTyping) },
      client.id
    );
  },

  // ----- Video call (WebRTC signaling) -----

  // I want to join the video call: tell me who is already in it
  'call-join'(client) {
    if (!client.room || client.inCall) return;
    client.inCall = true;
    send(client.ws, { type: 'call-peers', peers: rooms.getCallPeers(client.room, client.id) });
    rooms.broadcast(client.room, { type: 'users', users: rooms.getUsers(client.room) });
  },

  'call-leave'(client) {
    leaveCall(client);
  },

  // { type:'signal', to, data } -> relay offer / answer / ICE candidate to one peer
  signal(client, data) {
    if (!client.room || !client.inCall) return;
    const target = rooms.getClient(client.room, data.to);
    if (!target || !target.inCall) return;
    send(target.ws, {
      type: 'signal',
      from: client.id,
      username: client.username,
      data: data.data,
    });
  },
};

function leaveCall(client) {
  if (!client.room || !client.inCall) return;
  client.inCall = false;
  rooms.broadcast(client.room, { type: 'call-user-left', id: client.id }, client.id);
  rooms.broadcast(client.room, { type: 'users', users: rooms.getUsers(client.room) });
}

// ---------- wiring ----------

function attachSocketHandlers(wss) {
  wss.on('connection', (ws) => {
    const client = { id: crypto.randomUUID(), username: null, ws, room: null, inCall: false };
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return send(ws, { type: 'error', message: 'Invalid JSON' });
      }
      const handler = Object.hasOwn(handlers, data.type) ? handlers[data.type] : null;
      if (!handler) return send(ws, { type: 'error', message: `Unknown type: ${data.type}` });
      handler(client, data);
    });

    ws.on('close', () => {
      if (!client.room) return;
      const room = client.room;
      leaveCall(client);
      rooms.leave(client);
      rooms.broadcast(room, systemMessage(`${client.username} left`));
      rooms.broadcast(room, { type: 'users', users: rooms.getUsers(room) });
      rooms.broadcast(room, { type: 'typing', id: client.id, username: client.username, isTyping: false });
    });

    ws.on('error', (err) => console.error('WS error:', err.message));
  });

  // Heartbeat: drop connections that stopped answering pings
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, config.heartbeatMs);

  wss.on('close', () => clearInterval(interval));
}

module.exports = { attachSocketHandlers };
