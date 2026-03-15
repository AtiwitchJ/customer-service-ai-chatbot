/**
 * Chat & Webhook Routes
 */

import { Router, Request, Response } from 'express';
import xss from 'xss';
import type { WebSocketServer } from 'ws';
import { chatQueue } from '../config/db';
import * as chatService from '../services/chatService';
import { verifySession, type RequestWithVerifiedUser } from '../middlewares/sessionMiddleware';
import {
  validateSessionId,
  validateMsgId,
  validateFeedbackAction,
  validateText,
  logSecurityEvent,
} from '../utils/validators';

const router = Router();

let wssInstance: WebSocketServer | null = null;

function sendBotMessageToFrontend(
  wss: WebSocketServer | null,
  sessionId: string,
  text: string,
  isError = false,
  msgId: string | null = null,
  imageUrls: string[] = []
): void {
  if (!wss) return;

  let sentCount = 0;
  wss.clients.forEach((client) => {
    const ws = client as { sessionId?: string };
    if (client.readyState === 1 && ws.sessionId === sessionId) {
      const payload = {
        type: isError ? 'chat_error' : 'chat_reply',
        reply: text,
        msgId: msgId || `err-${Date.now()}`,
        timestamp: new Date().toISOString(),
        image_urls: imageUrls || [],
      };
      console.log(
        `📡 [WS-SEND] Sending to ${sessionId}:`,
        JSON.stringify({ ...payload, reply: payload.reply.substring(0, 50) + '...' })
      );
      if (imageUrls && imageUrls.length > 0) {
        console.log(`📸 [WS-SEND] With ${imageUrls.length} images.`);
      }
      client.send(JSON.stringify(payload));
      sentCount++;
    }
  });

  if (sentCount === 0) {
    console.warn(
      `⚠️ [WS-SEND] WARNING: No active client found for session ${sessionId}. Message NOT sent to UI.`
    );
  }
}

export function setWss(wss: WebSocketServer): void {
  wssInstance = wss;
}

;(router as Router & { setWss: (wss: WebSocketServer) => void }).setWss = setWss;

router.post('/webhook/receive_reply', async (req: Request, res: Response): Promise<Response> => {
  const { sessionId, replyText, image_urls } = req.body;

  if (!validateSessionId(sessionId)) {
    return res.status(400).json({ status: 'error', message: 'Invalid sessionId' });
  }

  if (!replyText || typeof replyText !== 'string') {
    return res.status(400).json({ status: 'error', message: 'Missing replyText' });
  }

  console.log(`\n🎉 Webhook Received Reply for: ${sessionId}`);
  if (image_urls && image_urls.length > 0) {
    console.log(`📸 Received ${image_urls.length} images`);
  }

  if (!wssInstance) {
    return res.status(500).json({ status: 'error', message: 'WebSocket Server not initialized' });
  }

  try {
    const wsSender = (
      sId: string,
      text: string,
      isError: boolean,
      mId: string,
      imgUrls?: string[]
    ) => sendBotMessageToFrontend(wssInstance, sId, text, isError, mId, imgUrls || []);
    await chatService.handleBotReply(
      {
        sessionId: xss(sessionId),
        replyText: xss(replyText),
        image_urls: image_urls || [],
      },
      wsSender
    );
    return res.status(200).json({ status: 'reply_received' });
  } catch (err) {
    console.error('Webhook Receive Route Error:', err);
    sendBotMessageToFrontend(wssInstance, sessionId, '⚠️ Server Error', true);
    return res.status(500).json({ status: 'error', message: 'Internal Server Error' });
  }
});

