// backend/routes/chatRoutes.js
'use strict';

const express = require('express');
const router  = express.Router();

const { protect }                              = require('../middleware/auth');
const { requireChatToken, verifyPassword, handleChat } = require('../controllers/chatController');

// Same pattern as Dashboardroutes.js: protect applies to everything in this file
router.use(protect);

// POST /api/dashboard/chat/verify-password
router.post('/chat/verify-password', verifyPassword);

// POST /api/dashboard/chat  (requires x-chat-token header from the above)
router.post('/chat', requireChatToken, handleChat);

module.exports = router;