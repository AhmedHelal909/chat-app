'use strict';

const path = require('path');

module.exports = {
  port: Number(process.env.PORT) || 3000,
  uploadDir: process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'),
  maxFileSizeBytes: (Number(process.env.MAX_FILE_MB) || 25) * 1024 * 1024,

  maxUsernameLength: 20,
  maxRoomLength: 30,
  maxMessageLength: 2000,
  historyLimit: 50, // messages kept in memory per room

  heartbeatMs: 30000, // ping interval to detect dead connections

  // Only these types can be uploaded. The extension is chosen from this map,
  // never from the user's file name (prevents uploading .html / .js files).
  allowedMimeTypes: {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'audio/webm': '.weba',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
  },
};
