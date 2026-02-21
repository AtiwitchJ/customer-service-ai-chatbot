/**
 * RAG Service Module
 * ==================
 * Responsibilities:
 * - Central entry point for RAG (Retrieval-Augmented Generation) services.
 * - Routes requests to File Display Module (Node.js).
 * - Proxies upload requests to Python Pipeline Service (FastAPI).
 * 
 * หน้าที่หลัก:
 * - จุดเชื่อมต่อหลักสำหรับระบบ RAG
 * - จัดการ Route ไปยัง File Display Module (Node.js)
 * - ส่งต่อ Request การอัปโหลดไปยัง Python Pipeline Service (FastAPI)
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const fileDisplayService = require('./file_display/file_display_service');

// Create main router
const router = express.Router();

// Upload proxy to Python service
// Default to localhost for local dev if env not set
const uploadProxyUrl = process.env.RAG_UPLOAD_PROXY_URL;

const uploadProxy = createProxyMiddleware({
    target: uploadProxyUrl,
    changeOrigin: true,
    pathRewrite: (path, req) => {
        // Since we are mounting at root '/', 'path' is the full path (e.g. '/upload', '/documents/...')
        // Python service now listens on '/upload', '/documents/...' directly (no '/api' prefix needed)

        if (path.startsWith('/health')) return '/health';

        // Return path as is
        return path;
    },
    onError: (err, req, res) => {
        console.error('❌ [Upload Proxy] Error:', err.message);
        res.status(500).json({
            success: false,
            message: 'Upload service unavailable',
            error: err.message
        });
    },
    onProxyReq: (proxyReq, req, res) => {
        console.log(`🔄 [Upload Proxy] ${req.method} ${req.originalUrl} -> ${uploadProxyUrl}${proxyReq.path}`);
    },
    onProxyRes: (proxyRes, req, res) => {
        console.log(`✅ [Upload Proxy] Response: ${proxyRes.statusCode} for ${req.originalUrl}`);
    }
});

// Mount file display module (First, to handle /files and /view specific routes)
router.use('/', fileDisplayService);  // File display and management module

// Mount upload proxy for other routes (Catch-all for /api/* requests intended for Python)
router.use('/', uploadProxy);

console.log('✅ [RAG Service] File Display module mounted at "/" (Pre-Proxy)');
console.log('✅ [RAG Service] Upload Proxy mounted at "/" (Post-Check)');
console.log(`✅ [RAG Service] Proxy settings matched to -> ${uploadProxyUrl}`);

module.exports = router;
