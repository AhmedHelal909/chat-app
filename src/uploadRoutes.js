'use strict';

const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const config = require('./config');

fs.mkdirSync(config.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const ext = config.allowedMimeTypes[file.mimetype];
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxFileSizeBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (config.allowedMimeTypes[file.mimetype]) return cb(null, true);
    cb(new Error('File type not allowed'));
  },
});

const router = express.Router();

// POST /api/upload  (form-data field name: "file")
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });

  res.json({
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname.slice(0, 100),
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

// Turn upload errors (too big, wrong type...) into clean JSON
// eslint-disable-next-line no-unused-vars
router.use((err, _req, res, _next) => {
  const status = err instanceof multer.MulterError ? 413 : 400;
  res.status(status).json({ error: err.message });
});

module.exports = router;
