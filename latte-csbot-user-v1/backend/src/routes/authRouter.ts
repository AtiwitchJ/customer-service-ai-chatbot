/**
 * Authentication Routes (Original: CardID+Email)
 */

import { Router, Request, Response } from 'express';
import * as authService from '../services/authService';
import {
  validateSessionId,
  validateCardID,
  validateEmail,
  logSecurityEvent,
} from '../utils/validators';

const router = Router();

router.post('/auth/check-status', async (req: Request, res: Response): Promise<Response> => {
  const { sessionId } = req.body;

  if (!validateSessionId(sessionId)) {
    logSecurityEvent('INVALID_SESSION_FORMAT', { ip: req.ip });
    return res.status(400).json({ status: 'error', message: 'Invalid sessionId format' });
  }

  const result = await authService.getVerificationStatus(sessionId);

  if (result.status === 'error') {
    return res.status(500).json(result);
  }

  return res.json(result);
});

router.post('/auth/login', async (req: Request, res: Response): Promise<Response> => {
  const { sessionId, CardID, Email } = req.body;

  if (!validateSessionId(sessionId)) {
    logSecurityEvent('INVALID_SESSION_FORMAT', { ip: req.ip });
    return res.status(400).json({ status: 'error', message: 'Invalid sessionId format' });
  }

  if (!validateCardID(CardID)) {
    logSecurityEvent('INVALID_CARDID_FORMAT', { ip: req.ip, sessionId });
    return res.status(400).json({ status: 'error', message: 'Invalid CardID format' });
  }

  if (!validateEmail(Email)) {
    logSecurityEvent('INVALID_EMAIL_FORMAT', { ip: req.ip, sessionId });
    return res.status(400).json({ status: 'error', message: 'Invalid Email format' });
  }

  const result = await authService.performLogin(sessionId, CardID, Email);

  switch (result.status) {
    case 'success':
      logSecurityEvent('LOGIN_SUCCESS', { ip: req.ip, sessionId });
      return res.status(200).json(result);

    case 'blocked':
      logSecurityEvent('LOGIN_BLOCKED', { ip: req.ip, sessionId });
      return res.status(403).json(result);

    case 'fail':
      logSecurityEvent('LOGIN_FAILED', { ip: req.ip, sessionId });
      return res.status(401).json(result);

    case 'error':
    default:
      return res.status(503).json(result);
  }
});

export default router;
