# Express + WebSocket Chat

Real-time chat with rooms, file sharing and WebRTC video calls.

## Features
- Rooms (join any room name), online users list, last 50 messages per room
- Text chat, "is typing" indicator
- Send images, video, audio, PDF, text files (upload via HTTP, announced via WebSocket)
- Group video calls (WebRTC mesh), mute / camera toggle, screen sharing
- Heartbeat to drop dead connections, graceful shutdown, health endpoint

## Run with Docker
    docker compose up --build
Open http://localhost:3000 in two browser tabs.

Development with auto-reload:
    docker compose -f docker-compose.dev.yml up --build

## Run without Docker
    npm install
    npm start

## Structure
    server.js              Express + WebSocket server setup
    src/config.js          Settings (port, limits, allowed file types)
    src/roomManager.js     Rooms, users, message history
    src/socketHandler.js   One handler per WebSocket message type
    src/uploadRoutes.js    POST /api/upload (multer)
    public/                Frontend (index.html, style.css, app.js)

## Important notes
- Camera/mic only work on `localhost` or **HTTPS**. For other devices put the app
  behind a reverse proxy with TLS (Nginx, Caddy, Traefik) and forward `/ws` with
  WebSocket upgrade headers.
- Video calls use a free Google STUN server. Behind strict NATs you also need a
  TURN server (e.g. coturn); add it to `ICE_SERVERS` in `public/app.js`.
- Mesh calls are fine for ~4-6 people. For bigger rooms use an SFU (mediasoup, LiveKit).
- Messages are stored in memory only. For persistence or multiple server
  instances, add a database (MongoDB/PostgreSQL) and Redis pub/sub.
