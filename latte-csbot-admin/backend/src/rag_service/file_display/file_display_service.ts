/**
 * FILE DISPLAY SERVICE MODULE
 * Main entry point for File Display service
 */

import { Router } from 'express';
import fileDisplayRoutes from './routes/fileDisplayRoutes';

const router = Router();
router.use('/', fileDisplayRoutes);

export default router;
