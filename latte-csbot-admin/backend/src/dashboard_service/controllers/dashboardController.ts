/**
 * UNIFIED DASHBOARD CONTROLLER
 * ============================
 * All dashboard controllers in one place / รวม controllers ทั้งหมดไว้ที่เดียว
 */

import { Request, Response } from 'express';
import {
  getDashboardOverview,
  getWordFrequency,
  updateAllCaches,
  getSessionTrends,
  getPeakHours,
  getTopQuestions,
  getUsersAnalytics,
} from '../analytics/analyticsService';

async function getOverview(req: Request, res: Response): Promise<void> {
  try {
    const period = (req.query.period as string) || 'all';
    const overview = await getDashboardOverview(period);
    res.json(overview);
  } catch (error) {
    console.error('Overview error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
}

function getWordFreq(req: Request, res: Response): void {
  try {
    const period = (req.query.period as string) || 'all';
    const data = getWordFrequency(period);
    res.json(data);
  } catch (error) {
    console.error('Word frequency error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
}

async function refreshStats(req: Request, res: Response): Promise<void> {
  try {
    const result = await updateAllCaches();
    res.json({
      success: result.success,
      message: 'All caches updated manually',
      timestamp: result.timestamp,
    });
  } catch (error) {
    console.error('Manual cache update error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
}

async function getTrends(req: Request, res: Response): Promise<void> {
  try {
    const period = (req.query.period as string) || 'all';
    const trends = await getSessionTrends(period);
    res.json(trends);
  } catch (error) {
    console.error('Trends error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
}

async function getPeakHoursData(req: Request, res: Response): Promise<void> {
  try {
    const period = (req.query.period as string) || 'all';
    const peakHours = await getPeakHours(period);
    res.json(peakHours);
  } catch (error) {
    console.error('Peak hours error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
}

async function getTopQuestionsData(req: Request, res: Response): Promise<void> {
  try {
    const period = (req.query.period as string) || 'all';
    const limit = parseInt(req.query.limit as string) || 10;
    const topQuestions = await getTopQuestions(period, limit);
    res.json(topQuestions);
  } catch (error) {
    console.error('Top questions error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
}

async function getUsersData(req: Request, res: Response): Promise<void> {
  try {
    const period = (req.query.period as string) || 'all';
    const usersAnalytics = await getUsersAnalytics(period);
    res.json(usersAnalytics);
  } catch (error) {
    console.error('Users analytics error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
}

export {
  getOverview,
  getWordFreq,
  refreshStats,
  getTrends,
  getPeakHoursData,
  getTopQuestionsData,
  getUsersData,
};
