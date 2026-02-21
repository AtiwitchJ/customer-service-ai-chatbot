/**
 * UNIFIED ANALYTICS SERVICE
 * =========================
 * All analytics functionality in one place / รวมฟังก์ชัน analytics ทั้งหมดไว้ที่เดียว
 * 
 * Analytics Functions Available / รายการฟังก์ชัน:
 * - getSessionTrends() - Session and feedback trends / แนวโน้มการใช้งานและ Feedback
 * - getPeakHours() - Peak usage hours analysis / วิเคราะห์ช่วงเวลาที่มีการใช้งานสูงสุด
 * - getTopQuestions() - Most frequently asked questions / คำถามยอดนิยม
 * - getUsersAnalytics() - User session analytics / สถิติผู้ใช้งานรายบุคคล
 */

const fs = require('fs');
const path = require('path');
const sw = require('stopword');
const ChatModel = require('../../chat_service/models/JsonChatModel');

// ===================
// CONSTANTS / ค่าคงที่
// ===================

const CACHE_FILE = path.join(__dirname, '../utils/wordfreq_cache.json');
const DASHBOARD_CACHE_FILE = path.join(__dirname, '../utils/dashboard_cache.json');
const ANALYTICS_CACHE_FILE = path.join(__dirname, '../utils/analytics_cache.json');
const UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes / 5 นาที
const STARTUP_DELAY_MS = 5000; // 5 seconds / 5 วินาที

// Thai Stopwords List (Words to ignore in analysis)
// รายการคำฟุ่มเฟือยภาษาไทย (คำที่ไม่นำมาวิเคราะห์)
const THAI_STOPWORDS = [
    'ฉันต้องการ', 'ฉันไม่ต้องการ', 'คือ', 'และ', 'หรือ',
    'ครับ', 'ค่ะ', 'อยาก', 'ไหม', 'ไร', 'สอบถาม', 'ไม่', 'มี'
];

const VALID_PERIODS = ['last_day', '7days', '30days', '1year', 'all'];

// ===================
// HELPER FUNCTIONS / ฟังก์ชันช่วยทำงาน
// ===================

/**
 * Get MongoDB query object for specific time period
 * สร้าง MongoDB query object สำหรับช่วงเวลาที่กำหนด
 * 
 * @param {string} period - Time period ('last_day', '7days', '30days', '1year', 'all')
 * @returns {Object} MongoDB query object { updatedAt: { $gte: ... } }
 */
function getQueryForPeriod(period) {
    const now = new Date();
    const periodDays = {
        'last_day': 1,
        '7days': 7,
        '30days': 30,
        '1year': 365
    };

    if (periodDays[period]) {
        const date = new Date(now);
        date.setDate(now.getDate() - periodDays[period]);
        return { updatedAt: { $gte: date } };
    }

    return {}; // 'all' period - no filter / ไม่กรองเวลา
}

// ===================
// CACHE MANAGEMENT / การจัดการแคช
// ===================

/**
 * Read any cache file safely / อ่านไฟล์ cache อย่างปลอดภัย
 */
function readCache(filePath, period = 'all') {
    if (!fs.existsSync(filePath)) return null;

    try {
        const cache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return cache[period]?.data || null;
    } catch (error) {
        console.error(`Cache read error for ${filePath}:`, error);
        return null;
    }
}

/**
 * Write cache file safely / เขียนไฟล์ cache อย่างปลอดภัย
 */
function writeCache(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`Cache write error for ${filePath}:`, error);
        return false;
    }
}

/**
 * Check if cache is fresh (less than 5 minutes) / เช็คว่า cache ยังใหม่อยู่
 */
function isCacheFresh(filePath, period) {
    if (!fs.existsSync(filePath)) return false;

    try {
        const cache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const periodCache = cache[period];

        if (!periodCache) return false;

        const now = Date.now();
        const cacheAge = now - periodCache.timestamp;
        const maxAge = 5 * 60 * 1000; // 5 minutes / 5 นาที

        return cacheAge < maxAge;
    } catch (error) {
        return false;
    }
}

// ===================
// CALCULATION HELPERS / ตัวช่วยคำนวณ
// ===================

/**
 * Calculate response time from chat documents / คำนวณเวลาตอบกลับ
 */
