/**
 * CHAT ROUTES
 * ===========
 * API routes for chat operations / เส้นทาง API สำหรับการจัดการแชท
 */

import { Router } from 'express';
import chatController from '../controllers/chatController';

const router = Router();

router.get('/chats', chatController.getChats.bind(chatController));
router.get('/chats/export', chatController.exportChats.bind(chatController));
router.post('/chats/import', chatController.importChats.bind(chatController));
router.get('/chats/:id', chatController.getChatById.bind(chatController));
router.delete('/chats/:id', chatController.deleteChat.bind(chatController));
router.post('/chats/bulk-delete', chatController.bulkDeleteChats.bind(chatController));

export default router;
