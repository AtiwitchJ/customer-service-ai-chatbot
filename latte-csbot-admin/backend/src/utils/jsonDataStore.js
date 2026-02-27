/**
 * JsonDataStore - JSON-based Data Storage
 * ========================================
 * Replaces MongoDB with JSON file storage for 100% JSON export system
 * 
 * Features:
 * - Chat session storage
 * - Analytics data caching
 * - Upload metadata storage
 * - Index management for fast lookups
 */

const fs = require('fs').promises;
const path = require('path');

class JsonDataStore {
    constructor() {
        this.dataDir = path.join(__dirname, '../../data');
        this.chatsDir = path.join(this.dataDir, 'chats');
        this.sessionsDir = path.join(this.chatsDir, 'sessions');
        this.indexDir = path.join(this.chatsDir, 'index');
        this.analyticsDir = path.join(this.dataDir, 'analytics');
        this.uploadsDir = path.join(this.dataDir, 'uploads');
    }

    /**
     * Initialize directories
     */
    async init() {
        const dirs = [this.sessionsDir, this.indexDir, this.analyticsDir, this.uploadsDir];
        for (const dir of dirs) {
            await fs.mkdir(dir, { recursive: true });
        }
        console.log('✅ JsonDataStore initialized');
    }

    // ============ CHATS ============

    /**
     * Save a chat session to JSON file
     */
    async saveChat(sessionId, chatData) {
        const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
        const data = {
            ...chatData,
            updatedAt: chatData.updatedAt || chatData.createdAt || new Date().toISOString(),
            createdAt: chatData.createdAt || new Date().toISOString()
        };
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        await this._updateSessionsIndex(sessionId, data);
        return data;
    }

    /**
     * Get a single chat by sessionId
     */
    async getChat(sessionId) {
        try {
            const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
            const content = await fs.readFile(filePath, 'utf8');
            return JSON.parse(content);
        } catch (e) {
            if (e.code === 'ENOENT') return null;
            throw e;
        }
    }

