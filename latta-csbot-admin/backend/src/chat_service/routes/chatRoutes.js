/**
 * CHAT ROUTES
 * ===========
 * API routes for chat operations / เส้นทาง API สำหรับการจัดการแชท
 */

const express = require('express');
const {
    getChats,
    getChatById,
    deleteChat,
    bulkDeleteChats,
    importChats,
    exportChats
} = require('../controllers/chatController');

const router = express.Router();

// /api/chats routes / เส้นทาง /api/chats
router.get('/chats', getChats);
router.get('/chats/export', exportChats);      // Export must be before /:id / Export ต้องอยู่ก่อน /:id
router.post('/chats/import', importChats);     // Import JSON / นำเข้า JSON
router.get('/chats/:id', getChatById);
router.delete('/chats/:id', deleteChat);
router.post('/chats/bulk-delete', bulkDeleteChats);

module.exports = router;
