/**
 * DASHBOARD ROUTES
 * ================
 * API routes for dashboard functionality / เส้นทาง API สำหรับฟังก์ชัน dashboard
 */

const express = require('express');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const {
    getOverview,
    getWordFreq,
    refreshStats,
    getTrends,
    getPeakHoursData,
    getTopQuestionsData,
    getUsersData
} = require('../controllers/dashboardController');
const { uploadChats } = require('../controllers/uploadController');
const { exportChats, getStorageStatus } = require('../controllers/exportController');

const router = express.Router();

// ===================
// MAIN ENDPOINTS / เอนด์พอยต์หลัก
// ===================

/**
 * GET /api/overview
 * Get dashboard overview with stats / ดึงภาพรวม dashboard พร้อมสถิติ
 */
router.get('/overview', getOverview);

/**
 * GET /api/wordfreq
 * Get word frequency data / ดึงข้อมูลความถี่คำ
 */
router.get('/wordfreq', getWordFreq);

/**
 * POST /api/refresh-stats
 * Force refresh all caches manually / อัปเดต cache ทั้งหมดด้วยตนเอง
 */
router.post('/refresh-stats', refreshStats);

/**
 * POST /api/cache/update
 * Force refresh all caches manually (alias) / อัปเดต cache (alias)
 */
router.post('/cache/update', refreshStats);

// ===================
// ANALYTICS ENDPOINTS / เอนด์พอยต์ Analytics
// ===================

/**
 * GET /api/analytics/trends
 * Get session trends / ดึงแนวโน้มเซสชัน
 */
router.get('/analytics/trends', getTrends);

/**
 * GET /api/analytics/peak-hours
 * Get peak hours data / ดึงข้อมูลช่วงเวลายอดนิยม
 */
router.get('/analytics/peak-hours', getPeakHoursData);

/**
 * GET /api/analytics/top-questions
 * Get top questions / ดึงคำถามยอดนิยม
 */
router.get('/analytics/top-questions', getTopQuestionsData);

/**
 * GET /api/analytics/users
 * Get users analytics / ดึงสถิติผู้ใช้
 */
router.get('/analytics/users', getUsersData);

// ===================
// UPLOAD ENDPOINTS / เอนด์พอยต์อัปโหลด
// ===================

/**
 * POST /api/upload/chats
 * Upload chats.json file for analytics / อัปโหลดไฟล์ chats.json
 */
router.post('/upload/chats', upload.single('chatsFile'), uploadChats);

// ===================
// EXPORT ENDPOINTS / เอนด์พอยต์ส่งออก
// ===================

/**
 * GET /api/export/chats
 * Export JSON storage to file / ส่งออกข้อมูลเป็นไฟล์
 */
router.get('/export/chats', exportChats);

/**
 * GET /api/export/status
 * Get storage status / ดึงสถานะการจัดเก็บ
 */
router.get('/export/status', getStorageStatus);

module.exports = router;
