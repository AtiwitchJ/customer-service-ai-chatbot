/**
 * =============================================================================
 * authService.js - Authentication Business Logic
 * =============================================================================
 * 
 * 📍 ใช้โดย: authRouter.js
 * 
 * 🔗 Functions:
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ Function              │ ใช้ใน API            │ ทำอะไร                  │
 * ├────────────────────────────────────────────────────────────────────────┤
 * │ getVerificationStatus │ /auth/check-status   │ ตรวจสอบสถานะ login      │
 * │ performLogin          │ /auth/login          │ ยืนยันตัวตน + บันทึก Redis│
 * └────────────────────────────────────────────────────────────────────────┘
 * 
 * 🔒 Security: OWASP A03:2021 (Input Validation), A07:2021 (Auth Failures)
 */

const axios = require('axios');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../../../.env') });

// =============================================================================
// Dependencies
// =============================================================================
const { redisDbVerify } = require('../config/db');

// =============================================================================
// Configuration
// =============================================================================
const EXTERNAL_AUTH_API = process.env.EXTERNAL_AUTH_API;
const MAX_LOGIN_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5');
const BLOCK_DURATION_MS = parseInt(process.env.BLOCK_DURATION_MS || '300000'); // 5 นาที
const AUTH_BYPASS_MODE = process.env.AUTH_BYPASS_MODE === 'true';
const REDIS_SESSION_TTL = parseInt(process.env.REDIS_SESSION_TTL || '86400', 10);

// =============================================================================
// Functions
// =============================================================================

/**
 * ดึงสถานะการยืนยันตัวตนจาก Redis
 * 
 * @param {string} sessionId - Session ID ของผู้ใช้
 * @returns {object} { status: 'verified'|'unverified'|'error', user?: object }
 * 
 * 📍 ใช้ใน: POST /auth/check-status
 * 📍 เรียกจาก: Frontend checkLoginStatus() ตอนเปิดหน้าเว็บ
 * 
 * 🔍 Logic:
 *    1. ดึงข้อมูลจาก Redis key: verified:{sessionId}
 *    2. ถ้า verified === 'true' → return { status: 'verified', user }
 *    3. ถ้าไม่มีข้อมูล หรือ verified !== 'true' → return { status: 'unverified' }
 */
async function getVerificationStatus(sessionId) {
    try {
        const redisKey = `verified:${sessionId}`;
        const data = await redisDbVerify.hgetall(redisKey);

        // ❌ ไม่มีข้อมูล หรือ verified !== 'true'
        if (!data || Object.keys(data).length === 0 || data.verified !== 'true') {
            return { status: 'unverified' };
        }

        // ✅ verified === 'true' → ส่งข้อมูล user กลับ
        const { verified, blockedUntil, ...userData } = data;
        return { status: 'verified', user: userData };

    } catch (err) {
        console.error('Redis Error:', err);
        return { status: 'error' };
    }
}

/**
 * ทำการ Login พร้อมติดตามจำนวนครั้งที่ล้มเหลว
 * 
 * @param {string} sessionId - Session ID
 * @param {string} CardID - รหัสบัตรประชาชน
 * @param {string} Email - อีเมล
 * @returns {object} { status: 'success'|'fail'|'blocked'|'error', message?, user? }
 * 
 * 📍 ใช้ใน: POST /auth/login
 * 📍 เรียกจาก: Frontend handleLogin() ตอนกดปุ่ม Login
 * 
 * 🔍 Logic:
 *    1. เช็คว่าถูก block หรือไม่ (blockedUntil > Date.now())
 *    2. เรียก External Auth API เพื่อตรวจสอบ CardID + Email
 *    3. ถ้าสำเร็จ → บันทึก verified: 'true' ลง Redis
 *    4. ถ้าล้มเหลว → เพิ่ม limit +1, ถ้า >= 5 ครั้ง → block 5 นาที
 */
