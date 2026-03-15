/**
 * Chat API Server Entry Point
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Server } from 'ws';
import * as path from 'path';
import morgan from 'morgan';

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

import './src/config/db';
import { generalLimiter, authLimiter, chatLimiter } from './src/middlewares/rateLimit';
import authRouter from './src/routes/authRouter';
import chatRouter, { setWss } from './src/routes/chatRouter';

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (process.env.NODE_ENV === 'development') {
        if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
          return callback(null, true);
        }
      }
      if (allowedOrigins.indexOf(origin) === -1) {
        console.warn(`[SECURITY] CORS blocked origin: ${origin}`);
        return callback(new Error('CORS policy violation'), false);
      }
      return callback(null, true);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  })
);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'wss:', 'ws:', 'https://api.ipify.org', ...allowedOrigins],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'sameorigin' },
    hidePoweredBy: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  })
);

app.use(morgan('combined'));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use(generalLimiter);
app.use('/auth/login', authLimiter);
app.use('/webhook/send', chatLimiter);
app.use('/chat/feedback', chatLimiter);

app.get('/config', (_req, res) => {
  res.json({
    API_BASE: process.env.API_BASE,
    WEBHOOK_URL: `${process.env.API_BASE}/webhook/send`,
    AFK_TIMEOUT_MS: parseInt(process.env.AFK_TIMEOUT_MS || '300000', 10),
    AFK_WARNING_MS: 30000,
    BACKGROUND_TIMEOUT_MS: parseInt(process.env.BACKGROUND_TIMEOUT_MS || '180000', 10),
    WS_RECONNECT_DELAY_MS: parseInt(process.env.WS_RECONNECT_DELAY_MS || '5000', 10),
  });
});

app.use('/', authRouter);
app.use('/', chatRouter);

app.use((_req, res) => {
  res.status(404).json({ status: 'error', message: 'Not Found' });
});

app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response) => {
  console.error(`[ERROR] ${err.message}`);
  const message =
    process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message;
  res.status(err.status || 500).json({ status: 'error', message });
});

const PORT = process.env.PORT;
const server = app.listen(PORT, () =>
  console.log(`✅ Chat API running on port ${PORT}`)
);

const wss = new Server({ server });

setWss(wss);

wss.on('connection', (ws) => {
  console.log('🔌 WS Connected');
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'init') {
        (ws as { sessionId?: string }).sessionId = msg.sessionId;
        console.log(`✅ WS Init: ${msg.sessionId}`);
      }
    } catch (e) {
      console.error('WS message parse error:', e);
    }
  });
  ws.on('close', () => console.log('❌ WS Disconnected'));
});

console.log(`✅ WebSocket Server started on port ${PORT}`);
