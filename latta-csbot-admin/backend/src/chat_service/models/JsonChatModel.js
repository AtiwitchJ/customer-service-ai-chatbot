/**
 * JsonChatModel
 * =============
 * JSON-based Chat Model that replaces MongoDB/Mongoose / โมเดลแชทแบบ JSON แทน MongoDB/Mongoose
 * Provides compatible API with the original ChatModel / ให้ API ที่เข้ากันได้กับ ChatModel เดิม
 */

const jsonStore = require('../../utils/jsonDataStore');

/**
 * Query Builder for method chaining support / ตัวสร้าง Query รองรับการ chain method
 */
class JsonQuery {
    constructor(model) {
        this.model = model;
        this.filter = {};
        this.sortOptions = null;
        this.limitValue = null;
        this.selectFields = null;
        this.skipValue = null;
    }

    sort(sortObj) {
        this.sortOptions = sortObj;
        return this;
    }

    limit(n) {
        this.limitValue = n;
        return this;
    }

    select(fields) {
        this.selectFields = fields;
        return this;
    }

    lean() {
        // Return this for chaining, actual lean behavior not needed for JSON / คืนค่า this สำหรับ chain
        return this;
    }

    skip(n) {
        this.skipValue = n;
        return this;
    }

    async exec() {
        let chats = await this.model._findInternal(this.filter);

        // Apply sorting / ใช้การเรียงลำดับ
        if (this.sortOptions) {
            const entries = Object.entries(this.sortOptions);
            chats.sort((a, b) => {
                for (const [field, order] of entries) {
                    let aVal, bVal;
                    if (field === 'updatedAt') {
                        aVal = new Date(a.updatedAt || 0);
                        bVal = new Date(b.updatedAt || 0);
                    } else {
                        aVal = a[field];
                        bVal = b[field];
                    }
                    if (aVal < bVal) return -1 * order;
                    if (aVal > bVal) return 1 * order;
                }
                return 0;
            });
        }

        // Apply skip / ข้ามรายการ
        if (this.skipValue) {
            chats = chats.slice(this.skipValue);
        }

        // Apply limit / จำกัดจำนวน
        if (this.limitValue) {
            chats = chats.slice(0, this.limitValue);
        }

        // Apply select (simplified) / เลือกฟิลด์ (แบบง่าย)
        if (this.selectFields && typeof this.selectFields === 'string') {
            const fields = this.selectFields.split(' ').filter(f => !f.startsWith('-'));
            if (fields.length > 0 && fields[0] !== '') {
                chats = chats.map(chat => {
                    const selected = {};
                    fields.forEach(field => {
                        if (chat[field] !== undefined) selected[field] = chat[field];
                    });
                    return selected;
                });
            }
        }

        return chats;
    }

    // Make thenable for await support / รองรับ await
    then(resolve, reject) {
        return this.exec().then(resolve, reject);
    }
}

class JsonChatModel {
    constructor() {
        this.initialized = false;
    }

    /**
     * Initialize the data store / เริ่มต้น data store
     */
    async init() {
        if (!this.initialized) {
            await jsonStore.init();
            this.initialized = true;
        }
    }

    /**
     * Create a new chat session / สร้างเซสชันแชทใหม่
     * @param {Object} chatData - Chat data to create / ข้อมูลแชทที่จะสร้าง
     * @returns {Promise<Object>} Created chat / แชทที่สร้างแล้ว
     */
    async create(chatData) {
        await this.init();
        
        const sessionId = chatData.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        
        const chat = {
            sessionId,
            messages: chatData.messages || [],
            createdAt: chatData.createdAt || now,
            updatedAt: now,
            ...chatData
        };

        await jsonStore.saveChat(sessionId, chat);
        return chat;
    }