async function performLogin(sessionId, CardID, Email) {
    console.log(`DEBUG: performLogin called for session: ${sessionId}, CardID: ${CardID}, Email: ${Email}`);
    
    // 🧪 BYPASS MODE: สำหรับการทดสอบ - ข้าม External Auth API
    if (AUTH_BYPASS_MODE) {
        console.log('[AUTH BYPASS] Mode enabled - skipping external authentication');
        try {
            const redisKey = `verified:${sessionId}`;
            
            // สร้าง mock user data
            const mockUser = {
                CardID: CardID,
                Email: Email,
                Name: 'Test User',
                Department: 'Testing',
                Position: 'Tester'
            };
            
            const redisData = {
                verified: 'true',
                blockedUntil: '0',
                ...mockUser
            };

            // แปลงค่าทั้งหมดเป็น String สำหรับ Redis
            for (const key in redisData) {
                redisData[key] = String(redisData[key] || '');
            }

            await redisDbVerify.hset(redisKey, redisData);
            await redisDbVerify.expire(redisKey, REDIS_SESSION_TTL);

            console.log('[AUTH BYPASS] Login successful for:', Email);
            return { status: 'success', user: mockUser };
        } catch (err) {
            console.error('[AUTH BYPASS] Redis Error:', err.message);
            return { status: 'error', message: 'ข้อผิดพลาดในการบันทึกข้อมูล' };
        }
    }
    
    // 🔐 NORMAL MODE: ใช้ External Auth API
    try {
        const redisKey = `verified:${sessionId}`;
        const currentData = await redisDbVerify.hgetall(redisKey);
        const blockedUntil = parseInt(currentData.blockedUntil || '0');

        // 🚫 Step 1: เช็คว่าถูก Block หรือไม่
        if (blockedUntil > Date.now()) {
            const remainingSeconds = Math.ceil((blockedUntil - Date.now()) / 1000);
            return {
                status: 'blocked',
                message: `บัญชีถูกระงับชั่วคราว ลองใหม่ใน ${remainingSeconds} วินาที`
            };
        }

        // 🔗 Step 2: เรียก External Auth API
        const response = await axios.post(EXTERNAL_AUTH_API, { CardID, Email }, { timeout: 5000 });
        const result = response.data;

        // ✅ Step 3: Login สำเร็จ
        if (result.status === 'success') {
            const redisData = {
                verified: 'true',
                blockedUntil: 0,
                ...result.user
            };

            // แปลงค่าทั้งหมดเป็น String สำหรับ Redis
            for (const key in redisData) {
                redisData[key] = String(redisData[key] || '');
            }

            await redisDbVerify.hset(redisKey, redisData);
            await redisDbVerify.expire(redisKey, REDIS_SESSION_TTL);

            return { status: 'success', user: result.user };
        }

        // ❌ Step 4: Login ล้มเหลว → เพิ่ม limit
        const newLimit = await redisDbVerify.hincrby(redisKey, 'limit', 1);
        await redisDbVerify.hset(redisKey, 'verified', 'false');

        // 🚫 ถ้าล้มเหลว >= 5 ครั้ง → Block
        if (newLimit >= MAX_LOGIN_ATTEMPTS) {
            await redisDbVerify.hset(redisKey, 'blockedUntil', Date.now() + BLOCK_DURATION_MS);
            return {
                status: 'blocked',
                message: `ความพยายามล้มเหลวมากเกินไป บัญชีถูกระงับ 5 นาที`
            };
        }

        await redisDbVerify.expire(redisKey, 86400);

        // ถ้า External API ส่ง blocked มา
        if (result.status === 'blocked') {
            return { status: 'blocked', message: 'บัญชีถูกระงับโดยระบบ' };
        }

        return {
            status: 'fail',
            message: `ข้อมูลไม่ถูกต้อง (${newLimit}/${MAX_LOGIN_ATTEMPTS})`
        };

    } catch (err) {
        console.error('Auth API Error:', err.message);
        if (err.code === 'ECONNREFUSED') {
            return { status: 'error', message: 'เซิร์ฟเวอร์ยืนยันไม่พร้อม' };
        }
        return { status: 'error', message: 'ข้อผิดพลาดในการยืนยัน' };
    }
}

// =============================================================================
// Exports
// =============================================================================
module.exports = {
    getVerificationStatus,
    performLogin
};
