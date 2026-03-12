/**
 * Routes for File Display and Management
 */

import { Router } from 'express';
import {
  getFiles,
  deleteFile,
  bulkDelete,
  viewFile,
  getFileStats,
} from '../controllers/fileDisplayController';

const router = Router();

router.get('/files', getFiles);
router.get('/files/stats', getFileStats);
router.delete('/files/:id', deleteFile);
router.post('/files/bulk-delete', bulkDelete);

router.use('/view', viewFile);

export default router;
