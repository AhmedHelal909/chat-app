'use strict';

const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');

const config = require('./src/config');
const uploadRoutes = require('./src/uploadRoutes');
const { attachSocketHandlers } = require('./src/socketHandler');

// 1) Express: static files + REST endpoints
const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.use(
  '/uploads',
  express.static(config.uploadDir, {
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  })
);
app.use('/api', uploadRoutes);
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// 2) HTTP server shared by Express and WebSocket
const server = http.createServer(app);

// 3) WebSocket server lives on /ws
const wss = new WebSocketServer({ server, path: '/ws' });
attachSocketHandlers(wss);

server.listen(config.port, () => {
  console.log(`Chat running on http://localhost:${config.port}`);
});

// 4) Graceful shutdown (important inside Docker: `docker stop` sends SIGTERM)
function shutdown() {
  console.log('Shutting down...');
  wss.clients.forEach((ws) => ws.close(1001, 'Server shutting down'));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