    /**
     * Find chats matching filter / ค้นหาแชทตามเงื่อนไข
     * @param {Object} filter - Filter criteria / เงื่อนไขการกรอง
     * @returns {JsonQuery} Query builder for chaining / Query builder สำหรับ chain
     */
    find(filter = {}) {
        const query = new JsonQuery(this);
        query.filter = filter;
        return query;
    }

    /**
     * Internal find implementation / การค้นหาภายใน
     * @param {Object} filter - Filter criteria / เงื่อนไขการกรอง
     * @returns {Promise<Array>} Matching chats / แชทที่ตรงเงื่อนไข
     */
    async _findInternal(filter = {}) {
        await this.init();
        
        // Convert MongoDB-style filter to JSON filter / แปลง filter จาก MongoDB เป็น JSON
        const jsonFilter = this._convertFilter(filter);
        const chats = await jsonStore.getAllChats(jsonFilter);
        
        return chats;
    }

    /**
     * Find a single chat by sessionId / ค้นหาแชทตาม sessionId
     * @param {string} sessionId - Session ID / รหัสเซสชัน
     * @returns {Promise<Object|null>} Chat or null / แชทหรือ null
     */
    async findById(sessionId) {
        await this.init();
        return await jsonStore.getChat(sessionId);
    }

    /**
     * Find one chat matching filter / ค้นหาแชทรายการเดียว
     * @param {Object} filter - Filter criteria / เงื่อนไขการกรอง
     * @returns {Promise<Object|null>} Chat or null / แชทหรือ null
     */
    async findOne(filter = {}) {
        await this.init();
        const chats = await this._findInternal(filter);
        return chats[0] || null;
    }

    /**
     * Count documents matching filter / นับจำนวนเอกสาร
     * @param {Object} filter - Filter criteria / เงื่อนไขการกรอง
     * @returns {Promise<number>} Count / จำนวน
     */
    async countDocuments(filter = {}) {
        await this.init();
        const jsonFilter = this._convertFilter(filter);
        return await jsonStore.countChats(jsonFilter);
    }

    /**
     * Delete a single chat by ID / ลบแชทรายการเดียว
     * @param {string} sessionId - Session ID / รหัสเซสชัน
     * @returns {Promise<Object|null>} Deleted chat / แชทที่ลบ
     */
    async findByIdAndDelete(sessionId) {
        await this.init();
        const chat = await jsonStore.getChat(sessionId);
        if (chat) {
            await jsonStore.deleteChat(sessionId);
        }
        return chat;
    }

    /**
     * Delete many chats matching filter / ลบแชทหลายรายการ
     * @param {Object} filter - Filter with $in for IDs / Filter ที่มี $in สำหรับ IDs
     * @returns {Promise<Object>} Deletion result / ผลการลบ
     */
    async deleteMany(filter = {}) {
        await this.init();
        
        // Handle { _id: { $in: [...] } } format / จัดการรูปแบบ { _id: { $in: [...] } }
        if (filter._id && filter._id.$in) {
            const sessionIds = filter._id.$in;
            const result = await jsonStore.bulkDeleteChats(sessionIds);
            return { deletedCount: result.deletedCount };
        }

        // For other filters, find matching then delete / สำหรับ filter อื่น ค้นหาก่อนแล้วลบ
        const chats = await this._findInternal(filter);
        const sessionIds = chats.map(c => c.sessionId);
        const result = await jsonStore.bulkDeleteChats(sessionIds);
        return { deletedCount: result.deletedCount };
    }

    /**
     * Update a single chat / อัปเดตแชทรายการเดียว
     * @param {Object} filter - Filter criteria / เงื่อนไขการกรอง
     * @param {Object} updates - Updates to apply / การอัปเดตที่จะใช้
     * @returns {Promise<Object|null>} Updated chat / แชทที่อัปเดต
     */
    async updateOne(filter, updates) {
        await this.init();
        
        const chat = await this.findOne(filter);
        if (!chat) return null;

        const updatedChat = {
            ...chat,
            ...updates.$set,
            updatedAt: new Date().toISOString()
        };

        await jsonStore.saveChat(chat.sessionId, updatedChat);
        return updatedChat;
    }

