/**
 * DASHBOARD ROUTES
 * ================
 * API routes for dashboard functionality / เส้นทาง API สำหรับฟังก์ชัน dashboard
 */

import { Router } from 'express';
import multer from 'multer';
import {
  getOverview,
  getWordFreq,
  refreshStats,
  getTrends,
  getPeakHoursData,
  getTopQuestionsData,
  getUsersData,
} from '../controllers/dashboardController';
import { uploadChats } from '../controllers/uploadController';
import { exportChats, getStorageStatus } from '../controllers/exportController';

const router = Router();
const upload = multer({ dest: 'uploads/' });

router.get('/overview', getOverview);
router.get('/wordfreq', getWordFreq);
router.post('/refresh-stats', refreshStats);
router.post('/cache/update', refreshStats);

router.get('/analytics/trends', getTrends);
router.get('/analytics/peak-hours', getPeakHoursData);
router.get('/analytics/top-questions', getTopQuestionsData);
router.get('/analytics/users', getUsersData);

router.post('/upload/chats', upload.single('chatsFile'), uploadChats);

router.get('/export/chats', exportChats);
router.get('/export/status', getStorageStatus);

export default router;
