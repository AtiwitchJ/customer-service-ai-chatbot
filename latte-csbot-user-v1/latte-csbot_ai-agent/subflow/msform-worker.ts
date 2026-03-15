/**
 * MS Form Worker
 * ==============
 * Handles MS Form link generation requests
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
export const QUEUE_NAME = process.env.MS_FORM_QUEUE_NAME || 'ms_form';
const MS_FORM_URL = process.env.MS_FORMS_REPORT_URL;

let worker: Worker | undefined;
let redisUser: Redis | undefined;
let redisCooldown: Redis | undefined;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function maskEmail(email: string | null): string {
  if (!email) return 'N/A';
  const [local, domain] = email.split('@');
  return `${local[0]}***@${domain}`;
}

interface MsFormJobData {
  sessionId: string;
}

async function processMsFormJob(job: Job<MsFormJobData, unknown, string>): Promise<void> {
  const { sessionId } = job.data;
  const WEBHOOK_REPLY_URL = `${API_BASE}/webhook/receive_reply`;

  console.log(`[MS Form] 📥 Processing job ${job.id} for session: ${sessionId}`);

  let replyText = '';
  let userEmail: string | null = null;
  let isSpamRequest = false;

  try {
    if (sessionId !== 'unknown' && redisUser) {
      userEmail = await redisUser.hget(`verified:${sessionId}`, 'Email');

      if (userEmail) {
        console.log(`[MS Form] 👤 User found: ${maskEmail(userEmail)}`);

        if (redisCooldown) {
          const cooldownKey = `msform_email:${userEmail}`;
          const hasCooldown = await redisCooldown.get(cooldownKey);

          if (hasCooldown) {
            console.warn(`[MS Form] ⚠️ Spam detected: ${maskEmail(userEmail)}`);
            isSpamRequest = true;
          }
        }
      }
    }

    if (isSpamRequest) {
      await sleep(2000);
      replyText =
        '⚠️ คุณได้ดำเนินการสำเร็จแล้ว (ระบบได้รับคำขอของคุณไปแล้ว กรุณาตรวจสอบอีเมล)';
    } else {
      console.log(`[MS Form] ⏳ Processing request...`);
      await sleep(5000);

      if (userEmail) {
        replyText = [
          '💡 คุณสามารถแจ้งปัญหาได้ง่าย ๆ',
          '',
          '📝 กดที่รูปด้านล่างเพื่อกรอกแบบฟอร์ม:',
          `[FORM_BUTTON:${MS_FORM_URL}|image/6f4176f2-c746-4d37-a187-ae594296d032.png]`,
          '',
          '📧 ระบบจะส่งอีเมลยืนยันไปที่:',
          `📨 ${userEmail}`,
        ].join('\n');

        if (redisCooldown) {
          await redisCooldown.set(`msform_email:${userEmail}`, 'done', 'EX', 300);
          console.log(`[MS Form] ✅ Cooldown set for ${maskEmail(userEmail)}`);
        }
      } else {
        replyText = '⚠️ ไม่พบข้อมูลผู้ใช้ กรุณาล็อกอินก่อนใช้งานค่ะ';
      }
    }
  } catch (error) {
    console.error(`[MS Form] ❌ Error:`, (error as Error).message);
    throw error;
  }

  try {
    await fetch(WEBHOOK_REPLY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, replyText }),
    });
    console.log(`[MS Form] 📡 Reply sent for session: ${sessionId}`);
  } catch (e) {
    console.error(`[MS Form] ❗ Failed to send reply:`, (e as Error).message);
  }
}

export function startMsFormWorker(): void {
  redisUser = new Redis({ ...IOREDIS_OPTIONS, db: REDIS_DB.VERIFY });
  redisCooldown = new Redis({ ...IOREDIS_OPTIONS, db: REDIS_DB.COOLDOWN });

  worker = new Worker(
    QUEUE_NAME,
    async (job) => processMsFormJob(job),
    {
      connection: IOREDIS_OPTIONS,
      concurrency: 5,
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 86400, count: 200 },
    }
  );

  worker.on('completed', (job) => console.log(`[MS Form] ✅ Job ${job.id} completed`));
  worker.on('failed', (job, err) =>
    console.error(`[MS Form] ❌ Job ${job?.id} failed:`, (err as Error).message)
  );

  console.log(`[MS Form] 👂 Worker started on queue: ${QUEUE_NAME}`);
}

export async function shutdownMsFormWorker(): Promise<void> {
  if (worker) await worker.close();
  if (redisUser) await redisUser.quit();
  if (redisCooldown) await redisCooldown.quit();
}
