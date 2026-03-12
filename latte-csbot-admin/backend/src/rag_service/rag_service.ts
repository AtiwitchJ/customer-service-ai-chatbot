/**
 * RAG Service Module
 * ==================
 * Central entry point for RAG services.
 * Routes to File Display Module and proxies upload to Python Pipeline.
 */

import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import fileDisplayService from './file_display/file_display_service';

const router = Router();

const uploadProxyUrl = process.env.RAG_UPLOAD_PROXY_URL;

const uploadProxy = createProxyMiddleware({
  target: uploadProxyUrl || 'http://localhost:8000',
  changeOrigin: true,
  pathRewrite: (path: string) => {
    if (path.startsWith('/health')) return '/health';
    return path;
  },
  on: {
    error: (err: Error, _req: unknown, res: unknown) => {
      console.error('❌ [Upload Proxy] Error:', err.message);
      (res as { status: (n: number) => void; json: (o: object) => void }).status(500);
      (res as { json: (o: object) => void }).json({
        success: false,
        message: 'Upload service unavailable',
        error: err.message,
      });
    },
    proxyReq: (proxyReq: unknown, req: unknown) => {
      console.log(`🔄 [Upload Proxy] ${(req as { method: string; originalUrl: string }).method} ${(req as { originalUrl: string }).originalUrl} -> ${uploadProxyUrl}${(proxyReq as { path: string }).path}`);
    },
    proxyRes: (proxyRes: unknown, req: unknown) => {
      console.log(`✅ [Upload Proxy] Response: ${(proxyRes as { statusCode: number }).statusCode} for ${(req as { originalUrl: string }).originalUrl}`);
    },
  },
});

router.use('/', fileDisplayService);
router.use('/', uploadProxy);

console.log('✅ [RAG Service] File Display module mounted at "/" (Pre-Proxy)');
console.log('✅ [RAG Service] Upload Proxy mounted at "/" (Post-Check)');
console.log(`✅ [RAG Service] Proxy settings matched to -> ${uploadProxyUrl}`);

export default router;
