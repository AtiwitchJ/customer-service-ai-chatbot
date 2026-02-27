/**
 * =============================================================================
 * authRouter.js - Authentication Routes
 * =============================================================================
 * 
 * 📍 Mount Path: app.use('/', authRouter) ใน server.js
 * 📍 Router เขียน full path เช่น '/auth/login' เพื่อให้อ่านง่าย
 * 
 * 🔗 Routes ในไฟล์นี้:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Method │ Full Path          │ ต้อง Login │ ใช้ตอนไหน                    │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ POST   │ /auth/check-status │ ❌ ไม่ต้อง  │ เปิดหน้าเว็บ (ตรวจสอบสถานะ)   │
 * │ POST   │ /auth/login        │ ❌ ไม่ต้อง  │ กดปุ่ม Login (ยืนยันตัวตน)    │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * 📍 Business Logic อยู่ใน: authService.js
 * 
 * 🔒 Security: OWASP A03:2021 (Input Validation), A09:2021 (Security Logging)
 */

const express = require('express');
const router = express.Router();

// =============================================================================
// Dependencies
// =============================================================================
const authService = require('../services/authService');
const {
    validateSessionId,
    validateCardID,
    validateEmail,
    logSecurityEvent
} = require('../utils/validators');

// =============================================================================
// Routes
// =============================================================================

/**
 * POST /auth/check-status
 * 
 * 📍 ใช้ตอนไหน: Frontend เรียกตอนเปิดหน้าเว็บ (checkLoginStatus())
 * 📍 จุดประสงค์: ตรวจสอบว่า sessionId นี้ login แล้วหรือยัง
 * 
 * Request Body:
 *   { sessionId: string }
 * 
 * Response:
 *   ✅ Login แล้ว:    { status: 'verified', user: { CardID, Email, Name, ... } }
 *   ❌ ยังไม่ Login:  { status: 'unverified' }
 *   ❌ Error:        { status: 'error' }
 * 
 * 🔍 Flow:
 *   Frontend เปิดหน้าเว็บ
 *       ↓
 *   POST /auth/check-status { sessionId }
 *       ↓
 *   authService.getVerificationStatus() → ดึงจาก Redis
 *       ↓
 *   ถ้า verified → แสดงหน้าแชท
 *   ถ้า unverified → แสดง Login form
 */
router.post('/auth/check-status', async (req, res) => {
    const { sessionId } = req.body;

    // Input Validation
    if (!validateSessionId(sessionId)) {
        logSecurityEvent('INVALID_SESSION_FORMAT', { ip: req.ip });
        return res.status(400).json({ status: 'error', message: 'Invalid sessionId format' });
    }

    const result = await authService.getVerificationStatus(sessionId);

    if (result.status === 'error') {
        return res.status(500).json(result);
    }

    return res.json(result);
});

/**
 * POST /auth/login
 * 
 * 📍 ใช้ตอนไหน: Frontend เรียกตอนกดปุ่ม Login (handleLogin())
 * 📍 จุดประสงค์: ยืนยันตัวตนด้วย CardID + Email
 * 
 * Request Body:
 *   { sessionId: string, CardID: string, Email: string }
 * 
 * Response:
 *   ✅ สำเร็จ:   { status: 'success', user: { ... } }  → 200
 *   ❌ ล้มเหลว: { status: 'fail', message: '...' }    → 401
 *   🚫 ถูก Block: { status: 'blocked', message: '...' } → 403
 *   ❌ Error:   { status: 'error', message: '...' }   → 503
 * 
 * 🔍 Flow:
 *   User กรอก CardID + Email → กด Login
 *       ↓
 *   POST /auth/login { sessionId, CardID, Email }
 *       ↓
 *   authService.performLogin() → เรียก External Auth API
 *       ↓
 *   ถ้าสำเร็จ → บันทึก verified:'true' ลง Redis
 *   ถ้าล้มเหลว → เพิ่ม limit, ถ้า >= 5 → block
 */
router.post('/auth/login', async (req, res) => {
    const { sessionId, CardID, Email } = req.body;
    console.log(`DEBUG: Backend /auth/login hit. Session: ${sessionId}, CardID: ${CardID}, Email: ${Email}`);

    // Input Validation
    if (!validateSessionId(sessionId)) {
        logSecurityEvent('INVALID_SESSION_FORMAT', { ip: req.ip });
        return res.status(400).json({ status: 'error', message: 'Invalid sessionId format' });
    }

    if (!validateCardID(CardID)) {
        logSecurityEvent('INVALID_CARDID_FORMAT', { ip: req.ip, sessionId });
        return res.status(400).json({ status: 'error', message: 'Invalid CardID format' });
    }

    if (!validateEmail(Email)) {
        logSecurityEvent('INVALID_EMAIL_FORMAT', { ip: req.ip, sessionId });
        return res.status(400).json({ status: 'error', message: 'Invalid Email format' });
    }

    // Perform Login
    const result = await authService.performLogin(sessionId, CardID, Email);

    // Security Logging & Response
    switch (result.status) {
        case 'success':
            logSecurityEvent('LOGIN_SUCCESS', { ip: req.ip, sessionId });
            return res.status(200).json(result);

        case 'blocked':
            logSecurityEvent('LOGIN_BLOCKED', { ip: req.ip, sessionId });
            return res.status(403).json(result);

        case 'fail':
            logSecurityEvent('LOGIN_FAILED', { ip: req.ip, sessionId });
            return res.status(401).json(result);

        case 'error':
        default:
            return res.status(503).json(result);
    }
});

module.exports = router;