    /**
     * Get all chats with optional filtering
     */
    async getAllChats(filter = {}) {
        try {
            const files = await fs.readdir(this.sessionsDir);
            const chats = [];

            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                
                try {
                    const content = await fs.readFile(path.join(this.sessionsDir, file), 'utf8');
                    const chat = JSON.parse(content);
                    
                    // Apply filter
                    if (this._matchFilter(chat, filter)) {
                        chats.push(chat);
                    }
                } catch (e) {
                    console.warn(`Warning: Could not parse ${file}`);
                }
            }

            // Sort by updatedAt desc
            return chats.sort((a, b) => {
                const dateA = new Date(b.updatedAt || b.createdAt || 0);
                const dateB = new Date(a.updatedAt || a.createdAt || 0);
                return dateA - dateB;
            });
        } catch (e) {
            if (e.code === 'ENOENT') return [];
            throw e;
        }
    }

    /**
     * Delete a single chat by sessionId
     */
    async deleteChat(sessionId) {
        try {
            const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
            await fs.unlink(filePath);
            await this._removeFromIndex(sessionId);
            return true;
        } catch (e) {
            if (e.code === 'ENOENT') return false;
            throw e;
        }
    }

    /**
     * Bulk delete chats by sessionIds
     */
    async bulkDeleteChats(sessionIds) {
        const results = { deletedCount: 0, failed: [] };
        
        for (const sessionId of sessionIds) {
            try {
                const deleted = await this.deleteChat(sessionId);
                if (deleted) results.deletedCount++;
            } catch (e) {
                results.failed.push(sessionId);
            }
        }
        
        return results;
    }

    /**
     * Count chats matching filter
     */
    async countChats(filter = {}) {
        const chats = await this.getAllChats(filter);
        return chats.length;
    }

    // ============ INDEX MANAGEMENT ============

    async _updateSessionsIndex(sessionId, chatData) {
        const indexPath = path.join(this.indexDir, 'sessions_index.json');
        let index = { sessions: {}, lastUpdated: null };

        try {
            const content = await fs.readFile(indexPath, 'utf8');
            index = JSON.parse(content);
        } catch (e) { /* file doesn't exist */ }

        index.sessions[sessionId] = {
            updatedAt: chatData.updatedAt,
            createdAt: chatData.createdAt,
            hasFeedback: chatData.messages?.some(m => m.feedback) || false,
            messageCount: chatData.messages?.length || 0
        };
        index.lastUpdated = new Date().toISOString();

        await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
    }

    async _removeFromIndex(sessionId) {
        const indexPath = path.join(this.indexDir, 'sessions_index.json');
        let index = { sessions: {}, lastUpdated: null };

        try {
            const content = await fs.readFile(indexPath, 'utf8');
            index = JSON.parse(content);
        } catch (e) { return; }

        delete index.sessions[sessionId];
        index.lastUpdated = new Date().toISOString();

        await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
    }

    // ============ ANALYTICS ============

    async saveAnalytics(type, data) {
        const filePath = path.join(this.analyticsDir, `${type}.json`);
        const exportData = {
            generatedAt: new Date().toISOString(),
            data: data
        };
        await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));
        return exportData;
    }

    async getAnalytics(type) {
        const filePath = path.join(this.analyticsDir, `${type}.json`);
        try {
            const content = await fs.readFile(filePath, 'utf8');
            return JSON.parse(content);
        } catch (e) {
            return null;
        }
    }

    // ============ UPLOADS ============

    async saveUploadMetadata(metadata) {
        const filePath = path.join(this.uploadsDir, 'metadata.json');
        let metadataStore = { uploads: [], lastUpdated: null };

        try {
            const content = await fs.readFile(filePath, 'utf8');
            metadataStore = JSON.parse(content);
        } catch (e) { /* new file */ }

        // Update if exists, otherwise add
        const existingIndex = metadataStore.uploads.findIndex(u => u.id === metadata.id);
        if (existingIndex >= 0) {
            metadataStore.uploads[existingIndex] = { 
                ...metadataStore.uploads[existingIndex], 
                ...metadata,
                updatedAt: new Date().toISOString()
            };
        } else {
            metadataStore.uploads.push({
                ...metadata,
                createdAt: new Date().toISOString()
            });
        }
        
        metadataStore.lastUpdated = new Date().toISOString();
        await fs.writeFile(filePath, JSON.stringify(metadataStore, null, 2));
        return metadata;
    }

    async getUploadMetadata(id) {
        const filePath = path.join(this.uploadsDir, 'metadata.json');
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const metadataStore = JSON.parse(content);
            return metadataStore.uploads.find(u => u.id === id) || null;
        } catch (e) {
            return null;
        }
    }

    async getAllUploadMetadata() {
        const filePath = path.join(this.uploadsDir, 'metadata.json');
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const metadataStore = JSON.parse(content);
            return metadataStore.uploads || [];
        } catch (e) {
            return [];
        }
    }

    async deleteUploadMetadata(id) {
        const filePath = path.join(this.uploadsDir, 'metadata.json');
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const metadataStore = JSON.parse(content);
            metadataStore.uploads = metadataStore.uploads.filter(u => u.id !== id);
            metadataStore.lastUpdated = new Date().toISOString();
            await fs.writeFile(filePath, JSON.stringify(metadataStore, null, 2));
            return true;
        } catch (e) {
            return false;
        }
    }

    // ============ HELPERS ============

    _matchFilter(chat, filter) {
        // Date range filter
        if (filter.startDate || filter.endDate) {
            const chatDate = new Date(chat.updatedAt || chat.createdAt);
            
            if (filter.startDate) {
                const start = new Date(filter.startDate);
                if (chatDate < start) return false;
            }
            
            if (filter.endDate) {
                const end = new Date(filter.endDate);
                end.setHours(23, 59, 59, 999);
                if (chatDate > end) return false;
            }
        }

        // Feedback filter
        if (filter.feedback) {
            const hasFeedback = chat.messages?.some(m => m.feedback === filter.feedback);
            if (!hasFeedback) return false;
        }

        // Text search filter
        if (filter.searchText) {
            const searchLower = filter.searchText.toLowerCase();
            const hasText = chat.messages?.some(m => 
                m.text?.toLowerCase().includes(searchLower)
            );
            if (!hasText) return false;
        }

        return true;
    }
}

// Export singleton instance
module.exports = new JsonDataStore();
