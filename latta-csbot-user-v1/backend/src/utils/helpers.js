// src/utils/helpers.js
const ChatModel = require('../models/ChatModel');
const { redisDbChat, CHAT_TTL_SECONDS } = require('../config/db'); 

/**
 * ฟังก์ชันสำหรับส่งข้อความ Chatbot ไปยัง Frontend ผ่าน WebSocket
 * ต้องส่ง wss instance เข้ามาจาก caller (เช่น chatRouter)
 * @param {object} wss - WebSocket Server Instance
 * @param {string} sessionId - ID ของ Session ที่ต้องการส่งข้อความถึง
 * @param {string} messageText - ข้อความที่ต้องการส่ง
 * @param {boolean} isError - เป็นข้อความ Error หรือไม่
 * @param {string | null} msgId - ID ของข้อความ
 */
function sendBotMessageToFrontend(wss, sessionId, messageText, isError = false, msgId = null) {
  // ฟังก์ชันนี้จะถูกเรียกโดย Service และใช้ wssInstance ที่ถูกกำหนดใน Route
  const wssClients = () => Array.from(wss.clients);
  
  wssClients().forEach(client => {
    // ตรวจสอบสถานะการเชื่อมต่อและ sessionId
    if (client.readyState === require('ws').OPEN && client.sessionId === sessionId) {
      client.send(JSON.stringify({
        type: isError ? 'chat_error' : 'chat_reply',
        reply: messageText,
        msgId: msgId
      }));
    }
  });
}

/**
 * Helper: บันทึกข้อมูล Chat เข้าสู่ MongoDB
 * @param {object} data - ข้อมูลข้อความที่ต้องการบันทึก (ต้องมี sessionId และข้อมูล msg)
 */
async function saveChatToMongo(data) {
  try {
    const { sessionId, ...msgData } = data;
    await ChatModel.findOneAndUpdate(
      { sessionId: sessionId },
      {
        $push: { messages: msgData },
        $set: { updatedAt: new Date() } 
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    // 💡 หากเกิด error อื่นที่ไม่ใช่ duplicate key, ให้แสดง error นั้น
    console.error('❌ Failed to save chat to Mongo:', err.message);
  }
}

/**
 * Helper: บันทึกข้อความลงใน Redis (ใช้สำหรับ Chat History ชั่วคราว)
 * @param {object} redisDb0 - Redis Client (DB 0)
 * @param {object} chatData - ข้อมูลข้อความ
 */
async function saveChatToRedis(redisDb0, chatData) {
    const listKey = `chat:${chatData.sessionId}`;
    await redisDb0.rpush(listKey, JSON.stringify(chatData));
    await redisDb0.ltrim(listKey, -100, -1);
    await redisDb0.expire(listKey, CHAT_TTL_SECONDS);
}


module.exports = {
    sendBotMessageToFrontend,
    saveChatToMongo,
    saveChatToRedis,
};