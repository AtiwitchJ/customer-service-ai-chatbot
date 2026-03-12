/**
 * =============================================================================
 * authService.js - Authentication Business Logic (Original: CardID+Email)
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
 */
async function getVerificationStatus(sessionId) {
    try {
        const redisKey = `verified:${sessionId}`;
        const data = await redisDbVerify.hgetall(redisKey);

        if (!data || Object.keys(data).length === 0 || data.verified !== 'true') {
            return { status: 'unverified' };
        }

        const { verified, blockedUntil, ...userData } = data;
        return { status: 'verified', user: userData };

    } catch (err) {
        console.error('Redis Error:', err);
        return { status: 'error' };
    }
}

/**
 * ทำการ Login พร้อมติดตามจำนวนครั้งที่ล้มเหลว (CardID + Email)
 */
async function performLogin(sessionId, CardID, Email) {
    if (AUTH_BYPASS_MODE) {
        try {
            const redisKey = `verified:${sessionId}`;
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
            for (const key in redisData) {
                redisData[key] = String(redisData[key] || '');
            }
            await redisDbVerify.hset(redisKey, redisData);
            await redisDbVerify.expire(redisKey, REDIS_SESSION_TTL);
            return { status: 'success', user: mockUser };
        } catch (err) {
            console.error('[AUTH BYPASS] Redis Error:', err.message);
            return { status: 'error', message: 'ข้อผิดพลาดในการบันทึกข้อมูล' };
        }
    }

    try {
        const redisKey = `verified:${sessionId}`;
        const currentData = await redisDbVerify.hgetall(redisKey);
        const blockedUntil = parseInt(currentData.blockedUntil || '0');

        if (blockedUntil > Date.now()) {
            const remainingSeconds = Math.ceil((blockedUntil - Date.now()) / 1000);
            return {
                status: 'blocked',
                message: `บัญชีถูกระงับชั่วคราว ลองใหม่ใน ${remainingSeconds} วินาที`
            };
        }

        const response = await axios.post(EXTERNAL_AUTH_API, { CardID, Email }, { timeout: 5000 });
        const result = response.data;

        if (result.status === 'success') {
            const redisData = {
                verified: 'true',
                blockedUntil: 0,
                ...result.user
            };
            for (const key in redisData) {
                redisData[key] = String(redisData[key] || '');
            }
            await redisDbVerify.hset(redisKey, redisData);
            await redisDbVerify.expire(redisKey, REDIS_SESSION_TTL);
            return { status: 'success', user: result.user };
        }

        const newLimit = await redisDbVerify.hincrby(redisKey, 'limit', 1);
        await redisDbVerify.hset(redisKey, 'verified', 'false');

        if (newLimit >= MAX_LOGIN_ATTEMPTS) {
            await redisDbVerify.hset(redisKey, 'blockedUntil', Date.now() + BLOCK_DURATION_MS);
            return {
                status: 'blocked',
                message: `ความพยายามล้มเหลวมากเกินไป บัญชีถูกระงับ 5 นาที`
            };
        }

        await redisDbVerify.expire(redisKey, 86400);

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

module.exports = {
    getVerificationStatus,
    performLogin
};
