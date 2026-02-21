/**
 * DASHBOARD SERVICE MODULE
 * ========================
 * Main entry point for dashboard service / จุดเริ่มต้นหลักของ dashboard service
 */

const express = require('express');
const dashboardRoutes = require('./routes/dashboardRoutes');
const { initializeCacheManager } = require('./analytics/cacheManager');

const router = express.Router();

// Initialize cache management / เริ่มต้นการจัดการ cache
initializeCacheManager();

// Mount routes / ติดตั้ง routes
router.use('/', dashboardRoutes);

module.exports = router;
