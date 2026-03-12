/**
 * MAIN SERVER (Express Entry Point)
 * ==================================
 * Initialize Express server and mount all service routes
 */

import * as path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

import chatRouter from './src/chat_service/chat_service';
import dashboardRouter from './src/dashboard_service/dashboard_service';
import ragRouter from './src/rag_service/rag_service';

const app = express();
const PORT = process.env.PORT;

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
  const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
  console.log(`🔔 [LOG] ${req.method} ${req.originalUrl}`);

  if (req.originalUrl.includes('/view')) {
    console.log(`🔍 [VIEW_DEBUG] OriginalUrl: ${req.originalUrl}`);
    console.log(`🔍 [VIEW_DEBUG] Path: ${req.path}`);
    console.log(`🔍 [VIEW_DEBUG] Full: ${fullUrl}`);
  }
  next();
});

app.all(/^\/api\/view\/(.*)/, (req, res, next) => {
  const rawPath = req.originalUrl.split('/api/view/')[1];
  console.log(`🚀 [GLOBAL_VIEW] Caught: ${rawPath}`);
  (req as express.Request & { rawFilePath?: string }).rawFilePath = rawPath;
  next();
});

app.use(express.static(__dirname));

app.use('/api', chatRouter);
app.use('/api', dashboardRouter);
app.use('/api', ragRouter);

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📁 Services Loaded: Chat, Dashboard, RAG`);
});
