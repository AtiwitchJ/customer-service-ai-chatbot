/**
 * Chat API Server Entry Point
 * ===========================
 * Responsibilities:
 * - Main Express server for the Chat Application.
 * - Handles Authentication and Real-time Chat via WebSocket.
 * - Implements Security Middleware (Helmet, CORS, Rate Limiting).
 * 
 * หน้าที่หลัก:
 * - เริ่มต้น Express server สำหรับ Chat Application
 * - จัดการระบบ Authentication และ Real-time Chat ผ่าน WebSocket
 * - ติดตั้งระบบความปลอดภัย (Helmet, CORS, Rate Limiting)
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const { Server } = require('ws');
const path = require('path');
const morgan = require('morgan');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

require('./src/config/db');
const { generalLimiter, authLimiter, chatLimiter } = require('./src/middlewares/rateLimit');
const authRouter = require('./src/routes/authRouter');
const chatRouter = require('./src/routes/chatRouter');

const app = express();

// Enable trust proxy for Nginx (needed for rate limiting and req.ip)
// เปิดใช้งาน trust proxy สำหรับ Nginx (จำเป็นสำหรับ rate limiting และ req.ip)
app.set('trust proxy', 1);

// ==========================================
// OWASP Security Middleware
// ==========================================

// 1. Disable X-Powered-By header
// 1. ปิดการใช้งาน header X-Powered-By
app.disable('x-powered-by');

// 2. CORS Configuration - MUST BE FIRST (A05:2021 Security Misconfiguration)
// 2. การกำหนดค่า CORS - ต้องมาก่อนเสมอ (A05:2021 Security Misconfiguration)
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin in development (Postman, curl, etc.)
    // อนุญาต request ที่ไม่มี origin ในโหมด development (Postman, curl, ฯลฯ)
    if (!origin) {
      // Allow requests with no origin (e.g., health checks, server-to-server, Postman)
      // even in production to prevent health check failures.
      return callback(null, true);
    }

    // Auto-allow localhost in development
    // อนุญาต localhost อัตโนมัติในโหมด development
    if (process.env.NODE_ENV === 'development') {
      if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        return callback(null, true);
      }
    }

    if (allowedOrigins.indexOf(origin) === -1) {
      console.warn(`[SECURITY] CORS blocked origin: ${origin}`);
      return callback(new Error('CORS policy violation'), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400
}));

// 3. Helmet - Security Headers (A05:2021 Security Misconfiguration)
// 3. Helmet - Security Headers (A05:2021 Security Misconfiguration)
// ZAP Fix: Content Security Policy, X-Content-Type-Options, HSTS
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "wss:", "ws:", "https://api.ipify.org", ...allowedOrigins],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  // ZAP Fix: HSTS - HTTP Strict Transport Security
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  // ZAP Fix: X-Content-Type-Options
  noSniff: true,
  // ZAP Fix: X-XSS-Protection
  xssFilter: true,
  // ZAP Fix: Referrer-Policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // ZAP Fix: X-Frame-Options
  frameguard: { action: 'sameorigin' },
  // ZAP Fix: Hide X-Powered-By
  hidePoweredBy: true,
  // Permissions Policy
  permittedCrossDomainPolicies: { permittedPolicies: 'none' }
}));

// 4. Request Logging (A09:2021 Security Logging and Monitoring Failures)
// 4. การบันทึก Log ของ Request (A09:2021 Security Logging and Monitoring Failures)
app.use(morgan('combined'));

// 5. Body Parser with size limits (A03:2021 Injection Prevention)
// 5. Body Parser พร้อมจำกัดขนาด (A03:2021 Injection Prevention)
app.use(bodyParser.json({ limit: '10kb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10kb' }));

// 6. Rate Limiting (A04:2021 Insecure Design)
// 6. การจำกัดอัตราการเรียกใช้งาน (Rate Limiting) (A04:2021 Insecure Design)
app.use(generalLimiter);
app.use('/auth/login', authLimiter);
app.use('/webhook/send', chatLimiter);
app.use('/chat/feedback', chatLimiter);

// Routes

// GET /config - Get API configuration (called on web open)
// GET /config - ดึงค่า configuration ของ API (เรียกเมื่อเปิดเว็บ)
app.get('/config', (req, res) => {
    res.json({
    API_BASE: process.env.API_BASE,
    WEBHOOK_URL: `${process.env.API_BASE}/webhook/send`,
    // Timeouts for frontend
    AFK_TIMEOUT_MS: parseInt(process.env.AFK_TIMEOUT_MS || '300000', 10),
    AFK_WARNING_MS: 30000, // 30 seconds before AFK timeout
    BACKGROUND_TIMEOUT_MS: parseInt(process.env.BACKGROUND_TIMEOUT_MS || '180000', 10),
    WS_RECONNECT_DELAY_MS: parseInt(process.env.WS_RECONNECT_DELAY_MS || '5000', 10)
  });
});

// Use path '/' because router writes full path e.g. '/auth/login', '/webhook/send'
// ใช้ path '/' เนื่องจาก router เขียน path เต็มไว้แล้ว เช่น '/auth/login', '/webhook/send'
app.use('/', authRouter);
app.use('/', chatRouter);

// 404 Handler
app.use((_req, res) => {
  res.status(404).json({ status: 'error', message: 'Not Found' });
});

// Global Error Handler (A09:2021 - Don't leak error details) - MUST BE LAST
// ตัวจัดการ Error รวม (A09:2021 - ไม่เปิดเผยรายละเอียด error) - ต้องอยู่ท้ายสุด
app.use((err, _req, res, _next) => {
  console.error(`[ERROR] ${err.message}`);

  const message = process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : err.message;

  res.status(err.status || 500).json({
    status: 'error',
    message
  });
});

// Server & WebSocket
// เซิร์ฟเวอร์และ WebSocket
const PORT = process.env.PORT;
const server = app.listen(PORT, () => console.log(`✅ Chat API running on port ${PORT}`));
let wss = new Server({ server });

chatRouter.setWss(wss);

wss.on('connection', (ws) => {
  console.log('🔌 WS Connected');
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'init') {
        ws.sessionId = msg.sessionId;
        console.log(`✅ WS Init: ${msg.sessionId}`);
      }
    } catch (e) {
      console.error('WS message parse error:', e);
    }
  });
  ws.on('close', () => console.log('❌ WS Disconnected'));
});

console.log(`✅ WebSocket Server started on port ${PORT}`);