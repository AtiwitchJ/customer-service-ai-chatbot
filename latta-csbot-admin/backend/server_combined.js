/**
 * MAIN SERVER (Express Entry Point)
 * ==================================
 * Responsibilities: Initialize Express server and mount all service routes
 * หน้าที่หลัก: เริ่มต้น Express server และเชื่อมต่อ routes ของบริการทั้งหมด
 * 
 * Services Structure / โครงสร้างบริการ:
 * 1. RAG Service: File upload & document processing (Supabase + Python)
 *    (บริการ RAG: อัปโหลดไฟล์และประมวลผลเอกสารเพื่อทำ Vector Search)
 * 2. Chat Service: JSON-based chat logs CRUD & Management
 *    (บริการแชท: จัดการ Chat Logs และข้อมูลการสนทนาใน JSON files)
 * 3. Dashboard Service: Analytics, Statistics & Word Frequency
 *    (บริการ Dashboard: คำนวณสถิติ, กราฟ, และความถี่คำ)
 */

const path = require('path');

// Load environment variables from project root
// โหลดตัวแปรสภาพแวดล้อมจากไดเรกทอรีหลักของโปรเจกต์
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// ===================
// IMPORT SERVICES
// นำเข้าโมดูลบริการต่างๆ
// ===================
const ragRouter = require('./src/rag_service/rag_service');
const chatRouter = require('./src/chat_service/chat_service');
const dashboardRouter = require('./src/dashboard_service/dashboard_service');

// ===================
// SERVER CONFIGURATION
// การกำหนดค่า Server
// ===================
const app = express();
const PORT = process.env.PORT;

// ===================
// MIDDLEWARE SETUP
// การตั้งค่า Middleware
// ===================

// ==========================================
// Security Middleware Configuration
// ==========================================

/**
 * Helmet helps secure Express apps by setting various HTTP headers.
 * It provides protection against common web vulnerabilities like:
 * - XSS (Cross-Site Scripting)
 * - Clickjacking
 * - MIME sniffing
 */
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

/**
 * Rate Limiting to prevent Brute-force and DoS attacks.
 * Configured to allow 1000 requests per 15 minutes per IP.
 */
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

/**
 * CORS Configuration
 * Restricted to the frontend URL provided in environment variables.
 * This prevents unauthorized domains from accessing the API.
 */
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON bodies with increased limit for large payloads (e.g. file uploads)
// รองรับการอ่าน JSON body และเพิ่มขนาด limit เพื่อรองรับไฟล์ขนาดใหญ่
app.use(express.json({ limit: '50mb' }));

/**
 * Global Request Logger
 * Captures ALL requests before any routing logic.
 * Useful for debugging incoming traffic.
 * 
 * ตัวบันทึก Log ของ Request แบบ Global
 * จับทุก request ก่อนที่จะเข้าสู่ logic routing ใดๆ
 * มีประโยชน์มากสำหรับการ debug traffic ที่เข้ามา
 */
app.use((req, res, next) => {
    const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    console.log(`🔔 [LOG] ${req.method} ${req.originalUrl}`);

    // Specific debugging for view-related paths
    // Debug เพิ่มเติมสำหรับ path ที่เกี่ยวกับ /view
    if (req.originalUrl.includes('/view')) {
        console.log(`🔍 [VIEW_DEBUG] OriginalUrl: ${req.originalUrl}`);
        console.log(`🔍 [VIEW_DEBUG] Path: ${req.path}`);
        console.log(`🔍 [VIEW_DEBUG] Full: ${fullUrl}`);
    }
    next();
});

/**
 * GLOBAL VIEW HANDLER
 * Catch /api/view requests early to bypass potential nested router issues.
 * This ensures file viewing works consistently across services.
 * 
 * ตัวจัดการ View แบบ Global
 * ดักจับ request /api/view ก่อนเพื่อเลี่ยงปัญหา nested router
 * ช่วยให้การดูไฟล์ทำงานได้ถูกต้องสม่ำเสมอ
 */
app.all(/^\/api\/view\/(.*)/, (req, res, next) => {
    const rawPath = req.originalUrl.split('/api/view/')[1];
    console.log(`🚀 [GLOBAL_VIEW] Caught: ${rawPath}`);

    // Attach rawFilePath to req for the downstream controller to use
    // แนบตัวแปร rawFilePath ไปกับ req เพื่อให้ controller ปลายทางใช้งานต่อได้
    req.rawFilePath = rawPath;
    next();
});

// Serve static files from the current directory
// ให้บริการไฟล์ Static จากไดเรกทอรีปัจจุบัน
app.use(express.static(__dirname));

// ===================
// MOUNT ROUTES
// เชื่อมต่อ Routes เข้ากับระบบ
// ===================
// /api/chats         -> Chat Service (CRUD chat logs)
// /api/overview      -> Dashboard Service (General stats)
// /api/wordfreq      -> Dashboard Service (Word frequency)
// /api/upload        -> RAG Service (File upload)
// /api/files         -> RAG Service (File management)
// /api/view/*        -> RAG Service (File viewer)

app.use('/api', chatRouter);
app.use('/api', dashboardRouter);
app.use('/api', ragRouter);

// ===================
// START SERVER
// เริ่มต้น Server
// ===================
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📁 Services Loaded: Chat, Dashboard, RAG`);
});
