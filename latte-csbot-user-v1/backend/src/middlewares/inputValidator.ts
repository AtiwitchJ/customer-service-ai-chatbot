/**
 * OWASP A03:2021 - Injection Prevention
 * Input Validation Middleware
 */

import type { Request, Response, NextFunction } from 'express';
import { sanitizeString, detectInjection } from '../utils/validators';

export { sanitizeString, detectInjection };

export const validateRequestBody = (allowedFields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ status: 'error', message: 'Invalid request body' });
    }

    const sanitizedBody: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        sanitizedBody[field] = req.body[field];
      }
    }
    req.body = sanitizedBody;

    next();
  };
};

export const injectionGuard = (
  req: Request,
  res: Response,
  next: NextFunction
): void | Response => {
  const checkValue = (value: unknown, path = ''): boolean => {
    if (typeof value === 'string' && detectInjection(value)) {
      console.warn(`[SECURITY] Injection attempt detected at ${path}:`, {
        ip: req.ip,
        path: req.path,
        value: value.substring(0, 100),
      });
      return true;
    }
    if (typeof value === 'object' && value !== null) {
      for (const key in value as Record<string, unknown>) {
        if (checkValue((value as Record<string, unknown>)[key], `${path}.${key}`)) return true;
      }
    }
    return false;
  };

  if (
    checkValue(req.body, 'body') ||
    checkValue(req.query, 'query') ||
    checkValue(req.params, 'params')
  ) {
    return res.status(400).json({ status: 'error', message: 'Invalid input detected' });
  }

  next();
};