router.post('/api/worker-error', async (req: Request, res: Response): Promise<Response> => {
  const { sessionId, errorMessage } = req.body;

  if (!validateSessionId(sessionId)) {
    return res.status(400).json({ status: 'error', message: 'Invalid sessionId' });
  }

  if (!wssInstance) {
    return res.status(500).json({ status: 'error', message: 'WebSocket Server not initialized' });
  }

  try {
    const wsSender = (sId: string, text: string, isError: boolean, mId: string) =>
      sendBotMessageToFrontend(wssInstance, sId, text, isError, mId);
    const safeErrorMessage = errorMessage ? xss(errorMessage) : 'Unknown error';
    await chatService.handleBotReply(
      { sessionId: xss(sessionId), errorMessage: safeErrorMessage },
      wsSender
    );
    console.log(`❌ Worker Error Broadcasted.`);
    return res.status(200).json({ status: 'Error received.' });
  } catch (err) {
    console.error('Worker Error Route Failed:', err);
    return res.status(500).json({ status: 'error', message: 'Internal Server Error' });
  }
});

router.post(
  '/webhook/send',
  verifySession,
  async (req: RequestWithVerifiedUser, res: Response): Promise<Response> => {
    const { text, sessionId, ipid } = req.body;

    if (!validateSessionId(sessionId)) {
      logSecurityEvent('INVALID_SESSION_FORMAT', { ip: req.ip, path: '/webhook/send' });
      return res.status(400).json({ status: 'error', message: 'Invalid sessionId' });
    }

    if (!validateText(text)) {
      logSecurityEvent('INVALID_TEXT_INPUT', {
        ip: req.ip,
        sessionId,
        textLength: (text as string)?.length,
      });
      return res.status(400).json({ status: 'error', message: 'Invalid or too long message' });
    }

    try {
      const cleanText = xss(text as string);
      const cleanSessionId = xss(sessionId as string);

      const messagePayload = {
        text: cleanText,
        sessionId: cleanSessionId,
        sender: 'user',
        ipid: ipid ? xss(JSON.stringify(ipid)) : 'unknown',
        idCard: 'guest',
        email: 'unknown',
        time: new Date().toISOString(),
      };

      await chatService.handleUserMessage(messagePayload, chatQueue);

      return res.status(200).json({ status: 'queued' });
    } catch (error) {
      console.error('Webhook Send Route Error:', error);
      return res.status(503).json({ status: 'error' });
    }
  }
);

router.get(
  '/chat/history/:sessionId',
  verifySession,
  async (req: RequestWithVerifiedUser, res: Response): Promise<Response> => {
    const { sessionId } = req.params;

    if (!validateSessionId(sessionId)) {
      logSecurityEvent('INVALID_SESSION_FORMAT', { ip: req.ip, path: '/chat/history' });
      return res.status(400).json({ status: 'error', message: 'Invalid sessionId' });
    }

    try {
      const cleanSessionId = xss(sessionId);
      const messages = await chatService.getChatHistory(cleanSessionId);
      return res.json(messages);
    } catch (err) {
      console.error('History Route Error:', err);
      return res.status(500).json({ status: 'error', message: 'Failed to load history' });
    }
  }
);

router.post(
  '/chat/feedback',
  verifySession,
  async (req: RequestWithVerifiedUser, res: Response): Promise<Response> => {
    const { sessionId, msgId, action } = req.body;

    if (!validateSessionId(sessionId)) {
      logSecurityEvent('INVALID_SESSION_FORMAT', { ip: req.ip, path: '/chat/feedback' });
      return res.status(400).json({ status: 'error', message: 'Invalid sessionId' });
    }

    if (!validateMsgId(msgId)) {
      logSecurityEvent('INVALID_MSGID_FORMAT', { ip: req.ip, sessionId });
      return res.status(400).json({ status: 'error', message: 'Invalid msgId' });
    }

    if (!validateFeedbackAction(action)) {
      logSecurityEvent('INVALID_FEEDBACK_ACTION', { ip: req.ip, sessionId, action });
      return res.status(400).json({ status: 'error', message: 'Invalid action' });
    }

    try {
      const cleanSessionId = xss(sessionId as string);
      const cleanMsgId = xss(msgId as string);

      await chatService.recordFeedback(cleanSessionId, cleanMsgId, action as string);
      console.log(`📝 Feedback recorded: [${action}] for msg ${cleanMsgId}`);
      return res.json({ status: 'success', feedback: action });
    } catch (err) {
      console.error('Feedback Route Error:', err);
      return res.status(500).json({ status: 'error' });
    }
  }
);

export default router;