    /**
     * MongoDB Aggregation (simplified) / การทำ Aggregation แบบง่าย
     * Supports: $match, $group, $sort, $limit, $project, $facet, $unwind
     */
    async aggregate(pipeline) {
        await this.init();
        
        // Get all chats as base / ดึงแชททั้งหมดเป็น base
        let results = await jsonStore.getAllChats();
        
        for (let i = 0; i < pipeline.length; i++) {
            const stage = pipeline[i];
            
            if (stage.$match) {
                results = this._applyMatch(results, stage.$match);
            } else if (stage.$facet) {
                return [this._applyFacet(results, stage.$facet)];
            } else if (stage.$group) {
                results = this._applyGroup(results, stage.$group);
            } else if (stage.$sort) {
                results = this._applySort(results, stage.$sort);
            } else if (stage.$limit) {
                results = results.slice(0, stage.$limit);
            } else if (stage.$project) {
                results = this._applyProject(results, stage.$project);
            } else if (stage.$unwind) {
                results = this._applyUnwind(results, stage.$unwind);
            }
        }

        return results;
    }

    // ============ QUERY HELPERS / ตัวช่วยคิวรี ============

    _convertFilter(mongoFilter) {
        const jsonFilter = {};

        // Handle date range / จัดการช่วงวันที่
        if (mongoFilter.updatedAt) {
            if (mongoFilter.updatedAt.$gte) {
                jsonFilter.startDate = mongoFilter.updatedAt.$gte;
            }
            if (mongoFilter.updatedAt.$lte) {
                jsonFilter.endDate = mongoFilter.updatedAt.$lte;
            }
        }

        // Handle feedback filter / จัดการ filter ความพึงพอใจ
        if (mongoFilter['messages.feedback']) {
            jsonFilter.feedback = mongoFilter['messages.feedback'];
        }

        return jsonFilter;
    }

    _applyMatch(docs, matchStage) {
        return docs.filter(doc => {
            for (const [key, value] of Object.entries(matchStage)) {
                // Handle nested field access / จัดการการเข้าถึงฟิลด์ซ้อน
                let docValue = this._getNestedValue(doc, key);
                
                if (typeof value === 'object' && value !== null) {
                    // Handle operators / จัดการตัวดำเนินการ
                    if (value.$gte) {
                        const docDate = new Date(docValue);
                        const gteDate = new Date(value.$gte);
                        if (!(docDate >= gteDate)) return false;
                    }
                    if (value.$lte) {
                        const docDate = new Date(docValue);
                        const lteDate = new Date(value.$lte);
                        if (!(docDate <= lteDate)) return false;
                    }
                    if (value.$in && !value.$in.includes(docValue)) return false;
                    if (value.$nin && value.$nin.includes(docValue)) return false;
                    if (value.$ne && docValue === value.$ne) return false;
                } else {
                    if (docValue !== value) return false;
                }
            }
            return true;
        });
    }

    _applyFacet(docs, facetStage) {
        const result = {};
        for (const [name, subPipeline] of Object.entries(facetStage)) {
            let subResults = [...docs];
            for (const stage of subPipeline) {
                if (stage.$match) {
                    subResults = this._applyMatch(subResults, stage.$match);
                } else if (stage.$group) {
                    subResults = this._applyGroup(subResults, stage.$group);
                } else if (stage.$sort) {
                    subResults = this._applySort(subResults, stage.$sort);
                } else if (stage.$limit) {
                    subResults = subResults.slice(0, stage.$limit);
                } else if (stage.$project) {
                    subResults = this._applyProject(subResults, stage.$project);
                } else if (stage.$count) {
                    subResults = [{ count: subResults.length }];
                } else if (stage.$unwind) {
                    subResults = this._applyUnwind(subResults, stage.$unwind);
                }
            }
            result[name] = subResults;
        }
        return result;
    }

