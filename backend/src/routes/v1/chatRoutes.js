// src/routes/v1/chatRoutes.js
'use strict';
const { Router } = require('express');
const express = require('express');
const { getMessages, sendMessage, getRooms, markRead, uploadMessage, downloadAttachment } = require('../../controllers/chatController');
const { chatUploadRateLimiter } = require('../../middleware/rateLimiter');
const { ALLOWED_TYPES } = require('../../utils/chatAttachment');
const { authenticate } = require('../../middleware/authMiddleware');
const router = Router();
router.use(authenticate);
router.get('/messages', getMessages);
router.post('/messages', sendMessage);
// Files arrive as the raw request body (only these types are read; anything else is refused in the controller).
router.post('/attachments', chatUploadRateLimiter, express.raw({ type: ALLOWED_TYPES, limit: '2mb' }), uploadMessage);
router.get('/attachments/:id', downloadAttachment);
router.get('/rooms', getRooms);
router.post('/rooms/:roomId/read', markRead);
module.exports = router;

// ─────────────────────────────────────────────────────────────────────────────
// NOTE: Save separate files for admin and language routes below
// src/routes/v1/adminRoutes.js
