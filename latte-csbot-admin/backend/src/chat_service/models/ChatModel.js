/**
 * Chat Model (Mongoose Schema)
 * =============================
 * MongoDB schema for chat sessions / Schema สำหรับเก็บข้อมูลแชทใน MongoDB
 * 
 * NOTE: This model is kept for backward compatibility / โมเดลนี้เก็บไว้เพื่อความเข้ากันได้กับเวอร์ชันก่อน
 * Currently using JsonChatModel instead / ปัจจุบันใช้ JsonChatModel แทน
 */

const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
    sessionId: String,           // Unique session identifier / รหัสเซสชัน
    messages: [{
        msgId: String,           // Message ID / รหัสข้อความ
        sender: String,          // 'user' or 'bot' / ผู้ส่ง
        text: String,            // Message content / เนื้อหาข้อความ
        time: Date,              // Message time / เวลาส่ง
        createdAt: Date,         // Creation time / เวลาสร้าง
        feedback: String         // 'like' or 'dislike' / ความพึงพอใจ
    }],
    updatedAt: Date              // Last update time / เวลาอัปเดตล่าสุด
}, { collection: 'chats' });

// Index for faster sorting and searching / Index เพื่อความเร็วในการค้นหา
ChatSchema.index({ updatedAt: -1 });
ChatSchema.index({ 'messages.text': 'text' });

const ChatModel = mongoose.models.Chat || mongoose.model('Chat', ChatSchema);

module.exports = ChatModel;