function calculateResponseTime(docs) {
    let totalTime = 0;
    let count = 0;

    docs.forEach(doc => {
        const msgs = doc.messages || [];
        for (let i = 0; i < msgs.length - 1; i++) {
            const current = msgs[i];
            const next = msgs[i + 1];

            if (current.sender === 'user' && next.sender === 'bot') {
                const t1 = new Date(current.createdAt || current.time).getTime();
                const t2 = new Date(next.createdAt || next.time).getTime();
                const diff = t2 - t1;

                if (diff > 0 && diff < 60000) {
                    totalTime += diff;
                    count++;
                }
            }
        }
    });

    return count > 0 ? (totalTime / count / 1000).toFixed(2) : '0.00';
}

/**
 * Calculate happiness score from likes/dislikes / คำนวณคะแนนความสุข
 */
function calculateHappiness(likes, dislikes) {
    const total = likes + dislikes;

    if (total === 0) {
        return { score: 0, status: 'ไม่มีข้อมูล', emoji: '😐' };
    }

    const score = (likes / total) * 100;

    if (score >= 75) return { score, status: 'มีความสุขมาก (Very Happy)', emoji: '🤩' };
    if (score >= 50) return { score, status: 'มีความสุข (Happy)', emoji: '🙂' };
    if (score >= 25) return { score, status: 'ไม่มีความสุข (Unhappy)', emoji: '😟' };
    return { score, status: 'ไม่มีความสุขมาก (Very Unhappy)', emoji: '😭' };
}

/**
 * Format duration from milliseconds / แปลงระยะเวลาจาก milliseconds
 */
function formatDuration(ms) {
    if (ms < 60000) return (ms / 1000).toFixed(2) + ' s';
    return (ms / 60000).toFixed(2) + ' m';
}

// ===================
// WORD FREQUENCY / ความถี่คำ
// ===================

/**
 * Compute word frequency for given query / คำนวณความถี่คำ
 */
async function computeWordFrequency(query) {
    try {
        const docs = await ChatModel.find(query).lean();
        const texts = docs.flatMap(doc =>
            (doc.messages || [])
                .filter(m => m.sender === 'user')
                .map(m => m.text || '')
        );

        const words = texts.flatMap(t => t.toLowerCase().split(/\s+/));
        const filtered = sw.removeStopwords(words, THAI_STOPWORDS);

        const freq = {};
        filtered.forEach(word => {
            if (word.length > 1) {
                freq[word] = (freq[word] || 0) + 1;
            }
        });

        const sorted = Object.entries(freq)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10);

        return Object.fromEntries(sorted);
    } catch (error) {
        console.error('Word frequency computation error:', error);
        return {};
    }
}

// ===================
// DASHBOARD STATS / สถิติแดชบอร์ด
// ===================

/**
 * Compute dashboard statistics for a period / คำนวณสถิติ dashboard
 */
