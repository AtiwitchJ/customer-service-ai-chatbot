import { Queue } from 'bullmq';
import * as path from 'path';

require('dotenv').config({ path: path.join(__dirname, '../../../../.env') });

const IOREDIS_OPTIONS = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
};

const QUEUE_NAMES = {
  MS_FORM: process.env.MS_FORM_QUEUE_NAME || 'ms_form',
  RESET_PASSWORD: process.env.RESET_PASSWORD_QUEUE_NAME || 'reset_password',
};

const QUEUE_OPTIONS = {
  removeOnComplete: { age: 3600, count: 100 },
  removeOnFail: { age: 86400, count: 200 },
};

export type QueueType = 'msForm' | 'resetPassword';

const queues: Record<QueueType, Queue> = {
  msForm: new Queue(QUEUE_NAMES.MS_FORM, {
    connection: IOREDIS_OPTIONS,
    ...QUEUE_OPTIONS,
  }),
  resetPassword: new Queue(QUEUE_NAMES.RESET_PASSWORD, {
    connection: IOREDIS_OPTIONS,
    ...QUEUE_OPTIONS,
  }),
};

const QUEUE_NAME_MAP: Record<QueueType, string> = {
  msForm: QUEUE_NAMES.MS_FORM,
  resetPassword: QUEUE_NAMES.RESET_PASSWORD,
};

export async function addToQueue(
  queueType: QueueType,
  sessionId: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  const queue = queues[queueType];
  if (!queue) {
    throw new Error(`Unknown queue type: ${queueType}`);
  }

  const jobData = {
    sessionId,
    source: 'ai_agent_js',
    timestamp: new Date().toISOString(),
    ...payload,
  };

  const jobId = `${sessionId}-${Date.now()}`;

  await queue.add(jobId, jobData, {
    jobId,
    removeOnComplete: QUEUE_OPTIONS.removeOnComplete,
    removeOnFail: QUEUE_OPTIONS.removeOnFail,
  });

  console.log(
    `✅ BullMQ: Added job to '${QUEUE_NAME_MAP[queueType]}' | Session: ${sessionId} | JobId: ${jobId}`
  );
}

export async function publishToQueue(
  sessionId: string,
  action: string
): Promise<void> {
  const actionMap: Record<string, QueueType> = {
    ms_form: 'msForm',
    reset_password: 'resetPassword',
  };

  const queueType = actionMap[action.toLowerCase()];
  if (!queueType) {
    console.warn(`⚠️ Unknown action: ${action}`);
    return;
  }

  await addToQueue(queueType, sessionId);
}

export async function closeAllQueues(): Promise<void> {
  await Promise.all([queues.msForm.close(), queues.resetPassword.close()]);
}

export { QUEUE_NAMES };
