const Redis = require('ioredis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../../.env') });

const CHAT_HISTORY_LIMIT = parseInt(process.env.REDIS_CHAT_HISTORY_LIMIT || '6', 10);
const CHAT_HISTORY_EXPIRE = parseInt(process.env.REDIS_CHAT_HISTORY_EXPIRE || '3600', 10);

const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_MEMORY_DB
});

redis.on('connect', () => console.log(`✅ Connected to Redis DB ${process.env.REDIS_MEMORY_DB}`));
redis.on('error', (err) => console.error('❌ Redis Error:', err));

/**
 * ดึงประวัติแชทของ session
 * @param {string} sessionId - Session ID
 * @param {number} limit - จำนวนข้อความที่ต้องการ (default: 6)
 * @returns {string} - ประวัติแชทในรูปแบบข้อความ
 */
async function getChatHistory(sessionId, limit = CHAT_HISTORY_LIMIT) {
    const key = `chat:${sessionId}`;
    try {
        const history = await redis.lrange(key, 0, limit - 1);
        return history.reverse().join('\n');
    } catch (error) {
        console.error(`❌ Redis getChatHistory Error (${sessionId}):`, error.message);
        return "";
    }
}

/**
 * บันทึกข้อความลงประวัติแชท
 * @param {string} sessionId - Session ID
 * @param {string} userText - ข้อความจากผู้ใช้
 * @param {string} aiText - ข้อความตอบกลับจาก AI
 */
async function saveChatHistory(sessionId, userText, aiText) {
    const key = `chat:${sessionId}`;
    try {
        await redis.lpush(key, `AI: ${aiText}`);
        await redis.lpush(key, `User: ${userText}`);
        await redis.ltrim(key, 0, CHAT_HISTORY_LIMIT - 1);
        await redis.expire(key, CHAT_HISTORY_EXPIRE);
    } catch (error) {
        console.error("Redis Save Error:", error.message);
    }
}

module.exports = { 
    getChatHistory, 
    saveChatHistory
};