    _applyGroup(docs, groupStage) {
        const idField = groupStage._id;
        const groups = {};

        for (const doc of docs) {
            let groupKey;
            
            if (idField === null) {
                groupKey = 'all';
            } else if (typeof idField === 'string' && idField.startsWith('$')) {
                groupKey = this._getNestedValue(doc, idField.slice(1));
            } else if (typeof idField === 'object') {
                // Handle date formatting / จัดการรูปแบบวันที่
                if (idField.$dateToString) {
                    const dateConfig = idField.$dateToString;
                    let dateField;
                    if (typeof dateConfig.date === 'string') {
                        dateField = dateConfig.date;
                    } else if (dateConfig.date.$ifNull) {
                        dateField = dateConfig.date.$ifNull[0];
                    }
                    const dateValue = this._getNestedValue(doc, dateField.slice(1));
                    const date = new Date(dateValue);
                    groupKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
                } else {
                    groupKey = JSON.stringify(idField);
                }
            } else {
                groupKey = this._getNestedValue(doc, idField);
            }

            if (!groups[groupKey]) {
                groups[groupKey] = { _id: groupKey };
            }

            // Apply accumulators / ใช้ตัวสะสม
            for (const [field, expr] of Object.entries(groupStage)) {
                if (field === '_id') continue;

                if (expr.$sum) {
                    if (typeof expr.$sum === 'number') {
                        groups[groupKey][field] = (groups[groupKey][field] || 0) + expr.$sum;
                    } else {
                        const val = this._getNestedValue(doc, expr.$sum.slice(1)) || 0;
                        groups[groupKey][field] = (groups[groupKey][field] || 0) + val;
                    }
                } else if (expr.$avg) {
                    if (!groups[groupKey][field]) {
                        groups[groupKey][field] = { sum: 0, count: 0 };
                    }
                    const val = this._getNestedValue(doc, expr.$avg.slice(1)) || 0;
                    groups[groupKey][field].sum += val;
                    groups[groupKey][field].count++;
                } else if (expr.$min) {
                    const val = this._getNestedValue(doc, expr.$min.slice(1));
                    if (val !== undefined) {
                        groups[groupKey][field] = groups[groupKey][field] === undefined 
                            ? val 
                            : Math.min(groups[groupKey][field], val);
                    }
                } else if (expr.$max) {
                    const val = this._getNestedValue(doc, expr.$max.slice(1));
                    if (val !== undefined) {
                        groups[groupKey][field] = groups[groupKey][field] === undefined 
                            ? val 
                            : Math.max(groups[groupKey][field], val);
                    }
                } else if (expr.$first) {
                    if (groups[groupKey][field] === undefined) {
                        groups[groupKey][field] = this._getNestedValue(doc, expr.$first.slice(1));
                    }
                } else if (expr.$last) {
                    groups[groupKey][field] = this._getNestedValue(doc, expr.$last.slice(1));
                }
            }
        }

        // Finalize avg calculations / คำนวณค่าเฉลี่ยให้เสร็จสมบูรณ์
        return Object.values(groups).map(g => {
            for (const [k, v] of Object.entries(g)) {
                if (v && typeof v === 'object' && 'sum' in v && 'count' in v) {
                    g[k] = v.count > 0 ? v.sum / v.count : 0;
                }
            }
            return g;
        });
    }

    _applySort(docs, sortStage) {
        const entries = Object.entries(sortStage);
        return docs.sort((a, b) => {
            for (const [field, order] of entries) {
                const aVal = this._getNestedValue(a, field);
                const bVal = this._getNestedValue(b, field);
                
                if (aVal < bVal) return -1 * order;
                if (aVal > bVal) return 1 * order;
            }
            return 0;
        });
    }

