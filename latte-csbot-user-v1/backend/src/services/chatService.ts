/**
 * Chat Service
 * Handles user messages, bot replies, chat history, and feedback
 */

import type { Queue } from 'bullmq';
import ChatModel from '../models/ChatModel';
import { redisDbChat, chatQueue, CHAT_TTL_SECONDS } from '../config/db';

type WsSender = (
  sessionId: string,
  text: string,
  isError: boolean,
  msgId: string,
  image_urls?: string[]
) => void;

export async function handleUserMessage(
  payload: { sessionId: string; text: string; sender?: string; time?: string },
  queue: Queue = chatQueue
): Promise<void> {
  const { sessionId, text, sender = 'user', time } = payload;
  const msgId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

  await queue.add(
    'user-message',
    { ...payload, msgId },
    { removeOnComplete: true, removeOnFail: 100 }
  );

  await ChatModel.updateOne(
    { sessionId },
    {
      $push: { messages: { msgId, sender, text, time } },
      $setOnInsert: { sessionId },
    },
    { upsert: true }
  );

  const redisKey = `chat_history:${sessionId}`;
  const msgObject = JSON.stringify({ msgId, sender, text, time });
  await redisDbChat.rpush(redisKey, msgObject);
  await redisDbChat.expire(redisKey, CHAT_TTL_SECONDS);
}

export async function handleBotReply(
  payload: {
    sessionId: string;
    replyText?: string;
    errorMessage?: string;
    image_urls?: string[];
  },
  wsSender?: WsSender
): Promise<void> {
  const { sessionId, replyText, errorMessage, image_urls } = payload;
  const text = errorMessage || replyText || '';
  const isError = !!errorMessage;
  const msgId = `bot-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const time = new Date().toISOString();

  if (wsSender) {
    wsSender(sessionId, text, isError, msgId, image_urls || []);
  }

  await ChatModel.updateOne(
    { sessionId },
    {
      $push: {
        messages: {
          msgId,
          sender: 'bot',
          text,
          time,
          image_urls: image_urls || [],
        },
      },
    },
    { upsert: true }
  );

  const redisKey = `chat_history:${sessionId}`;
  const msgObject = JSON.stringify({
    msgId,
    sender: 'bot',
    text,
    time,
    image_urls: image_urls || [],
  });
  console.log(`💾 [Redis] Saving to ${redisKey}:`, msgObject);
  await redisDbChat.rpush(redisKey, msgObject);
  await redisDbChat.expire(redisKey, CHAT_TTL_SECONDS);
}

export async function getChatHistory(sessionId: string): Promise<Array<Record<string, unknown>>> {
  const redisKey = `chat_history:${sessionId}`;
  const cachedMessages = await redisDbChat.lrange(redisKey, 0, -1);

  if (cachedMessages && cachedMessages.length > 0) {
    console.log(`📖 [History] Loaded ${cachedMessages.length} msgs from Redis`);
    const parsed = cachedMessages.map((msg) => JSON.parse(msg) as Record<string, unknown>);
    const hasImages = parsed.filter((m) => (m.image_urls as string[])?.length > 0).length;
    console.log(`   📸 Found ${hasImages} msgs with images in Redis`);
    return parsed;
  }

  const chatDoc = await ChatModel.findOne({ sessionId });
  return chatDoc ? (chatDoc.messages as unknown as Array<Record<string, unknown>>) : [];
}

export async function recordFeedback(
  sessionId: string,
  msgId: string,
  action: string
): Promise<void> {
  await ChatModel.updateOne(
    { sessionId, 'messages.msgId': msgId },
    { $set: { 'messages.$.feedback': action } }
  );

  const redisKey = `chat_history:${sessionId}`;
  const messages = await redisDbChat.lrange(redisKey, 0, -1);

  if (messages && messages.length > 0) {
    for (let i = 0; i < messages.length; i++) {
      const msgObj = JSON.parse(messages[i]) as Record<string, unknown>;
      if (msgObj.msgId === msgId) {
        msgObj.feedback = action;
        await redisDbChat.lset(redisKey, i, JSON.stringify(msgObj));
        await redisDbChat.expire(redisKey, CHAT_TTL_SECONDS);
        break;
      }
    }
  }
}
