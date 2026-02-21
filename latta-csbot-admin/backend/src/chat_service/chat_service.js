/**
 * CHAT SERVICE MODULE
 * ====================
 * Main entry point for chat service / จุดเริ่มต้นหลักของ chat service
 * 
 * NOTE: Uses JSON-based storage instead of MongoDB / ใช้ JSON storage แทน MongoDB
 * Data stored in /backend/data/chats/sessions/ / ข้อมูลเก็บใน /backend/data/chats/sessions/
 */

const express = require('express');
const chatRoutes = require('./routes/chatRoutes');

// Load environment variables / โหลดตัวแปรสภาพแวดล้อม
require('dotenv').config();

const router = express.Router();

// Mount routes / ติดตั้ง routes
router.use('/', chatRoutes);

module.exports = router;
