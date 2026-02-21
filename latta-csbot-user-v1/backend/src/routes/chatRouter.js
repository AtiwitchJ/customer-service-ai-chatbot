/**
 * =============================================================================
 * chatRouter.js - Chat & Webhook Routes
 * =============================================================================
 * 
 * 📍 Mount Path: app.use('/', chatRouter) in server.js
 * 📍 Router uses full path e.g. '/webhook/send', '/chat/history' for readability
 * 
 * 🔗 Routes in this file:
 * ┌──────────────────────────────────────────────────────────────────────────────────┐
 * │ Method │ Full Path               │ Login Req. │ Usage                            │
 * ├──────────────────────────────────────────────────────────────────────────────────┤
 * │ POST   │ /webhook/send           │ ✅ Yes     │ User sends message               │
 * │ POST   │ /webhook/receive_reply  │ ❌ No      │ AI Agent sends reply (internal)  │
 * │ POST   │ /api/worker-error       │ ❌ No      │ BullMQ Worker reports error      │
 * │ GET    │ /chat/history/:id       │ ✅ Yes     │ Load chat history                │
 * │ POST   │ /chat/feedback          │ ✅ Yes     │ User likes/dislikes message      │
 * └──────────────────────────────────────────────────────────────────────────────────┘
 * 
 * 📍 Note: GET /config moved to server.js
 * 
 * 🔒 Security: OWASP A03:2021 (XSS Prevention, Input Validation)
 */

const express = require('express');
const router = express.Router();
const xss = require('xss');

// =============================================================================
// Dependencies
// =============================================================================
const { chatQueue } = require('../config/db');
const chatService = require('../services/chatService');
const { verifySession } = require('../middlewares/sessionMiddleware');
const {
    validateSessionId,
    validateMsgId,
    validateFeedbackAction,
    validateText,
    logSecurityEvent
} = require('../utils/validators');

// =============================================================================
// WebSocket Setup
// =============================================================================
let wssInstance;

/**
 * Set WebSocket Server instance
 * 📍 Called from: server.js after creating WebSocket Server
 */
router.setWss = (wss) => { wssInstance = wss; };

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Send message from Bot to Frontend via WebSocket
 * 
 * @param {WebSocketServer} wss - WebSocket Server instance
 * @param {string} sessionId - Recipient Session ID
 * @param {string} text - Message text
 * @param {boolean} isError - Is this an error message?
 * @param {string} msgId - Message ID
 * 
 * 📍 Used in: /webhook/receive_reply, /api/worker-error
 * 
 * 🔍 Logic:
 *    1. Loop to find WebSocket client with matching sessionId
 *    2. Send JSON payload to that client
 */
const sendBotMessageToFrontend = (wss, sessionId, text, isError = false, msgId = null, imageUrls = []) => {
    if (!wss) return;

    let sentCount = 0;
    wss.clients.forEach((client) => {
        // Find client with matching sessionId and open connection
        if (client.readyState === 1 && client.sessionId === sessionId) {
            const payload = {
                type: isError ? 'chat_error' : 'chat_reply',
                reply: text,
                msgId: msgId || `err-${Date.now()}`,
                timestamp: new Date().toISOString(),
                image_urls: imageUrls || []
            };
            console.log(`📡 [WS-SEND] Sending to ${sessionId}:`, JSON.stringify({ ...payload, reply: payload.reply.substring(0, 50) + "..." })); // Debug Log
            if (imageUrls && imageUrls.length > 0) console.log(`📸 [WS-SEND] With ${imageUrls.length} images.`);
            client.send(JSON.stringify(payload));
            sentCount++;
        }
    });

    if (sentCount === 0) {
        console.warn(`⚠️ [WS-SEND] WARNING: No active client found for session ${sessionId}. Message NOT sent to UI.`);
    }
};

// =============================================================================
// Routes: Public (No Login Required)
// =============================================================================

/**
 * POST /webhook/receive_reply
 * 
 * 📍 Usage: AI Agent sends a reply back (webhook_service.js)
 * 📍 Purpose: Receive answer from AI and forward to Frontend via WebSocket
 * 
 * Request Body:
 *   { sessionId: string, replyText: string }
 * 
 * Response:
 *   { status: 'reply_received' }
 * 
 * 🔍 Flow:
 *   AI Agent finishes processing
 *       ↓
 *   POST /webhook/receive_reply { sessionId, replyText }
 *       ↓
 *   chatService.handleBotReply() → Save to MongoDB/Redis
 *       ↓
 *   sendBotMessageToFrontend() → Send WebSocket to Frontend
 */
