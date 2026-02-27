/**
 * AI Agent - All-in-One Entry Point
 * ================================
 * Combines:
 * - Express Server (from mainflow/ai-agent-mainflow.js)
 * - Main BullMQ Worker (from bullmq-worker.js)
 * - Sub Workers (from subflow/msform-worker.js, reset-worker.js)
 * 
 * ลำดับการทำงาน:
 * 1. Load env vars
 * 2. Initialize Main BullMQ Worker
 * 3. Start Sub Workers (imported from subflow/)
 * 4. Start Express Server (หลัง Workers พร้อม)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const { Worker } = require('bullmq');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Redis = require('ioredis');

// ==========================================
// Import Sub Workers (ง่ายต่อการแก้ไข)
// ==========================================
const { startMsFormWorker, shutdownMsFormWorker } = require('./subflow/msform-worker');
const { startResetPasswordWorker, shutdownResetPasswordWorker } = require('./subflow/reset-worker');

// ==========================================
// Import Workflow Service (Core AI Processing)
// ==========================================
const { processChatWorkflow } = require('./mainflow/app/services/workflow_service');

// ==========================================
// Configuration
// ==========================================
const CONFIG = {
    // Redis
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    REDIS_QUEUE_DB: parseInt(process.env.REDIS_QUEUE_DB || '2'),
    
    // Queues
    AI_AGENT_QUEUE_NAME: process.env.AI_AGENT_QUEUE_NAME || 'ai-agent-queue',
    
    // URLs
    AGENT_WEBHOOK_URL: process.env.AGENT_WEBHOOK_URL,
    API_BASE: process.env.API_BASE,
    
    // Server
    PORT: parseInt(process.env.AI_AGENT_PORT || '8765'),
    NODE_ENV: process.env.NODE_ENV || 'production'
};

// ==========================================
// Express Server (from mainflow)
// ==========================================
const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors());
app.use(express.json());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });
app.use(limiter);

app.get('/health', (req, res) => {
    res.json({ status: 'up', timestamp: new Date().toISOString() });
});

app.post('/agent', async (req, res) => {
    const { sessionId, text } = req.body;
    
    if (!sessionId || !text) {
        return res.status(400).json({ 
            error: 'sessionId and text are required' 
        });
    }
    
    console.log(`📩 Input Received (${sessionId}): ${text}`);
    
    // ตอบกลับทันทีแล้วประมวลผลใน background
    res.json({ status: 'processing', sessionId });
    
    // ประมวลผลแชทผ่าน workflow (RAG + LLM + reply via webhook)
    processChatWorkflow(sessionId, text).catch(err => {
        console.error(`[Agent] ❌ processChatWorkflow error for ${sessionId}:`, err.message);
    });
});

// ==========================================
// Main Worker (from bullmq-worker.js)
// ==========================================
const redisQueue = new Redis({
    host: CONFIG.REDIS_HOST,
    port: CONFIG.REDIS_PORT,
    password: CONFIG.REDIS_PASSWORD,
    db: CONFIG.REDIS_QUEUE_DB
});

const mainWorker = new Worker(
    CONFIG.AI_AGENT_QUEUE_NAME,
    async (job) => {
        const { sessionId, text } = job.data;
        const jobId = job.id;
        
        console.log(`[MAIN-WORKER] Processing job ${jobId} for session ${sessionId}: "${text}"`);
        
        if (!CONFIG.AGENT_WEBHOOK_URL) {
            throw new Error("AGENT_WEBHOOK_URL is not configured");
        }
        
        try {
            const response = await axios.post(CONFIG.AGENT_WEBHOOK_URL, job.data, {
                timeout: 300000 // 5 minutes
            });
            
            console.log(`[MAIN-WORKER] ✅ Job ${jobId} forwarded to Agent. Status: ${response.status}`);
            return response.data;
            
        } catch (error) {
            console.error(`[MAIN-WORKER] ❌ Job ${jobId} failed: ${error.message}`);
            
            // แจ้ง error กลับไป backend
            if (CONFIG.API_BASE) {
                try {
                    await axios.post(`${CONFIG.API_BASE}/api/worker-error`, {
                        sessionId,
                        jobId,
                        errorMessage: error.message
                    });
                } catch (e) {
                    console.error(`[MAIN-WORKER] Failed to notify backend: ${e.message}`);
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
            db: CONFIG.REDIS_QUEUE_DB
        },
        concurrency: 10,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 }
    }
);

mainWorker.on('completed', (job) => {
    console.log(`[MAIN-WORKER] ✅ Job ${job.id} completed`);
});

mainWorker.on('failed', (job, err) => {
    console.error(`[MAIN-WORKER] ❌ Job ${job.id} failed: ${err.message}`);
});

// ==========================================
// Start All Services
// ==========================================
async function start() {
    // Start Sub Workers (from subflow/)
    startMsFormWorker();
    startResetPasswordWorker();
    
    // Start Express Server
    app.listen(CONFIG.PORT, () => {
        console.log('==========================================');
        console.log(`🚀 AI Agent Server running on port ${CONFIG.PORT}`);
        console.log('==========================================');
        console.log(`✅ Main Worker: ${CONFIG.AI_AGENT_QUEUE_NAME}`);
        console.log(`✅ MS Form Worker: started (see subflow/msform-worker.js)`);
        console.log(`✅ Reset Worker: started (see subflow/reset-worker.js)`);
        console.log('==========================================');
    });
}

// ==========================================
// Graceful Shutdown
// ==========================================
async function shutdown() {
    console.log('\n🛑 Shutting down all workers...');
    
    // Close main worker
    await mainWorker.close();
    
    // Close sub workers
    await shutdownMsFormWorker();
    await shutdownResetPasswordWorker();
    
    // Close Redis
    await redisQueue.quit();
    
    console.log('✅ All workers and connections closed');
    process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();
