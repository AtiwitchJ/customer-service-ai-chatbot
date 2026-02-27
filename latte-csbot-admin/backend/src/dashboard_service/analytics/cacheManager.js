/**
 * CACHE MANAGER
 * =============
 * Simple cache management with auto-updates / จัดการ cache อย่างเรียบง่ายพร้อม auto-update
 */

const { UPDATE_INTERVAL_MS, STARTUP_DELAY_MS, updateAllCaches } = require('./analyticsService');

/**
 * Initialize cache management / เริ่มต้นการจัดการ cache
 */
function initializeCacheManager() {
    // Start cache updates after delay / เริ่มอัปเดต cache หลังจาก delay
    setTimeout(() => {
        updateAllCaches();

        // Schedule periodic updates every 24 hours / ตั้งเวลาอัปเดตทุก 24 ชั่วโมง
        setInterval(() => {
            updateAllCaches();
        }, UPDATE_INTERVAL_MS);
        
    }, STARTUP_DELAY_MS);
}

module.exports = {
    initializeCacheManager
};