router.post('/webhook/receive_reply', async (req, res) => {
    const { sessionId, replyText, image_urls } = req.body;

    // Input Validation
    if (!validateSessionId(sessionId)) {
        return res.status(400).json({ status: 'error', message: 'Invalid sessionId' });
    }

    if (!replyText || typeof replyText !== 'string') {
        return res.status(400).json({ status: 'error', message: 'Missing replyText' });
    }

    console.log(`\n🎉 Webhook Received Reply for: ${sessionId}`);
    if (image_urls && image_urls.length > 0) {
        console.log(`📸 Received ${image_urls.length} images`);
    }

    if (!wssInstance) {
        return res.status(500).json({ status: 'error', message: 'WebSocket Server not initialized' });
    }

    // sendBotMessageToFrontend
    try {
        const wsSender = (sId, text, isError, mId, imgUrls) => sendBotMessageToFrontend(wssInstance, sId, text, isError, mId, imgUrls);
        await chatService.handleBotReply({
            sessionId: xss(sessionId),
            replyText: xss(replyText),
            image_urls: image_urls || []
        }, wsSender);
        res.status(200).json({ status: 'reply_received' });
    } catch (err) {
        console.error('Webhook Receive Route Error:', err);
        sendBotMessageToFrontend(wssInstance, sessionId, '⚠️ Server Error', true);
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
});

/**
 * POST /api/worker-error
 * 
 * 📍 Usage: BullMQ Worker encounters an error (bullmq-worker.js)
 * 📍 Purpose: Notify Frontend about error via WebSocket
 * 
 * Request Body:
 *   { sessionId: string, errorMessage: string }
 * 
 * Response:
 *   { status: 'Error received.' }
 * 
 * 🔍 Flow:
 *   BullMQ Worker encounters error (e.g. AI Agent not responding)
 *       ↓
 *   POST /api/worker-error { sessionId, errorMessage }
 *       ↓
 *   chatService.handleBotReply() → Save error message
 *       ↓
 *   sendBotMessageToFrontend() → Send error to Frontend
 */
router.post('/api/worker-error', async (req, res) => {
    const { sessionId, errorMessage } = req.body;

    if (!validateSessionId(sessionId)) {
        return res.status(400).json({ status: 'error', message: 'Invalid sessionId' });
    }

    if (!wssInstance) {
        return res.status(500).json({ status: 'error', message: 'WebSocket Server not initialized' });
    }

    try {
        const wsSender = (sId, text, isError, mId) => sendBotMessageToFrontend(wssInstance, sId, text, isError, mId);
        const safeErrorMessage = errorMessage ? xss(errorMessage) : 'Unknown error';
        await chatService.handleBotReply({ sessionId: xss(sessionId), errorMessage: safeErrorMessage }, wsSender);
        console.log(`❌ Worker Error Broadcasted.`);
        res.status(200).json({ status: 'Error received.' });
    } catch (err) {
        console.error('Worker Error Route Failed:', err);
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
});

// =============================================================================
// Routes: Protected (Login Required - uses verifySession middleware)
// =============================================================================

/**
 * POST /webhook/send
 * 
 * 📍 Usage: User sends a message in chat (sendMessage())
 * 📍 Purpose: Receive message from User and send to Queue for AI processing
 * 📍 Requires Login: ✅ Yes (verifySession middleware)
 * 
 * Request Body:
 *   { text: string, sessionId: string, ipid?: object }
 * 
 * Response:
 *   { status: 'queued' }
 * 
 * 🔍 Flow:
 *   User types message → Sends
 *       ↓
 *   POST /webhook/send { text, sessionId }
 *       ↓
 *   verifySession middleware → Check verified === 'true'
 *       ↓
 *   chatService.handleUserMessage() → Save MongoDB/Redis + Send to BullMQ
 *       ↓
 *   Response { status: 'queued' }
 */
router.post('/webhook/send', verifySession, async (req, res) => {
    const { text, sessionId, ipid } = req.body;

    // Input Validation
    if (!validateSessionId(sessionId)) {
        logSecurityEvent('INVALID_SESSION_FORMAT', { ip: req.ip, path: '/webhook/send' });
        return res.status(400).json({ status: 'error', message: 'Invalid sessionId' });
    }

    if (!validateText(text)) {
        logSecurityEvent('INVALID_TEXT_INPUT', { ip: req.ip, sessionId, textLength: text?.length });
        return res.status(400).json({ status: 'error', message: 'Invalid or too long message' });
    }

    try {
        // XSS Prevention
        const cleanText = xss(text);
        const cleanSessionId = xss(sessionId);

        const messagePayload = {
            text: cleanText,
            sessionId: cleanSessionId,
            sender: 'user',
            ipid: ipid ? xss(JSON.stringify(ipid)) : 'unknown',
            idCard: 'guest',
            email: 'unknown',
            time: new Date().toISOString()
        };

        await chatService.handleUserMessage(messagePayload, chatQueue);

        res.status(200).json({ status: 'queued' });
    } catch (error) {
        console.error('Webhook Send Route Error:', error);
        res.status(503).json({ status: 'error' });
    }
});

/**
 * GET /chat/history/:sessionId
 * 
 * 📍 Usage: Frontend loads chat history (loadChatHistory())
 * 📍 Purpose: Retrieve all message history for session
 * 📍 Requires Login: ✅ Yes (verifySession middleware)
 * 
 * Request Params:
 *   sessionId: string
 * 
 * Response:
 *   [{ msgId, sender, text, time, feedback }, ...]
 * 
 * 🔍 Flow:
 *   User opens web + logged in
 *       ↓
 *   GET /chat/history/{sessionId}
 *       ↓
 *   verifySession middleware → Check verified === 'true'
 *       ↓
 *   chatService.getChatHistory() → Fetch from Redis (cache) or MongoDB
 *       ↓
 *   Response: array of messages
 */
router.get('/chat/history/:sessionId', verifySession, async (req, res) => {
    const { sessionId } = req.params;

    // Input Validation
    if (!validateSessionId(sessionId)) {
        logSecurityEvent('INVALID_SESSION_FORMAT', { ip: req.ip, path: '/chat/history' });
        return res.status(400).json({ status: 'error', message: 'Invalid sessionId' });
    }

    try {
        const cleanSessionId = xss(sessionId);
        const messages = await chatService.getChatHistory(cleanSessionId);
        res.json(messages);
    } catch (err) {
        console.error('History Route Error:', err);
        res.status(500).json({ status: 'error', message: 'Failed to load history' });
    }
});

/**
 * POST /chat/feedback
 * 
 * 📍 Usage: User Likes/Dislikes bot message (sendFeedback())
 * 📍 Purpose: Record message feedback
 * 📍 Requires Login: ✅ Yes (verifySession middleware)
 * 
 * Request Body:
 *   { sessionId: string, msgId: string, action: 'like'|'dislike'|'none' }
 * 
 * Response:
 *   { status: 'success', feedback: 'like' }
 * 
 * 🔍 Flow:
 *   User presses 👍 or 👎 on bot message
 *       ↓
 *   POST /chat/feedback { sessionId, msgId, action }
 *       ↓
 *   verifySession middleware → Check verified === 'true'
 *       ↓
 *   chatService.recordFeedback() → Update MongoDB + Redis
 */
router.post('/chat/feedback', verifySession, async (req, res) => {
    const { sessionId, msgId, action } = req.body;

    // Input Validation
    if (!validateSessionId(sessionId)) {
        logSecurityEvent('INVALID_SESSION_FORMAT', { ip: req.ip, path: '/chat/feedback' });
        return res.status(400).json({ status: 'error', message: 'Invalid sessionId' });
    }

    if (!validateMsgId(msgId)) {
        logSecurityEvent('INVALID_MSGID_FORMAT', { ip: req.ip, sessionId });
        return res.status(400).json({ status: 'error', message: 'Invalid msgId' });
    }

    if (!validateFeedbackAction(action)) {
        logSecurityEvent('INVALID_FEEDBACK_ACTION', { ip: req.ip, sessionId, action });
        return res.status(400).json({ status: 'error', message: 'Invalid action' });
    }

    try {
        const cleanSessionId = xss(sessionId);
        const cleanMsgId = xss(msgId);

        await chatService.recordFeedback(cleanSessionId, cleanMsgId, action);
        console.log(`📝 Feedback recorded: [${action}] for msg ${cleanMsgId}`);
        return res.json({ status: 'success', feedback: action });

    } catch (err) {
        console.error('Feedback Route Error:', err);
        res.status(500).json({ status: 'error' });
    }
});

module.exports = router;
