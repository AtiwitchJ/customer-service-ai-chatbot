/**
 * Chat Controller
 * ===============
 * Handles HTTP requests for chat operations / รับผิดชอบจัดการคำสั่ง HTTP ที่เกี่ยวกับระบบแชท
 * Interacts with ChatModel to manage chat logs / ทำงานร่วมกับ ChatModel เพื่อจัดการประวัติการสนทนา
 */

const ChatModel = require('../models/JsonChatModel');

class ChatController {

    /**
     * Get all chats with pagination and filtering
     * ดึงข้อมูลแชททั้งหมด พร้อมระบบแบ่งหน้าและกรองข้อมูล
     * 
     * @route GET /api/chats
     * @param {Object} req - Request object containing query params (limit, start, end, feedback)
     * @param {Object} res - Response object
     */
    async getChats(req, res) {
        try {
            const { limit = 10000, start, end, feedback } = req.query;
            const filter = {};

            // Date Range Filter / กรองตามช่วงเวลา
            if (start || end) {
                filter.updatedAt = {};
                // Start Date / วันเริ่มต้น
                if (start) filter.updatedAt.$gte = new Date(start);
                // End Date (Set to end of day) / วันสิ้นสุด (ปรับเวลาเป็น 23:59:59)
                if (end) filter.updatedAt.$lte = new Date(new Date(end).setHours(23, 59, 59, 999));
            }

            // Feedback Filter (like/dislike) / กรองตามความพึงพอใจ
            if (feedback) {
                filter['messages.feedback'] = feedback;
            }

            // Execute Query / สั่งดึงข้อมูลจากฐานข้อมูล
            const chats = await ChatModel.find(filter)
                .sort({ updatedAt: -1 })
                .limit(parseInt(limit));

            // Get total count / นับจำนวนรายการทั้งหมดที่ตรงตามเงื่อนไข
            const total = await ChatModel.countDocuments(filter);

            // Compute Stats: Total Messages / คำนวณสถิติ: จำนวนข้อความทั้งหมด
            const totalMessages = chats.reduce((acc, chat) => acc + (chat.messages ? chat.messages.length : 0), 0);

            return res.status(200).json({
                status: 'success',
                data: chats,
                total,
                overview: {
                    totalMessages
                }
            });
        } catch (error) {
            console.error('Error fetching chats:', error);
            return res.status(500).json({ status: 'error', message: error.message });
        }
    }

    /**
     * Get a single chat transaction by ID
     * ดึงข้อมูลแชทรายการเดียวตาม ID ที่ระบุ
     * 
     * @route GET /api/chats/:id
     * @param {Object} req - Request object with param :id
     */
    async getChatById(req, res) {
        try {
            const { id } = req.params;
            const chat = await ChatModel.findById(id);

            if (!chat) {
                return res.status(404).json({ status: 'error', message: 'Chat not found' });
            }

            return res.status(200).json({ status: 'success', data: chat });
        } catch (error) {
            console.error(`Error fetching chat ${req.params.id}:`, error);
            return res.status(500).json({ status: 'error', message: error.message });
        }
    }

    /**
     * Delete a single chat by ID
     * ลบรายการแชท 1 รายการ
     * 
     * @route DELETE /api/chats/:id
     */
    async deleteChat(req, res) {
        try {
            const { id } = req.params;
            const result = await ChatModel.findByIdAndDelete(id);

            if (!result) {
                return res.status(404).json({ status: 'error', message: 'Chat not found' });
            }

            return res.status(200).json({ status: 'success', message: 'Chat deleted successfully' });
        } catch (error) {
            console.error(`Error deleting chat ${req.params.id}:`, error);
            return res.status(500).json({ status: 'error', message: error.message });
        }
    }