    _applyProject(docs, projectStage) {
        return docs.map(doc => {
            const result = {};
            for (const [field, value] of Object.entries(projectStage)) {
                if (value === 1) {
                    result[field] = this._getNestedValue(doc, field);
                } else if (value === 0) {
                    delete result[field];
                } else if (typeof value === 'string' && value.startsWith('$')) {
                    result[field] = this._getNestedValue(doc, value.slice(1));
                } else if (value && value.$ifNull) {
                    const [fieldRef, defaultVal] = value.$ifNull;
                    const val = this._getNestedValue(doc, fieldRef.slice(1));
                    result[field] = val !== undefined ? val : defaultVal;
                } else if (value && value.$toDate) {
                    const val = this._getNestedValue(doc, value.$toDate.slice(1));
                    result[field] = new Date(val);
                } else if (value && value.$subtract) {
                    const [a, b] = value.$subtract;
                    const aVal = typeof a === 'string' && a.startsWith('$') 
                        ? this._getNestedValue(doc, a.slice(1)) : a;
                    const bVal = typeof b === 'string' && b.startsWith('$') 
                        ? this._getNestedValue(doc, b.slice(1)) : b;
                    result[field] = aVal - bVal;
                } else if (value && value.$size) {
                    if (typeof value.$size === 'string') {
                        const arr = this._getNestedValue(doc, value.$size.slice(1)) || [];
                        result[field] = arr.length;
                    } else if (value.$size.$ifNull) {
                        const [fieldRef, defaultVal] = value.$size.$ifNull;
                        const arr = this._getNestedValue(doc, fieldRef.slice(1)) || defaultVal;
                        result[field] = arr.length;
                    }
                } else if (value && value.$filter) {
                    // Simplified filter support / รองรับ filter แบบง่าย
                    const arr = this._getNestedValue(doc, value.$filter.input.slice(1)) || [];
                    result[field] = arr;
                } else if (value && value.$map) {
                    // Simplified map support / รองรับ map แบบง่าย
                    const arr = this._getNestedValue(doc, value.$map.input.slice(1)) || [];
                    result[field] = arr.map(item => item);
                } else if (value && value.$hour) {
                    let dateVal;
                    if (typeof value.$hour === 'string') {
                        dateVal = this._getNestedValue(doc, value.$hour.slice(1));
                    } else if (value.$hour && value.$hour.$ifNull) {
                        const [fieldRef1, fieldRef2] = value.$hour.$ifNull;
                        dateVal = this._getNestedValue(doc, fieldRef1.slice(1));
                        if (!dateVal && fieldRef2) {
                            dateVal = this._getNestedValue(doc, fieldRef2.slice(1));
                        }
                    }
                    result[field] = new Date(dateVal).getHours();
                }
            }
            return result;
        });
    }

    _applyUnwind(docs, unwindPath) {
        const path = unwindPath.startsWith('$') ? unwindPath.slice(1) : unwindPath;
        const result = [];
        
        for (const doc of docs) {
            const arr = this._getNestedValue(doc, path);
            if (Array.isArray(arr)) {
                for (const item of arr) {
                    result.push({ ...doc, [path.split('.').pop()]: item });
                }
            }
        }
        
        return result;
    }

    _getNestedValue(obj, path) {
        if (!path) return undefined;
        
        const parts = path.split('.');
        let current = obj;
        
        for (const part of parts) {
            if (current === null || current === undefined) return undefined;
            current = current[part];
        }
        
        return current;
    }

    // Mock lean() for compatibility / lean() สำหรับความเข้ากันได้
    lean() {
        return this;
    }

    // Mock select() for compatibility / select() สำหรับความเข้ากันได้
    select(fields) {
        return this;
    }

    // Mock sort() for compatibility / sort() สำหรับความเข้ากันได้
    sort(sortObj) {
        this._sort = sortObj;
        return this;
    }

    // Mock limit() for compatibility / limit() สำหรับความเข้ากันได้
    limit(n) {
        this._limit = n;
        return this;
    }
}

// Export singleton instance / ส่งออก singleton instance
module.exports = new JsonChatModel();
