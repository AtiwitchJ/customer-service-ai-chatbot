/**
 * EXPORT CONTROLLER
 * =================
 * Export JSON data to file / ส่งออกข้อมูลจาก JSON storage เป็นไฟล์
 */

const fs = require('fs');
const path = require('path');
const jsonStore = require('../../utils/jsonDataStore');

/**
 * Export all chats / ส่งออกแชททั้งหมด
 */
async function exportChats(req, res) {
    try {
        const chats = await jsonStore.getAllChats();

        if (chats.length === 0) {
            return res.status(404).json({
                error: 'No data found',
                message: 'No chats found in JSON storage'
            });
        }

        const exportData = {
            exportedAt: new Date().toISOString(),
            totalChats: chats.length,
            source: 'JSON_Storage',
            chats: chats
        };

        res.setHeader('Content-Disposition', `attachment; filename=chats_export_${Date.now()}.json`);
        res.setHeader('Content-Type', 'application/json');
        
        res.json(exportData);

    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * Get storage status / ดึงสถานะการจัดเก็บ
 */
async function getStorageStatus(req, res) {
    try {
        const chats = await jsonStore.getAllChats();
        
        const chatsDir = path.join(__dirname, '../../data/chats/sessions');
        let fileCount = 0;
        
        try {
            const files = await fs.promises.readdir(chatsDir);
            fileCount = files.filter(f => f.endsWith('.json')).length;
        } catch (e) {
            fileCount = 0;
        }

        res.json({
            storage: {
                type: 'JSON',
                path: 'backend/data/chats/sessions/',
                chatCount: chats.length,
                fileCount: fileCount
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    exportChats,
    getStorageStatus
};
