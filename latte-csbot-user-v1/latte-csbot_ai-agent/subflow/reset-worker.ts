/**
 * Reset Password Worker
 * =====================
 * Handles password reset requests
 */

import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import * as path from 'path';

require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const IOREDIS_OPTIONS = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
};

const REDIS_DB = {
  VERIFY: parseInt(process.env.REDIS_VERIFY_DB || '3', 10),
  COOLDOWN: parseInt(process.env.REDIS_COOLDOWN_DB || '4', 10),
};

const API_BASE = process.env.API_BASE;
export const QUEUE_NAME = process.env.RESET_PASSWORD_QUEUE_NAME || 'reset_password';

let worker: Worker | undefined;
let redisUser: Redis | undefined;
let redisCooldown: Redis | undefined;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ResetPasswordJobData {
  sessionId: string;
}

async function processResetPasswordJob(
  job: Job<ResetPasswordJobData, unknown, string>
): Promise<void> {
  const { sessionId } = job.data;
  const WEBHOOK_REPLY_URL = `${API_BASE}/webhook/receive_reply`;

  console.log(`[Reset Pwd] 📥 Processing job ${job.id} for session: ${sessionId}`);

  let finalReply = '';
  let targetEmail: string | null = null;
  let isSpam = false;

  try {
    if (sessionId !== 'unknown' && redisUser) {
      targetEmail = await redisUser.hget(`verified:${sessionId}`, 'Email');

      if (targetEmail) {
        console.log(`[Reset Pwd] 👤 User found: ${targetEmail}`);

        if (redisCooldown) {
          const limitKey = `rspassword_email:${targetEmail}`;
          const cooldownExists = await redisCooldown.get(limitKey);

          if (cooldownExists) {
            console.warn(`[Reset Pwd] ⚠️ Spam detected: ${targetEmail}`);
            isSpam = true;
          }
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

        if (redisCooldown) {
          await redisCooldown.set(`rspassword_email:${targetEmail}`, 'done', 'EX', 300);
          console.log(`[Reset Pwd] 🔒 Cooldown set for ${targetEmail}`);
        }
      } else {
        finalReply = `⚠️ ไม่พบข้อมูลอีเมลที่เชื่อมโยงกับ Session นี้`;
      }
    }
  } catch (error) {
    console.error(`[Reset Pwd] ❌ Error:`, (error as Error).message);
    throw error;
  }

  try {
    await fetch(WEBHOOK_REPLY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, replyText: finalReply }),
    });
    console.log(`[Reset Pwd] 📡 Reply sent for session: ${sessionId}`);
  } catch (e) {
    console.error(`[Reset Pwd] ❗ Failed to send reply:`, (e as Error).message);
  }
}

export function startResetPasswordWorker(): void {
  redisUser = new Redis({ ...IOREDIS_OPTIONS, db: REDIS_DB.VERIFY });
  redisCooldown = new Redis({ ...IOREDIS_OPTIONS, db: REDIS_DB.COOLDOWN });

  worker = new Worker(
    QUEUE_NAME,
    async (job) => processResetPasswordJob(job),
    {
      connection: IOREDIS_OPTIONS,
      concurrency: 5,
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 86400, count: 200 },
    }
  );

  worker.on('completed', (job) => console.log(`[Reset Pwd] ✅ Job ${job.id} completed`));
  worker.on('failed', (job, err) =>
    console.error(`[Reset Pwd] ❌ Job ${job?.id} failed:`, (err as Error).message)
  );

  console.log(`[Reset Pwd] 👂 Worker started on queue: ${QUEUE_NAME}`);
}

export async function shutdownResetPasswordWorker(): Promise<void> {
  if (worker) await worker.close();
  if (redisUser) await redisUser.quit();
  if (redisCooldown) await redisCooldown.quit();
}
