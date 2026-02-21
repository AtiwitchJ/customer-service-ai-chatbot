const { Queue } = require('bullmq');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const IOREDIS_OPTIONS = {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD
};

const QUEUE_NAMES = {
    MS_FORM: process.env.MS_FORM_QUEUE_NAME || 'ms_form',
    RESET_PASSWORD: process.env.RESET_PASSWORD_QUEUE_NAME || 'reset_password'
};

const QUEUE_OPTIONS = {
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: { age: 86400, count: 200 }
};

const queues = {
    msForm: new Queue(QUEUE_NAMES.MS_FORM, { connection: IOREDIS_OPTIONS, ...QUEUE_OPTIONS }),
    resetPassword: new Queue(QUEUE_NAMES.RESET_PASSWORD, { connection: IOREDIS_OPTIONS, ...QUEUE_OPTIONS })
};

async function addToQueue(queueType, sessionId, payload = {}) {
    const queue = queues[queueType];
    if (!queue) {
        throw new Error(`Unknown queue type: ${queueType}`);
    }

    const jobData = {
        sessionId,
        source: 'ai_agent_js',
        timestamp: new Date().toISOString(),
        ...payload
    };

    const jobId = `${sessionId}-${Date.now()}`;

    await queue.add(jobId, jobData, {
        jobId,
        removeOnComplete: QUEUE_OPTIONS.removeOnComplete,
        removeOnFail: QUEUE_OPTIONS.removeOnFail
    });

    console.log(`✅ BullMQ: Added job to '${QUEUE_NAMES[queueType.toUpperCase()]}' | Session: ${sessionId} | JobId: ${jobId}`);
}

async function publishToQueue(sessionId, action) {
    const actionMap = {
        'ms_form': 'msForm',
        'reset_password': 'resetPassword'
    };

    const queueType = actionMap[action.toLowerCase()];
    if (!queueType) {
        console.warn(`⚠️ Unknown action: ${action}`);
        return;
    }

    await addToQueue(queueType, sessionId);
}

async function closeAllQueues() {
    await Promise.all([
        queues.msForm.close(),
        queues.resetPassword.close()
    ]);
}

module.exports = {
    addToQueue,
    publishToQueue,
    closeAllQueues,
    QUEUE_NAMES
};
