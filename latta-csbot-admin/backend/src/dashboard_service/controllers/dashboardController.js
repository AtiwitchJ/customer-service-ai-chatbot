/**
 * UNIFIED DASHBOARD CONTROLLER
 * ============================
 * All dashboard controllers in one place / รวม controllers ทั้งหมดไว้ที่เดียว
 */

const {
    getDashboardOverview,
    getWordFrequency,
    updateAllCaches,
    getSessionTrends,
    getPeakHours,
    getTopQuestions,
    getUsersAnalytics
} = require('../analytics/analyticsService');

// ===================
// OVERVIEW ENDPOINTS / เอนด์พอยต์ภาพรวม
// ===================

/**
 * GET /api/overview
 * Get dashboard overview with stats / ดึงภาพรวม dashboard พร้อมสถิติ
 */
async function getOverview(req, res) {
    try {
        const period = req.query.period || 'all';
        const overview = await getDashboardOverview(period);
        res.json(overview);
    } catch (error) {
        console.error('Overview error:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * GET /api/wordfreq
 * Get word frequency data / ดึงข้อมูลความถี่คำ
 */
function getWordFreq(req, res) {
    try {
        const period = req.query.period || 'all';
        const data = getWordFrequency(period);
        res.json(data);
    } catch (error) {
        console.error('Word frequency error:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/refresh-stats
 * Force refresh all caches manually / อัปเดต cache ทั้งหมดด้วยตนเอง
 */
async function refreshStats(req, res) {
    try {
        const result = await updateAllCaches();
        
        res.json({ 
            success: result.success, 
            message: 'All caches updated manually',
            timestamp: result.timestamp
        });
    } catch (error) {
        console.error('Manual cache update error:', error);
        res.status(500).json({ error: error.message });
    }
}

// ===================
// ANALYTICS ENDPOINTS / เอนด์พอยต์ Analytics
// ===================

/**
 * GET /api/analytics/trends
 * Get session trends / ดึงแนวโน้มเซสชัน
 */
async function getTrends(req, res) {
    try {
        const period = req.query.period || 'all';
        const trends = await getSessionTrends(period);
        res.json(trends);
    } catch (error) {
        console.error('Trends error:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * GET /api/analytics/peak-hours
 * Get peak hours data / ดึงข้อมูลช่วงเวลายอดนิยม
 */
async function getPeakHoursData(req, res) {
    try {
        const period = req.query.period || 'all';
        const peakHours = await getPeakHours(period);
        res.json(peakHours);
    } catch (error) {
        console.error('Peak hours error:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * GET /api/analytics/top-questions
 * Get top questions / ดึงคำถามยอดนิยม
 */
async function getTopQuestionsData(req, res) {
    try {
        const period = req.query.period || 'all';
        const limit = parseInt(req.query.limit) || 10;
        const topQuestions = await getTopQuestions(period, limit);
        res.json(topQuestions);
    } catch (error) {
        console.error('Top questions error:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * GET /api/analytics/users
 * Get users analytics / ดึงสถิติผู้ใช้
 */
async function getUsersData(req, res) {
    try {
        const period = req.query.period || 'all';
        const usersAnalytics = await getUsersAnalytics(period);
        res.json(usersAnalytics);
    } catch (error) {
        console.error('Users analytics error:', error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    // Overview / ภาพรวม
    getOverview,
    getWordFreq,
    refreshStats,
    
    // Analytics / การวิเคราะห์
    getTrends,
    getPeakHoursData,
    getTopQuestionsData,
    getUsersData
};
