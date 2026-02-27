/**
 * UPLOAD CONTROLLER
 * =================
 * Handles file uploads for chats data / จัดการการอัพโหลดไฟล์สำหรับข้อมูล chats
 */

const fs = require('fs');
const path = require('path');
const JsonChatModel = require('../../chat_service/models/JsonChatModel');
const { updateAllCaches } = require('../analytics/analyticsService');

/**
 * Transform MongoDB Extended JSON format / แปลงรูปแบบ MongoDB Extended JSON
 */
function transformMongoDBFormat(chat) {
    const transformed = { ...chat };

    if (transformed._id && transformed._id.$oid) {
        transformed._id = transformed._id.$oid;
    }

    transformed.createdAt = transformed.createdAt?._date || transformed.createdAt;
    transformed.updatedAt = transformed.updatedAt?._date || transformed.updatedAt;

    if (Array.isArray(transformed.messages)) {
        transformed.messages = transformed.messages.map(msg => {
            const newMsg = { ...msg };
            if (newMsg._id && newMsg._id.$oid) {
                newMsg._id = newMsg._id.$oid;
            }
            if (newMsg.createdAt && newMsg.createdAt.$date) {
                newMsg.createdAt = newMsg.createdAt.$date;
            }
            if (newMsg.time && newMsg.time.$date) {
                newMsg.time = newMsg.time.$date;
            }
            if (newMsg._id && typeof newMsg._id !== 'string') {
                delete newMsg._id;
            }
            return newMsg;
        });
    }

    delete transformed.__v;

    return transformed;
}

/**
 * Upload chats from file / อัปโหลดแชทจากไฟล์
 */
async function uploadChats(req, res) {
    try {
        if (!req.files || !req.files.chatsFile) {
            return res.status(400).json({ 
                error: 'No file uploaded. Please provide a chats.json file.' 
            });
        }

        const file = req.files.chatsFile;
        const filePath = file.tempFilePath || path.join(__dirname, '../../..', file.name);

        let fileContent;
        try {
            if (file.tempFilePath) {
                fileContent = fs.readFileSync(file.tempFilePath, 'utf8');
            } else {
                fileContent = file.data.toString('utf8');
            }
        } catch (readError) {
            return res.status(500).json({ error: 'Failed to read uploaded file.' });
        }

        let chats;
        try {
            chats = JSON.parse(fileContent);
        } catch (parseError) {
            return res.status(400).json({ error: 'Invalid JSON format in uploaded file.' });
        }

        if (!Array.isArray(chats)) {
            return res.status(400).json({ 
                error: 'Uploaded JSON must be an array of chat sessions.' 
            });
        }

        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        for (let i = 0; i < chats.length; i++) {
            try {
                const chat = chats[i];
                const transformedChat = transformMongoDBFormat(chat);

                if (transformedChat.sessionId) {
                    await JsonChatModel.create(transformedChat);
                    successCount++;
                } else {
                    errorCount++;
                    errors.push({ index: i, error: 'Missing sessionId' });
                }
            } catch (saveError) {
                errorCount++;
                errors.push({ index: i, error: saveError.message });
            }
        }

        // Cleanup temp file / ลบไฟล์ temp
        cleanupTempFile(file);

        const result = {
            success: true,
            message: `Successfully imported ${successCount} chat sessions`,
            summary: {
                total: chats.length,
                imported: successCount,
                failed: errorCount
            },
            errors: errors.length > 0 ? errors : null
        };

        // Update caches / อัปเดต cache
        try {
            await updateAllCaches();
        } catch (cacheError) {
            console.error('Cache update failed:', cacheError.message);
        }

        res.json(result);
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * Cleanup temporary file / ลบไฟล์ชั่วคราว
 */
function cleanupTempFile(file) {
    try {
        if (file.tempFilePath && fs.existsSync(file.tempFilePath)) {
            fs.unlinkSync(file.tempFilePath);
            return { cleaned: true };
        }
    } catch (e) {
        console.warn('Could not cleanup temp file:', e.message);
    }
    return { cleaned: false };
}

/**
 * Health check endpoint / เอนด์พอยต์ตรวจสอบสถานะ
 */
function healthCheck(req, res) {
    res.json({ status: 'ok', service: 'upload' });
}

module.exports = {
    uploadChats,
    healthCheck
};
