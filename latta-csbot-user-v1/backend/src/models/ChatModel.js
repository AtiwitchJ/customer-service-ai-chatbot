// src/models/Chat.js
const mongoose = require('mongoose');

// --- MongoDB Schema (1 Session = 1 Document) ---
const chatSchema = new mongoose.Schema({
    // sessionId ถูกตั้งให้เป็น index แต่ไม่ได้ถูกตั้งให้เป็น unique: true ในเวอร์ชันนี้
    sessionId: { type: String, required: true, index: true },
    messages: [{
        msgId: String, // ถูกต้องแล้ว: ไม่มี unique: true 
        sender: String,
        text: String,
        image_urls: [String], // Added to persist images
        time: String,
        feedback: String,
        createdAt: { type: Date, default: Date.now }
    }],
    updatedAt: { type: Date, default: Date.now }
});

const ChatModel = mongoose.model('Chat', chatSchema);

module.exports = ChatModel;