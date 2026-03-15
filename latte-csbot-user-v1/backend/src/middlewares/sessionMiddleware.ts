/**
 * Session Verification Middleware
 * A01:2021 - Broken Access Control Prevention
 */

import type { Request, Response, NextFunction } from 'express';
import { redisDbVerify } from '../config/db';

const REDIS_SESSION_TTL = parseInt(process.env.REDIS_SESSION_TTL || '86400', 10);

export interface VerifiedUser {
  sessionId: string;
  [key: string]: string | undefined;
}

export interface RequestWithVerifiedUser extends Request {
  verifiedUser?: VerifiedUser;
}

export const verifySession = async (
  req: RequestWithVerifiedUser,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  const sessionId =
    req.body?.sessionId || (req.query?.sessionId as string) || (req.params?.sessionId as string);

  if (!sessionId) {
    console.log('[SECURITY] SESSION_MISSING:', { ip: req.ip, path: req.path });
    return res.status(401).json({
      status: 'error',
      message: 'Session required / ต้องระบุ Session',
    });
  }

  if (!/^[a-zA-Z0-9-]{1,64}$/.test(sessionId)) {
    console.log('[SECURITY] INVALID_SESSION_FORMAT:', { ip: req.ip, path: req.path });
    return res.status(400).json({
      status: 'error',
      message: 'Invalid session format / รูปแบบ Session ไม่ถูกต้อง',
    });
  }

  try {
    const redisKey = `verified:${sessionId}`;
    const data = await redisDbVerify.hgetall(redisKey);

    if (!data || Object.keys(data).length === 0 || data.verified !== 'true') {
      console.log('[SECURITY] SESSION_UNVERIFIED:', { ip: req.ip, sessionId, path: req.path });
      return res.status(401).json({
        status: 'error',
        message: 'Session not verified. Please login. / Session ยังไม่ได้ยืนยัน กรุณา Login',
      });
    }

    const blockedUntil = parseInt(data.blockedUntil || '0');
    if (blockedUntil > Date.now()) {
      console.log('[SECURITY] SESSION_BLOCKED:', { ip: req.ip, sessionId });
      return res.status(403).json({
        status: 'error',
        message: 'Session blocked / Session ถูกระงับ',
      });
    }

    req.verifiedUser = { sessionId, ...data };

    await redisDbVerify.expire(redisKey, REDIS_SESSION_TTL);

    next();
  } catch (err) {
    console.error('[ERROR] Session verification failed:', (err as Error).message);
    return res.status(500).json({
      status: 'error',
      message: 'Session verification failed / การตรวจสอบ Session ล้มเหลว',
    });
  }
};
