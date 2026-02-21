const express = require('express');
const {
    getFiles,
    deleteFile,
    bulkDelete,
    viewFile,
    getFileStats
} = require('../controllers/fileDisplayController');

/**
 * Routes for File Display and Management
 * ======================================
 * - Wraps controller functions into Express routes.
 * - Structure matches Python's route style (Direct Import).
 */
const router = express.Router();

// File listing and management routes
router.get('/files', getFiles);
router.get('/files/stats', getFileStats);
router.delete('/files/:id', deleteFile);
router.post('/files/bulk-delete', bulkDelete);

// File viewing route
router.use('/view', viewFile);

module.exports = router;