async function computeDashboardStats(period) {
    try {
        const query = getQueryForPeriod(period);

        // MongoDB aggregation for stats / ใช้ aggregation คำนวณสถิติ
        let stats;
        try {
            [stats] = await ChatModel.aggregate([
                { $match: query },
                {
                    $facet: {
                        docCount: [{ $count: 'count' }],
                        totalMessages: [
                            { $project: { count: { $size: { $ifNull: ["$messages", []] } } } },
                            { $group: { _id: null, count: { $sum: "$count" } } }
                        ],
                        feedback: [
                            { $unwind: '$messages' },
                            { $match: { 'messages.feedback': { $in: ['like', 'dislike'] } } },
                            { $group: { _id: '$messages.feedback', count: { $sum: 1 } } }
                        ],
                        duration: [
                            {
                                $project: {
                                    msgs: {
                                        $filter: {
                                            input: '$messages',
                                            as: 'm',
                                            cond: {
                                                $or: [
                                                    { $ne: ['$m.createdAt', null] },
                                                    { $ne: ['$m.time', null] }
                                                ]
                                            }
                                        }
                                    }
                                }
                            },
                            {
                                $project: {
                                    start: {
                                        $min: {
                                            $map: {
                                                input: '$msgs',
                                                as: 'm',
                                                in: { $toDate: { $ifNull: ['$m.createdAt', '$m.time'] } }
                                            }
                                        }
                                    },
                                    end: {
                                        $max: {
                                            $map: {
                                                input: '$msgs',
                                                as: 'm',
                                                in: { $toDate: { $ifNull: ['$m.createdAt', '$m.time'] } }
                                            }
                                        }
                                    },
                                    msgCount: { $size: '$msgs' }
                                }
                            },
                            { $match: { msgCount: { $gt: 1 } } },
                            { $project: { duration: { $subtract: ['$end', '$start'] } } },
                            { $group: { _id: null, avgDuration: { $avg: '$duration' } } }
                        ]
                    }
                }
            ]);
        } catch (aggError) {
            console.error(`Aggregation error:`, aggError.message);
            stats = { totalMessages: [], feedback: [], duration: [] };
        }

        // Extract basic stats / แยกสถิติพื้นฐาน
        const totalMessages = stats?.totalMessages?.[0]?.count || 0;
        let totalLikes = 0;
        let totalDislikes = 0;

        stats.feedback?.forEach(f => {
            if (f._id === 'like') totalLikes = f.count;
            if (f._id === 'dislike') totalDislikes = f.count;
        });

        const avgDurationMs = stats.duration[0]?.avgDuration || 0;
        const avgSessionDuration = formatDuration(avgDurationMs);

        // Calculate response time / คำนวณเวลาตอบกลับ
        const lightDocs = await ChatModel.find(query)
            .select('messages.sender messages.createdAt messages.time')
            .lean();
        const avgResponseTime = calculateResponseTime(lightDocs);

        // Calculate happiness / คำนวณความสุข
        const happiness = calculateHappiness(totalLikes, totalDislikes);

        return {
            totalMessages,
            avgResponseTime,
            avgSessionDuration,
            totalLikes,
            totalDislikes,
            happiness: {
                score: parseFloat(happiness.score.toFixed(2)),
                status: happiness.status,
                emoji: happiness.emoji
            }
        };
    } catch (error) {
        console.error(`Dashboard stats computation error for ${period}:`, error);
        return {
            totalMessages: 0,
            avgResponseTime: '0.00',
            avgSessionDuration: '0.00s',
            totalLikes: 0,
            totalDislikes: 0,
            happiness: { score: 0, status: 'ไม่มีข้อมูล', emoji: '😐' }
        };
    }
}

/**
 * Compute analytics data for caching / คำนวณข้อมูล analytics สำหรับ cache
 */
