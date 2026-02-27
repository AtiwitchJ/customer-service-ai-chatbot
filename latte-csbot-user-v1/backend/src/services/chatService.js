/**
 * Chat Service
 * ============
 * Responsibilities:
 * - Handle user messages: Save to DB, Cache in Redis, and pushes to BullMQ for AI processing.
 * - Handle bot replies: Broadcasts to WebSocket and saves to DB.
 * - Manage Chat History: Fetch from Redis (Hot) or MongoDB (Cold).
 * - Handle Feedback: Updates feedback status in both DB and Redis.
 * 
 * หน้าที่หลัก:
 * - จัดการข้อความผู้ใช้: บันทึกลงฐานข้อมูล, Cache บน Redis, และส่งเข้า Queue บอท
 * - จัดการข้อความตอบกลับ: ส่งไปยัง WebSocket และบันทึกลงฐานข้อมูล
 * - จัดการประวัติแชท: ดึงข้อมูลจาก Redis (ล่าสุด) หรือ MongoDB (ย้อนหลัง)
 * - จัดการ Feedback: อัปเดตสถานะ (Like/Dislike) ในทั้ง DB และ Redis
 */

const ChatModel = require('../models/ChatModel');
const { redisDbChat, CHAT_TTL_SECONDS } = require('../config/db');

// จัดการข้อความจากผู้ใช้
exports.handleUserMessage = async (payload, chatQueue) => {
    const { sessionId, text, sender, time } = payload;
    const msgId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 1. ส่งเข้า Queue (BullMQ)
    await chatQueue.add('user-message', { ...payload, msgId }, {
        removeOnComplete: true,
        removeOnFail: 100
    });

    // 2. บันทึกลง MongoDB
    await ChatModel.updateOne(
        { sessionId },
        {
            $push: { messages: { msgId, sender, text, time } },
            $setOnInsert: { sessionId } // ถ้ายังไม่มี session ให้สร้างใหม่
        },
        { upsert: true }
    );

    // 3. บันทึกลง Redis (Cache)
    const redisKey = `chat_history:${sessionId}`;
    const msgObject = JSON.stringify({ msgId, sender, text, time });
    await redisDbChat.rpush(redisKey, msgObject);
    await redisDbChat.expire(redisKey, CHAT_TTL_SECONDS);
};

// จัดการข้อความตอบกลับจาก Bot
exports.handleBotReply = async (payload, wsSender) => {
    const { sessionId, replyText, errorMessage, image_urls } = payload;
    const text = errorMessage || replyText;
    const isError = !!errorMessage;
    const msgId = `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const time = new Date().toISOString();

    // 1. ส่ง WebSocket ไปหน้าเว็บ (รวม image_urls ด้วย)
    if (wsSender) {
        wsSender(sessionId, text, isError, msgId, image_urls || []);
    }

    // 2. บันทึกลง MongoDB (รวม image_urls ไว้ใน message object)
    await ChatModel.updateOne(
        { sessionId },
        {
            $push: { messages: { msgId, sender: 'bot', text, time, image_urls: image_urls || [] } }
        },
        { upsert: true }
    );

    // 3. บันทึกลง Redis
    const redisKey = `chat_history:${sessionId}`;
    const msgObject = JSON.stringify({ msgId, sender: 'bot', text, time, image_urls: image_urls || [] });
    console.log(`💾 [Redis] Saving to ${redisKey}:`, msgObject);
    await redisDbChat.rpush(redisKey, msgObject);
    await redisDbChat.expire(redisKey, CHAT_TTL_SECONDS);
};

// ดึงประวัติการแชท
exports.getChatHistory = async (sessionId) => {
    // ลองดึงจาก Redis ก่อน
    const redisKey = `chat_history:${sessionId}`;
    const cachedMessages = await redisDbChat.lrange(redisKey, 0, -1);

    if (cachedMessages && cachedMessages.length > 0) {
        console.log(`📖 [History] Loaded ${cachedMessages.length} msgs from Redis`);
        const parsed = cachedMessages.map(msg => JSON.parse(msg));
        const hasImages = parsed.filter(m => m.image_urls && m.image_urls.length > 0).length;
        console.log(`   📸 Found ${hasImages} msgs with images in Redis`);
        return parsed;
    }

    // ถ้าไม่มีใน Redis ดึงจาก MongoDB
    const chatDoc = await ChatModel.findOne({ sessionId });
    return chatDoc ? chatDoc.messages : [];
};

// บันทึก Feedback
exports.recordFeedback = async (sessionId, msgId, action) => {
    // 1. อัปเดต MongoDB (เพื่อความชัวร์ในการเก็บข้อมูลระยะยาว)
    await ChatModel.updateOne(
        { sessionId, "messages.msgId": msgId },
        { $set: { "messages.$.feedback": action } }
    );

    // 2. อัปเดต Redis (ส่วนสำคัญที่ทำให้รีเฟรชแล้วไม่หาย)
    const redisKey = `chat_history:${sessionId}`;

    // ดึงข้อความทั้งหมดใน List มาเพื่อหา index ของข้อความที่ต้องการอัปเดต
    const messages = await redisDbChat.lrange(redisKey, 0, -1);

    if (messages && messages.length > 0) {
        for (let i = 0; i < messages.length; i++) {
            let msgObj = JSON.parse(messages[i]);

            // เจอข้อความที่ตรงกัน
            if (msgObj.msgId === msgId) {
                // อัปเดตค่า feedback
                msgObj.feedback = action;

                // บันทึกกลับลงไปใน Redis ที่ index เดิม (LSET)
                await redisDbChat.lset(redisKey, i, JSON.stringify(msgObj));

                // ต่ออายุ Cache เพื่อไม่ให้หมดอายุก่อนกำหนด
                await redisDbChat.expire(redisKey, CHAT_TTL_SECONDS);
                break; // หยุดลูปเมื่อเจอแล้ว
            }
        }
    }
};