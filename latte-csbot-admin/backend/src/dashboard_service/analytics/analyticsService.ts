/**
 * UNIFIED ANALYTICS SERVICE
 * =========================
 * All analytics functionality in one place / รวมฟังก์ชัน analytics ทั้งหมดไว้ที่เดียว
 */

import * as fs from 'fs';
import * as path from 'path';
import { removeStopwords } from 'stopword';
import ChatModel from '../../chat_service/models/JsonChatModel';
import type { PeriodType } from '../../types';

const CACHE_FILE = path.join(__dirname, '../utils/wordfreq_cache.json');
const DASHBOARD_CACHE_FILE = path.join(__dirname, '../utils/dashboard_cache.json');
const ANALYTICS_CACHE_FILE = path.join(__dirname, '../utils/analytics_cache.json');
const UPDATE_INTERVAL_MS = 5 * 60 * 1000;
const STARTUP_DELAY_MS = 5000;

const THAI_STOPWORDS = [
  'ฉันต้องการ',
  'ฉันไม่ต้องการ',
  'คือ',
  'และ',
  'หรือ',
  'ครับ',
  'ค่ะ',
  'อยาก',
  'ไหม',
  'ไร',
  'สอบถาม',
  'ไม่',
  'มี',
];

const VALID_PERIODS: PeriodType[] = ['last_day', '7days', '30days', '1year', 'all'];

function getQueryForPeriod(period: string): Record<string, unknown> {
  const now = new Date();
  const periodDays: Record<string, number> = {
    last_day: 1,
    '7days': 7,
    '30days': 30,
    '1year': 365,
  };

  if (periodDays[period]) {
    const date = new Date(now);
    date.setDate(now.getDate() - periodDays[period]);
    return { updatedAt: { $gte: date } };
  }

  return {};
}

function readCache(filePath: string, period = 'all'): unknown {
  if (!fs.existsSync(filePath)) return null;
  try {
    const cache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return cache[period]?.data ?? null;
  } catch (error) {
    console.error(`Cache read error for ${filePath}:`, error);
    return null;
  }
}

