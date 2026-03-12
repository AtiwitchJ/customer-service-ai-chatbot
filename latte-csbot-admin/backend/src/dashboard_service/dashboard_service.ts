/**
 * DASHBOARD SERVICE MODULE
 * ========================
 * Main entry point for dashboard service / จุดเริ่มต้นหลักของ dashboard service
 */

import { Router } from 'express';
import dashboardRoutes from './routes/dashboardRoutes';
import { initializeCacheManager } from './analytics/cacheManager';

const router = Router();

initializeCacheManager();
router.use('/', dashboardRoutes);

export default router;
