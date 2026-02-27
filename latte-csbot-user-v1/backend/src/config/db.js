// src/config/db.js
const Redis = require('ioredis');
const mongoose = require('mongoose');
const { Queue } = require('bullmq');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../../../.env') });

// Import and run environment validation
const { validateEnv, logEnvStatus } = require('./envValidator');
validateEnv();
logEnvStatus();

// --- 1. Redis Configuration ---
const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PORT = process.env.REDIS_PORT;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const REDIS_CHAT_DB = process.env.REDIS_CHAT_DB;
const REDIS_VERIFY_DB = process.env.REDIS_VERIFY_DB;
const REDIS_QUEUE_DB = process.env.REDIS_QUEUE_DB;
const AI_AGENT_QUEUE_NAME = process.env.AI_AGENT_QUEUE_NAME;
const CHAT_TTL_SECONDS = parseInt(process.env.CHAT_TTL_SECONDS || '600', 10);

// Common Redis Options
const redisOptions = {
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD, // Ensure password is included
    retryStrategy: function (times) {
        return Math.min(times * 50, 2000);
    }
};

// Redis Connection Objects
const redisDbChat = new Redis({
    ...redisOptions,
    db: REDIS_CHAT_DB,
});

const redisDbVerify = new Redis({
    ...redisOptions,
    db: REDIS_VERIFY_DB,
});

// --- 2. MongoDB Configuration ---
if (process.env.MONGO_URL) {
    mongoose.connect(process.env.MONGO_URL, {
        dbName: process.env.MONGO_DB || 'chatbot',
    }).then(() => console.log('✅ MongoDB Connected'))
        .catch(err => console.error('❌ MongoDB Connection Failed:', err));
}

// --- 3. BullMQ Configuration ---
const bullMQConnectionConfig = {
    host: REDIS_HOST,
    port: REDIS_PORT,
    db: REDIS_QUEUE_DB,
    password: REDIS_PASSWORD // Ensure password is provided here too
};

const chatQueue = new Queue(AI_AGENT_QUEUE_NAME, { connection: bullMQConnectionConfig });

module.exports = {
    redisDbChat,
    redisDbVerify,
    chatQueue,
    bullMQConnectionConfig,
    CHAT_TTL_SECONDS,
    AI_AGENT_QUEUE_NAME,
};