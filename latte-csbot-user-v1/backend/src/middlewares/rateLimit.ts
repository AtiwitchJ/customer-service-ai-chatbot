/**
 * OWASP A04:2021 - Insecure Design Prevention
 * Rate Limiters for different endpoints
 */

import rateLimit from 'express-rate-limit';

const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '300000', 10);
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '500', 10);
const MAX_LOGIN_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10);
const BLOCK_DURATION_MS = parseInt(process.env.BLOCK_DURATION_MS || '300000', 10);

export const generalLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many requests, please try again later.' },
  handler: (req, res, _next, options) => {
    console.warn(`[SECURITY] Rate limit exceeded: ${req.ip} - ${req.path}`);
    res.status(options.statusCode).json(options.message);
  },
});

export const authLimiter = rateLimit({
  windowMs: BLOCK_DURATION_MS,
  max: MAX_LOGIN_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many login attempts, please try again later.' },
  skipSuccessfulRequests: true,
  handler: (req, res, _next, options) => {
    console.warn(`[SECURITY] Auth rate limit exceeded: ${req.ip}`);
    res.status(options.statusCode).json(options.message);
  },
});

const CHAT_RATE_LIMIT_WINDOW_MS = parseInt(process.env.CHAT_RATE_LIMIT_WINDOW_MS || '60000', 10);
const CHAT_RATE_LIMIT_MAX = parseInt(process.env.CHAT_RATE_LIMIT_MAX || '60', 10);

export const chatLimiter = rateLimit({
  windowMs: CHAT_RATE_LIMIT_WINDOW_MS,
  max: CHAT_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Sending messages too fast, please slow down.' },
});
