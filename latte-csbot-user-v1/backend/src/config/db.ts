import Redis, { RedisOptions } from 'ioredis';
import mongoose from 'mongoose';
import { Queue } from 'bullmq';
import * as path from 'path';

require('dotenv').config({ path: path.join(__dirname, '../../../../.env') });

import { validateEnv, logEnvStatus } from './envValidator';
validateEnv();
logEnvStatus();

const REDIS_HOST = process.env.REDIS_HOST!;
const REDIS_PORT = process.env.REDIS_PORT!;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const REDIS_CHAT_DB = process.env.REDIS_CHAT_DB!;
const REDIS_VERIFY_DB = process.env.REDIS_VERIFY_DB!;
const REDIS_QUEUE_DB = process.env.REDIS_QUEUE_DB!;
const AI_AGENT_QUEUE_NAME = process.env.AI_AGENT_QUEUE_NAME!;
const CHAT_TTL_SECONDS = parseInt(process.env.CHAT_TTL_SECONDS || '600', 10);

const redisOptions: RedisOptions = {
  host: REDIS_HOST,
  port: parseInt(REDIS_PORT, 10),
  password: REDIS_PASSWORD,
  retryStrategy(times: number) {
    return Math.min(times * 50, 2000);
  },
};

export const redisDbChat = new Redis({
  ...redisOptions,
  db: parseInt(REDIS_CHAT_DB, 10),
});

export const redisDbVerify = new Redis({
  ...redisOptions,
  db: parseInt(REDIS_VERIFY_DB, 10),
});

if (process.env.MONGO_URL) {
  mongoose
    .connect(process.env.MONGO_URL, {
      dbName: process.env.MONGO_DB || 'chatbot',
    })
    .then(() => console.log('✅ MongoDB Connected'))
    .catch((err: Error) => console.error('❌ MongoDB Connection Failed:', err));
}

export const bullMQConnectionConfig = {
  host: REDIS_HOST,
  port: parseInt(REDIS_PORT, 10),
  db: parseInt(REDIS_QUEUE_DB, 10),
  password: REDIS_PASSWORD,
};

export const chatQueue = new Queue(AI_AGENT_QUEUE_NAME, {
  connection: bullMQConnectionConfig,
});

export { CHAT_TTL_SECONDS, AI_AGENT_QUEUE_NAME };