async function computeAnalyticsData(query, period) {
    try {
        // Session trends / แนวโน้มเซสชัน
        const sessionTrend = await ChatModel.aggregate([
            { $match: query },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } },
            { $project: { date: '$_id', count: 1, _id: 0 } }
        ]);

        const feedbackTrend = await ChatModel.aggregate([
            { $match: query },
            { $unwind: '$messages' },
            { $match: { 'messages.feedback': { $in: ['like', 'dislike'] } } },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: '%Y-%m-%d', date: { $ifNull: ['$messages.createdAt', '$messages.time'] } } },
                        feedback: '$messages.feedback'
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.date': 1 } }
        ]);

        const feedbackByDate = {};
        feedbackTrend.forEach(item => {
            const date = item._id.date;
            if (!feedbackByDate[date]) feedbackByDate[date] = { date, likes: 0, dislikes: 0 };
            if (item._id.feedback === 'like') feedbackByDate[date].likes = item.count;
            if (item._id.feedback === 'dislike') feedbackByDate[date].dislikes = item.count;
        });

        const sessionTrends = {
            sessionTrend,
            feedbackTrend: Object.values(feedbackByDate)
        };

        // Peak hours / ช่วงเวลายอดนิยม
        const hourlyData = await ChatModel.aggregate([
            { $match: query },
            { $unwind: '$messages' },
            {
                $project: {
                    hour: {
                        $hour: {
                            $ifNull: ['$messages.createdAt', '$messages.time']
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$hour',
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const heatmap = Array.from({ length: 24 }, (_, i) => {
            const found = hourlyData.find(h => h._id === i);
            return { hour: i, count: found ? found.count : 0 };
        });

        const peakHours = { heatmap, hourly: hourlyData };

        // Top questions / คำถามยอดนิยม
        const topQuestions = await ChatModel.aggregate([
            { $match: query },
            { $unwind: '$messages' },
            { $match: { 'messages.sender': 'user' } },
            { $match: { 'messages.text': { $nin: THAI_STOPWORDS } } },
            {
                $group: {
                    _id: '$messages.text',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
            {
                $project: {
                    text: '$_id',
                    count: 1,
                    _id: 0
                }
            }
        ]);

        // Users analytics / สถิติผู้ใช้
        const uniqueSessions = await ChatModel.countDocuments(query);

        const sessionsPerDay = await ChatModel.aggregate([
            { $match: query },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
                    sessions: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } },
            {
                $project: {
                    date: '$_id',
                    sessions: 1,
                    _id: 0
                }
            }
        ]);

        const avgMessages = await ChatModel.aggregate([
            { $match: query },
            {
                $project: {
                    messageCount: { $size: '$messages' }
                }
            },
            {
                $group: {
                    _id: null,
                    avgMessages: { $avg: '$messageCount' }
                }
            }
        ]);

        const usersAnalytics = {
            uniqueSessions,
            sessionsPerDay,
            avgMessagesPerSession: avgMessages[0]?.avgMessages?.toFixed(2) || '0'
        };

        return {
            sessionTrends,
            peakHours,
            topQuestions: { topQuestions },
            usersAnalytics
        };

    } catch (error) {
        console.error(`Analytics computation error for ${period}:`, error);
        return {
            sessionTrends: { sessionTrend: [], feedbackTrend: [] },
            peakHours: { heatmap: [], hourly: [] },
            topQuestions: { topQuestions: [] },
            usersAnalytics: { uniqueSessions: 0, sessionsPerDay: [], avgMessagesPerSession: '0' }
        };
    }
}

// ===================
// MAIN API FUNCTIONS / ฟังก์ชัน API หลัก
// ===================

/**
 * Get dashboard overview (real-time computation) / ดึงภาพรวม dashboard
 */
async function getDashboardOverview(period = 'all') {
    // Always compute fresh stats from JSON files / คำนวณ real-time จากไฟล์ JSON
    const dashboardStats = await computeDashboardStats(period);

    // Compute word frequency fresh / คำนวณความถี่คำแบบ real-time
    const query = getQueryForPeriod(period);
    const wordFreq = await computeWordFrequency(query);

    return {
        period,
        ...dashboardStats,
        wordFreq,
        status: 'Online',
        timestamp: new Date()
    };
}

/**
 * Get word frequency data / ดึงข้อมูลความถี่คำ
 */
function getWordFrequency(period = 'all') {
    return readCache(CACHE_FILE, period) || {};
}

/**
 * Update all caches manually / อัปเดต cache ทั้งหมดด้วยตนเอง
 */
async function updateAllCaches() {
    const todayStr = new Date().toLocaleDateString('en-CA');
    const dashboardCache = {};
    const wordFreqCache = {};
    const analyticsCache = {};

    // Update all caches for all periods / อัปเดต cache ทุกช่วงเวลา
    for (const period of VALID_PERIODS) {
        const query = getQueryForPeriod(period);

        // Compute dashboard stats / คำนวณสถิติ dashboard
        const dashboardStats = await computeDashboardStats(period);
        dashboardCache[period] = {
            date: todayStr,
            timestamp: Date.now(),
            data: dashboardStats
        };

        // Compute word frequency / คำนวณความถี่คำ
        const wordFreq = await computeWordFrequency(query);
        wordFreqCache[period] = {
            date: todayStr,
            timestamp: Date.now(),
            data: wordFreq
        };

        // Compute analytics data / คำนวณข้อมูล analytics
        const analyticsData = await computeAnalyticsData(query, period);
        analyticsCache[period] = {
            date: todayStr,
            timestamp: Date.now(),
            data: analyticsData
        };
    }

    // Write all cache files / เขียนไฟล์ cache ทั้งหมด
    const dashboardSuccess = writeCache(DASHBOARD_CACHE_FILE, dashboardCache);
    const wordFreqSuccess = writeCache(CACHE_FILE, wordFreqCache);
    const analyticsSuccess = writeCache(ANALYTICS_CACHE_FILE, analyticsCache);

    return {
        success: dashboardSuccess && wordFreqSuccess && analyticsSuccess,
        timestamp: new Date()
    };
}

// ===================
// ANALYTICS FUNCTIONS / ฟังก์ชัน Analytics
// ===================

/**
 * Get session trends over time (real-time) / ดึงแนวโน้ม sessions
 */
async function getSessionTrends(period = '7days') {
    const query = getQueryForPeriod(period);

    const sessionTrend = await ChatModel.aggregate([
        { $match: query },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } },
        { $project: { date: '$_id', count: 1, _id: 0 } }
    ]);

    const feedbackTrend = await ChatModel.aggregate([
        { $match: query },
        { $unwind: '$messages' },
        { $match: { 'messages.feedback': { $in: ['like', 'dislike'] } } },
        {
            $group: {
                _id: {
                    date: { $dateToString: { format: '%Y-%m-%d', date: { $ifNull: ['$messages.createdAt', '$messages.time'] } } },
                    feedback: '$messages.feedback'
                },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id.date': 1 } }
    ]);

    const feedbackByDate = {};
    feedbackTrend.forEach(item => {
        const date = item._id.date;
        if (!feedbackByDate[date]) feedbackByDate[date] = { date, likes: 0, dislikes: 0 };
        if (item._id.feedback === 'like') feedbackByDate[date].likes = item.count;
        if (item._id.feedback === 'dislike') feedbackByDate[date].dislikes = item.count;
    });

    return {
        sessionTrend,
        feedbackTrend: Object.values(feedbackByDate)
    };
}

/**
 * Get peak hours (real-time) / ดึงช่วงเวลาที่ใช้งานสูงสุด
 */
async function getPeakHours(period = '7days') {
    const query = getQueryForPeriod(period);

    try {
        const hourlyData = await ChatModel.aggregate([
            { $match: query },
            { $unwind: '$messages' },
            {
                $project: {
                    hour: {
                        $hour: {
                            $ifNull: ['$messages.createdAt', '$messages.time']
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$hour',
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const heatmap = Array.from({ length: 24 }, (_, i) => {
            const found = hourlyData.find(h => h._id === i);
            return { hour: i, count: found ? found.count : 0 };
        });

        return { heatmap, hourly: hourlyData };
    } catch (error) {
        console.error('Peak hours computation error:', error);
        return { heatmap: [], hourly: [] };
    }
}

/**
 * Get top questions (real-time) / ดึงคำถามยอดนิยม
 */
async function getTopQuestions(period = '7days', limit = 10) {
    const query = getQueryForPeriod(period);

    try {
        const topQuestions = await ChatModel.aggregate([
            { $match: query },
            { $unwind: '$messages' },
            { $match: { 'messages.sender': 'user' } },
            { $match: { 'messages.text': { $nin: THAI_STOPWORDS } } },
            {
                $group: {
                    _id: '$messages.text',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: limit },
            {
                $project: {
                    text: '$_id',
                    count: 1,
                    _id: 0
                }
            }
        ]);

        return { topQuestions };
    } catch (error) {
        console.error('Top questions computation error:', error);
        return { topQuestions: [] };
    }
}

/**
 * Get users analytics (real-time) / ดึงสถิติผู้ใช้
 */
async function getUsersAnalytics(period = '7days') {
    const query = getQueryForPeriod(period);

    try {
        const uniqueSessions = await ChatModel.countDocuments(query);

        const sessionsPerDay = await ChatModel.aggregate([
            { $match: query },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
                    sessions: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } },
            {
                $project: {
                    date: '$_id',
                    sessions: 1,
                    _id: 0
                }
            }
        ]);

        const avgMessages = await ChatModel.aggregate([
            { $match: query },
            {
                $project: {
                    messageCount: { $size: '$messages' }
                }
            },
            {
                $group: {
                    _id: null,
                    avgMessages: { $avg: '$messageCount' }
                }
            }
        ]);

        const avgMessagesPerSession = avgMessages[0]?.avgMessages?.toFixed(2) || '0';

        return {
            uniqueSessions,
            sessionsPerDay,
            avgMessagesPerSession
        };
    } catch (error) {
        console.error('Users analytics computation error:', error);
        return { uniqueSessions: 0, sessionsPerDay: [], avgMessagesPerSession: '0' };
    }
}

// ===================
// EXPORTS / การส่งออก
// ===================

module.exports = {
    // Main API functions / ฟังก์ชัน API หลัก
    getDashboardOverview,
    getWordFrequency,
    updateAllCaches,

    // Analytics functions / ฟังก์ชัน Analytics
    getSessionTrends,
    getPeakHours,
    getTopQuestions,
    getUsersAnalytics,

    // Utility functions / ฟังก์ชันอรรถประโยชน์
    readCache,
    writeCache,
    isCacheFresh,
    computeAnalyticsData,

    // Constants / ค่าคงที่
    UPDATE_INTERVAL_MS,
    STARTUP_DELAY_MS,
    ANALYTICS_CACHE_FILE
};