function writeCache(filePath: string, data: unknown): boolean {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Cache write error for ${filePath}:`, error);
    return false;
  }
}

function isCacheFresh(filePath: string, period: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  try {
    const cache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const periodCache = cache[period];
    if (!periodCache) return false;
    const now = Date.now();
    const cacheAge = now - periodCache.timestamp;
    const maxAge = 5 * 60 * 1000;
    return cacheAge < maxAge;
  } catch {
    return false;
  }
}

interface DocWithMessages {
  messages?: Array<{ sender?: string; createdAt?: unknown; time?: unknown }>;
}

function calculateResponseTime(docs: DocWithMessages[]): string {
  let totalTime = 0;
  let count = 0;

  docs.forEach((doc) => {
    const msgs = doc.messages || [];
    for (let i = 0; i < msgs.length - 1; i++) {
      const current = msgs[i];
      const next = msgs[i + 1];
      if (current?.sender === 'user' && next?.sender === 'bot') {
        const t1 = new Date((current.createdAt || current.time) as string | number).getTime();
        const t2 = new Date((next.createdAt || next.time) as string | number).getTime();
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

function calculateHappiness(
  likes: number,
  dislikes: number
): { score: number; status: string; emoji: string } {
  const total = likes + dislikes;
  if (total === 0) return { score: 0, status: 'ไม่มีข้อมูล', emoji: '😐' };
  const score = (likes / total) * 100;
  if (score >= 75) return { score, status: 'มีความสุขมาก (Very Happy)', emoji: '🤩' };
  if (score >= 50) return { score, status: 'มีความสุข (Happy)', emoji: '🙂' };
  if (score >= 25) return { score, status: 'ไม่มีความสุข (Unhappy)', emoji: '😟' };
  return { score, status: 'ไม่มีความสุขมาก (Very Unhappy)', emoji: '😭' };
}

function formatDuration(ms: number): string {
  if (ms < 60000) return (ms / 1000).toFixed(2) + ' s';
  return (ms / 60000).toFixed(2) + ' m';
}

async function computeWordFrequency(query: Record<string, unknown>): Promise<Record<string, number>> {
  try {
    const docs = await ChatModel.find(query).lean();
    const texts = (docs as DocWithMessages[]).flatMap((doc) =>
      (doc.messages || []).filter((m) => m.sender === 'user').map((m) => (m as { text?: string }).text || '')
    );

    const words = texts.flatMap((t) => t.toLowerCase().split(/\s+/));
    const filtered = removeStopwords(words, THAI_STOPWORDS);

    const freq: Record<string, number> = {};
    filtered.forEach((word: string) => {
      if (word.length > 1) freq[word] = (freq[word] || 0) + 1;
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

interface FacetStats {
  totalMessages?: Array<{ count: number }>;
  feedback?: Array<{ _id: string; count: number }>;
  duration?: Array<{ avgDuration: number }>;
}

async function computeDashboardStats(period: string): Promise<{
  totalMessages: number;
  avgResponseTime: string;
  avgSessionDuration: string;
  totalLikes: number;
  totalDislikes: number;
  happiness: { score: number; status: string; emoji: string };
}> {
  try {
    const query = getQueryForPeriod(period);
    let stats: FacetStats;

    try {
      const [aggResult] = await ChatModel.aggregate([
        { $match: query },
        {
          $facet: {
            docCount: [{ $count: 'count' }],
            totalMessages: [
              { $project: { count: { $size: { $ifNull: ['$messages', []] } } } },
              { $group: { _id: null, count: { $sum: '$count' } } },
            ],
            feedback: [
              { $unwind: '$messages' },
              { $match: { 'messages.feedback': { $in: ['like', 'dislike'] } } },
              { $group: { _id: '$messages.feedback', count: { $sum: 1 } } },
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
                          { $ne: ['$m.time', null] },
                        ],
                      },
                    },
                  },
                },
              },
              {
                $project: {
                  start: {
                    $min: {
                      $map: {
                        input: '$msgs',
                        as: 'm',
                        in: { $toDate: { $ifNull: ['$m.createdAt', '$m.time'] } },
                      },
                    },
                  },
                  end: {
                    $max: {
                      $map: {
                        input: '$msgs',
                        as: 'm',
                        in: { $toDate: { $ifNull: ['$m.createdAt', '$m.time'] } },
                      },
                    },
                  },
                  msgCount: { $size: '$msgs' },
                },
              },
              { $match: { msgCount: { $gt: 1 } } },
              { $project: { duration: { $subtract: ['$end', '$start'] } } },
              { $group: { _id: null, avgDuration: { $avg: '$duration' } } },
            ],
          },
        },
      ]);
      stats = aggResult as unknown as FacetStats;
    } catch (aggError) {
      console.error('Aggregation error:', (aggError as Error).message);
      stats = { totalMessages: [], feedback: [], duration: [] };
    }

    const totalMessages = stats?.totalMessages?.[0]?.count ?? 0;
    let totalLikes = 0;
    let totalDislikes = 0;

    stats.feedback?.forEach((f) => {
      if (f._id === 'like') totalLikes = f.count;
      if (f._id === 'dislike') totalDislikes = f.count;
    });

    const avgDurationMs = stats.duration?.[0]?.avgDuration ?? 0;
    const avgSessionDuration = formatDuration(avgDurationMs);

    const lightDocs = (await ChatModel.find(query)
      .select('messages.sender messages.createdAt messages.time')
      .lean()) as DocWithMessages[];
    const avgResponseTime = calculateResponseTime(lightDocs);

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
        emoji: happiness.emoji,
      },
    };
  } catch (error) {
    console.error(`Dashboard stats computation error for ${period}:`, error);
    return {
      totalMessages: 0,
      avgResponseTime: '0.00',
      avgSessionDuration: '0.00s',
      totalLikes: 0,
      totalDislikes: 0,
      happiness: { score: 0, status: 'ไม่มีข้อมูล', emoji: '😐' },
    };
  }
}

async function computeAnalyticsData(
  query: Record<string, unknown>,
  period: string
): Promise<{
  sessionTrends: { sessionTrend: unknown[]; feedbackTrend: unknown[] };
  peakHours: { heatmap: unknown[]; hourly: unknown[] };
  topQuestions: { topQuestions: unknown[] };
  usersAnalytics: {
    uniqueSessions: number;
    sessionsPerDay: unknown[];
    avgMessagesPerSession: string;
  };
}> {
  try {
    const sessionTrend = await ChatModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', count: 1, _id: 0 } },
    ]);

    const feedbackTrend = await ChatModel.aggregate([
      { $match: query },
      { $unwind: '$messages' },
      { $match: { 'messages.feedback': { $in: ['like', 'dislike'] } } },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: { $ifNull: ['$messages.createdAt', '$messages.time'] },
              },
            },
            feedback: '$messages.feedback',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.date': 1 } },
    ]);

    const feedbackByDate: Record<string, { date: string; likes: number; dislikes: number }> = {};
    (feedbackTrend as Array<{ _id: { date: string; feedback: string }; count: number }>).forEach((item) => {
      const date = item._id.date;
      if (!feedbackByDate[date]) feedbackByDate[date] = { date, likes: 0, dislikes: 0 };
      if (item._id.feedback === 'like') feedbackByDate[date].likes = item.count;
      if (item._id.feedback === 'dislike') feedbackByDate[date].dislikes = item.count;
    });

    const hourlyData = await ChatModel.aggregate([
      { $match: query },
      { $unwind: '$messages' },
      {
        $project: {
          hour: {
            $hour: {
              $ifNull: ['$messages.createdAt', '$messages.time'],
            },
          },
        },
      },
      { $group: { _id: '$hour', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    const heatmap = Array.from({ length: 24 }, (_, i) => {
      const found = (hourlyData as Array<{ _id: number; count: number }>).find((h) => h._id === i);
      return { hour: i, count: found ? found.count : 0 };
    });

    const topQuestions = await ChatModel.aggregate([
      { $match: query },
      { $unwind: '$messages' },
      { $match: { 'messages.sender': 'user' } },
      { $match: { 'messages.text': { $nin: THAI_STOPWORDS } } },
      { $group: { _id: '$messages.text', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { text: '$_id', count: 1, _id: 0 } },
    ]);

    const uniqueSessions = await ChatModel.countDocuments(query);

    const sessionsPerDay = await ChatModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
          sessions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', sessions: 1, _id: 0 } },
    ]);

    const avgMessages = await ChatModel.aggregate([
      { $match: query },
      { $project: { messageCount: { $size: '$messages' } } },
      { $group: { _id: null, avgMessages: { $avg: '$messageCount' } } },
    ]);

    return {
      sessionTrends: {
        sessionTrend,
        feedbackTrend: Object.values(feedbackByDate),
      },
      peakHours: { heatmap, hourly: hourlyData },
      topQuestions: { topQuestions },
      usersAnalytics: {
        uniqueSessions,
        sessionsPerDay,
        avgMessagesPerSession: (avgMessages[0] as { avgMessages?: number })?.avgMessages?.toFixed(2) || '0',
      },
    };
  } catch (error) {
    console.error(`Analytics computation error for ${period}:`, error);
    return {
      sessionTrends: { sessionTrend: [], feedbackTrend: [] },
      peakHours: { heatmap: [], hourly: [] },
      topQuestions: { topQuestions: [] },
      usersAnalytics: { uniqueSessions: 0, sessionsPerDay: [], avgMessagesPerSession: '0' },
    };
  }
}

async function getDashboardOverview(period = 'all'): Promise<Record<string, unknown>> {
  const dashboardStats = await computeDashboardStats(period);
  const query = getQueryForPeriod(period);
  const wordFreq = await computeWordFrequency(query);

  return {
    period,
    ...dashboardStats,
    wordFreq,
    status: 'Online',
    timestamp: new Date(),
  };
}

function getWordFrequency(period = 'all'): Record<string, number> {
  return (readCache(CACHE_FILE, period) as Record<string, number>) || {};
}

async function updateAllCaches(): Promise<{ success: boolean; timestamp: Date }> {
  const todayStr = new Date().toLocaleDateString('en-CA');
  const dashboardCache: Record<string, unknown> = {};
  const wordFreqCache: Record<string, unknown> = {};
  const analyticsCache: Record<string, unknown> = {};

  for (const period of VALID_PERIODS) {
    const query = getQueryForPeriod(period);

    const dashboardStats = await computeDashboardStats(period);
    dashboardCache[period] = {
      date: todayStr,
      timestamp: Date.now(),
      data: dashboardStats,
    };

    const wordFreq = await computeWordFrequency(query);
    wordFreqCache[period] = {
      date: todayStr,
      timestamp: Date.now(),
      data: wordFreq,
    };

    const analyticsData = await computeAnalyticsData(query, period);
    analyticsCache[period] = {
      date: todayStr,
      timestamp: Date.now(),
      data: analyticsData,
    };
  }

  const dashboardSuccess = writeCache(DASHBOARD_CACHE_FILE, dashboardCache);
  const wordFreqSuccess = writeCache(CACHE_FILE, wordFreqCache);
  const analyticsSuccess = writeCache(ANALYTICS_CACHE_FILE, analyticsCache);

  return {
    success: dashboardSuccess && wordFreqSuccess && analyticsSuccess,
    timestamp: new Date(),
  };
}

async function getSessionTrends(period = '7days'): Promise<{
  sessionTrend: unknown[];
  feedbackTrend: unknown[];
}> {
  const query = getQueryForPeriod(period);

  const sessionTrend = await ChatModel.aggregate([
    { $match: query },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { date: '$_id', count: 1, _id: 0 } },
  ]);

  const feedbackTrend = await ChatModel.aggregate([
    { $match: query },
    { $unwind: '$messages' },
    { $match: { 'messages.feedback': { $in: ['like', 'dislike'] } } },
    {
      $group: {
        _id: {
          date: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: { $ifNull: ['$messages.createdAt', '$messages.time'] },
            },
          },
          feedback: '$messages.feedback',
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.date': 1 } },
  ]);

  const feedbackByDate: Record<string, { date: string; likes: number; dislikes: number }> = {};
  (feedbackTrend as Array<{ _id: { date: string; feedback: string }; count: number }>).forEach((item) => {
    const date = item._id.date;
    if (!feedbackByDate[date]) feedbackByDate[date] = { date, likes: 0, dislikes: 0 };
    if (item._id.feedback === 'like') feedbackByDate[date].likes = item.count;
    if (item._id.feedback === 'dislike') feedbackByDate[date].dislikes = item.count;
  });

  return {
    sessionTrend,
    feedbackTrend: Object.values(feedbackByDate),
  };
}

async function getPeakHours(period = '7days'): Promise<{ heatmap: unknown[]; hourly: unknown[] }> {
  const query = getQueryForPeriod(period);

  try {
    const hourlyData = await ChatModel.aggregate([
      { $match: query },
      { $unwind: '$messages' },
      {
        $project: {
          hour: {
            $hour: {
              $ifNull: ['$messages.createdAt', '$messages.time'],
            },
          },
        },
      },
      { $group: { _id: '$hour', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    const heatmap = Array.from({ length: 24 }, (_, i) => {
      const found = (hourlyData as Array<{ _id: number; count: number }>).find((h) => h._id === i);
      return { hour: i, count: found ? found.count : 0 };
    });

    return { heatmap, hourly: hourlyData };
  } catch (error) {
    console.error('Peak hours computation error:', error);
    return { heatmap: [], hourly: [] };
  }
}

async function getTopQuestions(
  period = '7days',
  limit = 10
): Promise<{ topQuestions: unknown[] }> {
  const query = getQueryForPeriod(period);

  try {
    const topQuestions = await ChatModel.aggregate([
      { $match: query },
      { $unwind: '$messages' },
      { $match: { 'messages.sender': 'user' } },
      { $match: { 'messages.text': { $nin: THAI_STOPWORDS } } },
      { $group: { _id: '$messages.text', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
      { $project: { text: '$_id', count: 1, _id: 0 } },
    ]);

    return { topQuestions };
  } catch (error) {
    console.error('Top questions computation error:', error);
    return { topQuestions: [] };
  }
}

async function getUsersAnalytics(period = '7days'): Promise<{
  uniqueSessions: number;
  sessionsPerDay: unknown[];
  avgMessagesPerSession: string;
}> {
  const query = getQueryForPeriod(period);

  try {
    const uniqueSessions = await ChatModel.countDocuments(query);

    const sessionsPerDay = await ChatModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
          sessions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', sessions: 1, _id: 0 } },
    ]);

    const avgMessages = await ChatModel.aggregate([
      { $match: query },
      { $project: { messageCount: { $size: '$messages' } } },
      { $group: { _id: null, avgMessages: { $avg: '$messageCount' } } },
    ]);

    const avgMessagesPerSession =
      (avgMessages[0] as { avgMessages?: number })?.avgMessages?.toFixed(2) || '0';

    return {
      uniqueSessions,
      sessionsPerDay,
      avgMessagesPerSession,
    };
  } catch (error) {
    console.error('Users analytics computation error:', error);
    return { uniqueSessions: 0, sessionsPerDay: [], avgMessagesPerSession: '0' };
  }
}

export {
  getDashboardOverview,
  getWordFrequency,
  updateAllCaches,
  getSessionTrends,
  getPeakHours,
  getTopQuestions,
  getUsersAnalytics,
  readCache,
  writeCache,
  isCacheFresh,
  computeAnalyticsData,
  UPDATE_INTERVAL_MS,
  STARTUP_DELAY_MS,
  ANALYTICS_CACHE_FILE,
};