    /**
     * Bulk delete chats by IDs
     * ลบแชทหลายรายการพร้อมกัน
     * 
     * @route POST /api/chats/bulk-delete
     * @param {Object} req - Body must contain { ids: [string] }
     */
    async bulkDeleteChats(req, res) {
        try {
            const { ids } = req.body;
            
            // Validate IDs / ตรวจสอบข้อมูลที่ส่งมา
            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({ status: 'error', message: 'Invalid IDs provided' });
            }

            // Perform Bulk Delete / สั่งลบทีละหลายรายการ
            const result = await ChatModel.deleteMany({ _id: { $in: ids } });

            return res.status(200).json({ 
                status: 'success', 
                message: `${result.deletedCount} chats deleted successfully` 
            });
        } catch (error) {
            console.error('Error bulk deleting chats:', error);
            return res.status(500).json({ status: 'error', message: error.message });
        }
    }

    /**
     * Import/Upload chats from JSON
     * นำเข้าข้อมูลแชทจาก JSON
     * 
     * @route POST /api/chats/import
     * @param {Object} req - Body contains { chats: [...] } or single chat object
     */
    async importChats(req, res) {
        try {
            const body = req.body;
            
            // Support both { chats: [...] } and direct array / รองรับทั้ง { chats: [...] } และ array ตรง
            let chatsToImport = [];
            if (Array.isArray(body)) {
                chatsToImport = body;
            } else if (body.chats && Array.isArray(body.chats)) {
                chatsToImport = body.chats;
            } else if (typeof body === 'object' && body !== null) {
                // Single chat object / กรณีเป็น object เดี่ยว
                chatsToImport = [body];
            }

            if (chatsToImport.length === 0) {
                return res.status(400).json({ 
                    status: 'error', 
                    message: 'No valid chat data provided. Expected array or { chats: [...] }' 
                });
            }

            const results = {
                success: 0,
                failed: 0,
                errors: []
            };

            // Helper to extract date from MongoDB Extended JSON or plain string
            // ฟังก์ชันช่วยแปลงวันที่จาก MongoDB Extended JSON หรือ string ธรรมดา
            const extractDate = (value) => {
                if (!value) return new Date().toISOString();
                // Handle MongoDB Extended JSON: { "$date": "..." }
                if (typeof value === 'object' && value.$date) {
                    return new Date(value.$date).toISOString();
                }
                // Plain string / กรณีเป็น string ธรรมดา
                if (typeof value === 'string') {
                    return new Date(value).toISOString();
                }
                return new Date().toISOString();
            };

            for (let i = 0; i < chatsToImport.length; i++) {
                const chatData = chatsToImport[i];
                try {
                    // Ensure required fields / ตรวจสอบฟิลด์ที่จำเป็น
                    if (!chatData.sessionId) {
                        chatData.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    }

                    // Normalize timestamps / แปลงรูปแบบเวลาให้เป็นมาตรฐาน
                    try {
                        chatData.createdAt = extractDate(chatData.createdAt);
                        chatData.updatedAt = extractDate(chatData.updatedAt);
                    } catch (dateErr) {
                        chatData.createdAt = new Date().toISOString();
                        chatData.updatedAt = new Date().toISOString();
                    }

                    // Normalize message timestamps / แปลงเวลาใน messages ให้เป็นมาตรฐาน
                    if (Array.isArray(chatData.messages)) {
                        chatData.messages = chatData.messages.map((msg) => {
                            try {
                                return {
                                    ...msg,
                                    role: msg.sender === 'bot' ? 'assistant' : (msg.role || msg.sender || 'user'),
                                    time: extractDate(msg.time || msg.createdAt),
                                    createdAt: extractDate(msg.createdAt || msg.time)
                                };
                            } catch (msgErr) {
                                return {
                                    ...msg,
                                    role: msg.sender === 'bot' ? 'assistant' : (msg.role || msg.sender || 'user'),
                                    time: new Date().toISOString(),
                                    createdAt: new Date().toISOString()
                                };
                            }
                        });
                    }

                    await ChatModel.create(chatData);
                    results.success++;
                } catch (err) {
                    results.failed++;
                    results.errors.push({ 
                        index: i,
                        sessionId: chatData.sessionId, 
                        error: err.message 
                    });
                }
            }

            return res.status(200).json({
                status: 'success',
                message: `Imported ${results.success} chats (${results.failed} failed)`,
                data: results
            });
        } catch (error) {
            console.error('Error importing chats:', error);
            return res.status(500).json({ status: 'error', message: error.message });
        }
    }

    /**
     * Export all chats as JSON
     * ส่งออกข้อมูลแชททั้งหมดเป็น JSON
     * 
     * @route GET /api/chats/export
     * @param {Object} req - Query params (start, end, feedback)
     */
    async exportChats(req, res) {
        try {
            const { start, end, feedback } = req.query;
            const filter = {};

            // Date Range Filter / กรองตามช่วงเวลา
            if (start || end) {
                filter.updatedAt = {};
                if (start) filter.updatedAt.$gte = new Date(start);
                if (end) filter.updatedAt.$lte = new Date(new Date(end).setHours(23, 59, 59, 999));
            }

            // Feedback Filter / กรองตามความพึงพอใจ
            if (feedback) {
                filter['messages.feedback'] = feedback;
            }

            const chats = await ChatModel.find(filter);

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="chats_export_${Date.now()}.json"`);

            return res.status(200).json({
                status: 'success',
                exportedAt: new Date().toISOString(),
                count: chats.length,
                chats: chats
            });
        } catch (error) {
            console.error('Error exporting chats:', error);
            return res.status(500).json({ status: 'error', message: error.message });
        }
    }
}

// Export instance of the controller / ส่งออก Instance ของ Controller
module.exports = new ChatController();
