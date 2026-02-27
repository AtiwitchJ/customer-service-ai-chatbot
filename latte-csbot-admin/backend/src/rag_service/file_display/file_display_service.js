/**
 * FILE DISPLAY SERVICE MODULE
 * Main entry point for File Display service
 * Structure matches dashboard_service.js
 */

const express = require('express');
const fileDisplayRoutes = require('./routes/fileDisplayRoutes');

const router = express.Router();

// Mount routes
router.use('/', fileDisplayRoutes);

module.exports = router;