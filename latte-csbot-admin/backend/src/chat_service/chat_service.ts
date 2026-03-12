/**
 * CHAT SERVICE MODULE
 * ====================
 * Main entry point for chat service / จุดเริ่มต้นหลักของ chat service
 */

import { Router } from 'express';
import chatRoutes from './routes/chatRoutes';

require('dotenv').config();

const router = Router();
router.use('/', chatRoutes);

export default router;
