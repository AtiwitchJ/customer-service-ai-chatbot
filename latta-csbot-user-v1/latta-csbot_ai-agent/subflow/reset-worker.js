/**
 * Reset Password Worker
 * =====================
 * Handles password reset requests
 */

const { Worker } = require('bullmq');
const Redis = require('ioredis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Configuration
const IOREDIS_OPTIONS = {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD
};

const REDIS_DB = {
    VERIFY: parseInt(process.env.REDIS_VERIFY_DB || '3'),
    COOLDOWN: parseInt(process.env.REDIS_COOLDOWN_DB || '4')
};

const API_BASE = process.env.API_BASE;
const QUEUE_NAME = process.env.RESET_PASSWORD_QUEUE_NAME || 'reset_password';

let worker;
let redisUser;
let redisCooldown;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function processResetPasswordJob(job) {
    const { sessionId } = job.data;
    const WEBHOOK_REPLY_URL = `${API_BASE}/webhook/receive_reply`;

    console.log(`[Reset Pwd] 📥 Processing job ${job.id} for session: ${sessionId}`);

    let finalReply = '';
    let targetEmail = null;
    let isSpam = false;

    try {
        if (sessionId !== 'unknown') {
            targetEmail = await redisUser.hget(`verified:${sessionId}`, 'Email');

            if (targetEmail) {
                console.log(`[Reset Pwd] 👤 User found: ${targetEmail}`);

                const limitKey = `rspassword_email:${targetEmail}`;
                const cooldownExists = await redisCooldown.get(limitKey);

                if (cooldownExists) {
                    console.warn(`[Reset Pwd] ⚠️ Spam detected: ${targetEmail}`);
                    isSpam = true;
                }
            }
        }

        if (isSpam) {
            await sleep(2000);
            finalReply = `⚠️ คุณเพิ่งกดรีเซ็ตไป กรุณาตรวจสอบอีเมลก่อนทำรายการซ้ำ`;
        } else {
            console.log(`[Reset Pwd] ⏳ Processing reset request...`);
            await sleep(10000);

            if (targetEmail) {
                finalReply = `✅ ดำเนินการรีเซ็ตรหัสผ่านเรียบร้อยแล้ว\nระบบได้ส่งลิงก์ยืนยันไปที่อีเมล: ${targetEmail}\nกรุณาตรวจสอบกล่องจดหมายของคุณ`;

                await redisCooldown.set(`rspassword_email:${targetEmail}`, 'done', 'EX', 300);
                console.log(`[Reset Pwd] 🔒 Cooldown set for ${targetEmail}`);
            } else {
                finalReply = `⚠️ ไม่พบข้อมูลอีเมลที่เชื่อมโยงกับ Session นี้`;
            }
        }
    } catch (error) {
        console.error(`[Reset Pwd] ❌ Error: ${error.message}`);
        throw error;
    }

    try {
        await fetch(WEBHOOK_REPLY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, replyText: finalReply })
        });
        console.log(`[Reset Pwd] 📡 Reply sent for session: ${sessionId}`);
    } catch (e) {
        console.error(`[Reset Pwd] ❗ Failed to send reply: ${e.message}`);
    }
}

function startResetPasswordWorker() {
    redisUser = new Redis({ ...IOREDIS_OPTIONS, db: REDIS_DB.VERIFY });
    redisCooldown = new Redis({ ...IOREDIS_OPTIONS, db: REDIS_DB.COOLDOWN });

    worker = new Worker(
        QUEUE_NAME,
        async (job) => processResetPasswordJob(job),
        {
            connection: IOREDIS_OPTIONS,
            concurrency: 5,
            removeOnComplete: { age: 3600, count: 100 },
            removeOnFail: { age: 86400, count: 200 }
        }
    );

    worker.on('completed', (job) => console.log(`[Reset Pwd] ✅ Job ${job.id} completed`));
    worker.on('failed', (job, err) => console.error(`[Reset Pwd] ❌ Job ${job.id} failed: ${err.message}`));

    console.log(`[Reset Pwd] 👂 Worker started on queue: ${QUEUE_NAME}`);
}

async function shutdownResetPasswordWorker() {
    if (worker) await worker.close();
    if (redisUser) await redisUser.quit();
    if (redisCooldown) await redisCooldown.quit();
}

module.exports = { startResetPasswordWorker, shutdownResetPasswordWorker, QUEUE_NAME };
