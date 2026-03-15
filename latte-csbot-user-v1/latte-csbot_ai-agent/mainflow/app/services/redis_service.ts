import Redis from 'ioredis';
import * as path from 'path';

require('dotenv').config({ path: path.join(__dirname, '../../../../.env') });

const CHAT_HISTORY_LIMIT = parseInt(process.env.REDIS_CHAT_HISTORY_LIMIT || '6', 10);
const CHAT_HISTORY_EXPIRE = parseInt(process.env.REDIS_CHAT_HISTORY_EXPIRE || '3600', 10);

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_MEMORY_DB || '0', 10),
});

redis.on('connect', () =>
  console.log(`✅ Connected to Redis DB ${process.env.REDIS_MEMORY_DB}`)
);
redis.on('error', (err: Error) => console.error('❌ Redis Error:', err));

export async function getChatHistory(
  sessionId: string,
  limit: number = CHAT_HISTORY_LIMIT
): Promise<string> {
  const key = `chat:${sessionId}`;
  try {
    const history = await redis.lrange(key, 0, limit - 1);
    return history.reverse().join('\n');
  } catch (error) {
    console.error(
      `❌ Redis getChatHistory Error (${sessionId}):`,
      (error as Error).message
    );
    return '';
  }
}

export async function saveChatHistory(
  sessionId: string,
  userText: string,
  aiText: string
): Promise<void> {
  const key = `chat:${sessionId}`;
  try {
    await redis.lpush(key, `AI: ${aiText}`);
    await redis.lpush(key, `User: ${userText}`);
    await redis.ltrim(key, 0, CHAT_HISTORY_LIMIT - 1);
    await redis.expire(key, CHAT_HISTORY_EXPIRE);
  } catch (error) {
    console.error('Redis Save Error:', (error as Error).message);
  }
}
