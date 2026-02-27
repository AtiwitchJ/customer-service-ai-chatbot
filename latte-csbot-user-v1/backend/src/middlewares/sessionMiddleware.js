// sessionMiddleware.js: Session Verification Middleware
// A01:2021 - Broken Access Control Prevention
const { redisDbVerify } = require('../config/db');

const REDIS_SESSION_TTL = parseInt(process.env.REDIS_SESSION_TTL || '86400', 10);

/**
 * Middleware to verify session is authenticated
 * ตรวจสอบว่า session ได้รับการยืนยันแล้วหรือไม่
 */
const verifySession = async (req, res, next) => {
    // Get sessionId from body, query, or params (use optional chaining for GET requests)
    const sessionId = req.body?.sessionId || req.query?.sessionId || req.params?.sessionId;

    if (!sessionId) {
        console.log('[SECURITY] SESSION_MISSING:', { ip: req.ip, path: req.path });
        return res.status(401).json({
            status: 'error',
            message: 'Session required / ต้องระบุ Session'
        });
    }

    // Validate sessionId format
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(sessionId)) {
        console.log('[SECURITY] INVALID_SESSION_FORMAT:', { ip: req.ip, path: req.path });
        return res.status(400).json({
            status: 'error',
            message: 'Invalid session format / รูปแบบ Session ไม่ถูกต้อง'
        });
    }

    try {
        const redisKey = `verified:${sessionId}`;
        const data = await redisDbVerify.hgetall(redisKey);

        // Check if session exists and is verified
        if (!data || Object.keys(data).length === 0 || data.verified !== 'true') {
            console.log('[SECURITY] SESSION_UNVERIFIED:', {
                ip: req.ip,
                sessionId,
                path: req.path
            });
            return res.status(401).json({
                status: 'error',
                message: 'Session not verified. Please login. / Session ยังไม่ได้ยืนยัน กรุณา Login'
            });
        }

        // Check if session is blocked
        const blockedUntil = parseInt(data.blockedUntil || '0');
        if (blockedUntil > Date.now()) {
            console.log('[SECURITY] SESSION_BLOCKED:', { ip: req.ip, sessionId });
            return res.status(403).json({
                status: 'error',
                message: 'Session blocked / Session ถูกระงับ'
            });
        }

        // Attach user data to request for use in routes
        req.verifiedUser = {
            sessionId,
            ...data
        };

        // Refresh session expiry on activity
        await redisDbVerify.expire(redisKey, REDIS_SESSION_TTL);

        next();
    } catch (err) {
        console.error('[ERROR] Session verification failed:', err.message);
        return res.status(500).json({
            status: 'error',
            message: 'Session verification failed / การตรวจสอบ Session ล้มเหลว'
        });
    }
};

module.exports = { verifySession };
