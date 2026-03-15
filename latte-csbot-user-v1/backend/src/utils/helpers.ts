import type { WebSocketServer, WebSocket } from 'ws';
import ChatModel from '../models/ChatModel';
import { CHAT_TTL_SECONDS } from '../config/db';

interface WebSocketWithSession extends WebSocket {
  sessionId?: string;
}

export function sendBotMessageToFrontend(
  wss: WebSocketServer,
  sessionId: string,
  messageText: string,
  isError = false,
  msgId: string | null = null
): void {
  const clients = Array.from(wss.clients);

  clients.forEach((client) => {
    const ws = client as unknown as WebSocketWithSession;
    if (client.readyState === 1 && ws.sessionId === sessionId) {
      client.send(
        JSON.stringify({
          type: isError ? 'chat_error' : 'chat_reply',
          reply: messageText,
          msgId,
        })
      );
    }
  });
}

export async function saveChatToMongo(data: {
  sessionId: string;
  msgId?: string;
  sender?: string;
  text?: string;
  image_urls?: string[];
  time?: string;
  feedback?: string;
}): Promise<void> {
  try {
    const { sessionId, ...msgData } = data;
    await ChatModel.findOneAndUpdate(
      { sessionId },
      {
        $push: { messages: msgData },
        $set: { updatedAt: new Date() },
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error('❌ Failed to save chat to Mongo:', (err as Error).message);
  }
}

import type Redis from 'ioredis';

export async function saveChatToRedis(
  redisDb0: Redis,
  chatData: { sessionId: string; [key: string]: unknown }
): Promise<void> {
  const listKey = `chat:${chatData.sessionId}`;
  await redisDb0.rpush(listKey, JSON.stringify(chatData));
  await redisDb0.ltrim(listKey, -100, -1);
  await redisDb0.expire(listKey, CHAT_TTL_SECONDS);
}
