/**
 * AI Agent - All-in-One Entry Point
 * ================================
 * Combines:
 * - Express Server
 * - Main BullMQ Worker
 * - Sub Workers (msform-worker, reset-worker)
 */

import * as path from 'path';

require('dotenv').config({ path: path.join(__dirname, '../.env') });

import express from 'express';
import { Worker } from 'bullmq';
import axios from 'axios';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Redis from 'ioredis';

import { startMsFormWorker, shutdownMsFormWorker } from './subflow/msform-worker';
import { startResetPasswordWorker, shutdownResetPasswordWorker } from './subflow/reset-worker';
import { processChatWorkflow } from './mainflow/app/services/workflow_service';

const CONFIG = {
  REDIS_HOST: process.env.REDIS_HOST,
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_QUEUE_DB: parseInt(process.env.REDIS_QUEUE_DB || '2', 10),
  AI_AGENT_QUEUE_NAME: process.env.AI_AGENT_QUEUE_NAME || 'ai-agent-queue',
  AGENT_WEBHOOK_URL: process.env.AGENT_WEBHOOK_URL,
  API_BASE: process.env.API_BASE,
  PORT: parseInt(process.env.AI_AGENT_PORT || '8765', 10),
  NODE_ENV: process.env.NODE_ENV || 'production',
};

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors());
app.use(express.json());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });
app.use(limiter);

app.get('/health', (_req, res) => {
  res.json({ status: 'up', timestamp: new Date().toISOString() });
});

app.post('/agent', async (req, res) => {
  const { sessionId, text } = req.body;

  if (!sessionId || !text) {
    return res.status(400).json({
      error: 'sessionId and text are required',
    });
  }

  console.log(`📩 Input Received (${sessionId}): ${text}`);

  res.json({ status: 'processing', sessionId });

  processChatWorkflow(sessionId, text).catch((err) => {
    console.error(`[Agent] ❌ processChatWorkflow error for ${sessionId}:`, (err as Error).message);
  });
});

const redisQueue = new Redis({
  host: CONFIG.REDIS_HOST,
  port: CONFIG.REDIS_PORT,
  password: CONFIG.REDIS_PASSWORD,
  db: CONFIG.REDIS_QUEUE_DB,
});

const mainWorker = new Worker(
  CONFIG.AI_AGENT_QUEUE_NAME,
  async (job) => {
    const { sessionId, text } = job.data as { sessionId: string; text: string };
    const jobId = job.id;

    console.log(`[MAIN-WORKER] Processing job ${jobId} for session ${sessionId}: "${text}"`);

    if (!CONFIG.AGENT_WEBHOOK_URL) {
      throw new Error('AGENT_WEBHOOK_URL is not configured');
    }

    try {
      const response = await axios.post(CONFIG.AGENT_WEBHOOK_URL, job.data, {
        timeout: 300000,
      });

      console.log(`[MAIN-WORKER] ✅ Job ${jobId} forwarded to Agent. Status: ${response.status}`);
      return response.data;
    } catch (error) {
      console.error(`[MAIN-WORKER] ❌ Job ${jobId} failed:`, (error as Error).message);

      if (CONFIG.API_BASE) {
        try {
          await axios.post(`${CONFIG.API_BASE}/api/worker-error`, {
            sessionId,
            jobId,
            errorMessage: (error as Error).message,
          });
        } catch (e) {
          console.error(`[MAIN-WORKER] Failed to notify backend:`, (e as Error).message);
        }
      }

      throw error;
    }
  },
  {
    connection: {
      host: CONFIG.REDIS_HOST,
      port: CONFIG.REDIS_PORT,
      password: CONFIG.REDIS_PASSWORD,
      db: CONFIG.REDIS_QUEUE_DB,
    },
    concurrency: 10,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  }
);

mainWorker.on('completed', (job) => {
  console.log(`[MAIN-WORKER] ✅ Job ${job.id} completed`);
});

mainWorker.on('failed', (job, err) => {
  console.error(`[MAIN-WORKER] ❌ Job ${job?.id} failed:`, (err as Error).message);
});

async function start(): Promise<void> {
  startMsFormWorker();
  startResetPasswordWorker();

  app.listen(CONFIG.PORT, () => {
    console.log('==========================================');
    console.log(`🚀 AI Agent Server running on port ${CONFIG.PORT}`);
    console.log('==========================================');
    console.log(`✅ Main Worker: ${CONFIG.AI_AGENT_QUEUE_NAME}`);
    console.log(`✅ MS Form Worker: started (see subflow/msform-worker.ts)`);
    console.log(`✅ Reset Worker: started (see subflow/reset-worker.ts)`);
    console.log('==========================================');
  });
}

async function shutdown(): Promise<void> {
  console.log('\n🛑 Shutting down all workers...');

  await mainWorker.close();
  await shutdownMsFormWorker();
  await shutdownResetPasswordWorker();
  await redisQueue.quit();

  console.log('✅ All workers and connections closed');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();
