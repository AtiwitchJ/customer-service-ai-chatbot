/**
 * Shared Validation Module
 * OWASP A03:2021 - Injection Prevention
 */

export const validateSessionId = (sessionId: unknown): boolean => {
  if (!sessionId || typeof sessionId !== 'string') return false;
  return /^[a-zA-Z0-9-]{1,64}$/.test(sessionId);
};

export const validateCardID = (cardId: unknown): boolean => {
  if (!cardId || typeof cardId !== 'string') return false;
  return /^[a-zA-Z0-9]{5,20}$/.test(cardId);
};

export const validateEmail = (email: unknown): boolean => {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
};

export const validateMsgId = (msgId: unknown): boolean => {
  if (!msgId || typeof msgId !== 'string') return false;
  return /^[a-zA-Z0-9-]{1,100}$/.test(msgId);
};

export const validateFeedbackAction = (action: unknown): boolean => {
  const allowedActions = ['like', 'dislike', 'none'];
  return allowedActions.includes(action as string);
};

export const validateText = (text: unknown): boolean => {
  if (!text || typeof text !== 'string') return false;
  return text.length > 0 && text.length <= 2000;
};

export const sanitizeString = (str: unknown, maxLength = 1000): string => {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength);
};

export const detectInjection = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;

  const patterns = [
    /(\$where|\$gt|\$lt|\$ne|\$regex|\$or|\$and)/i,
    /<script[^>]*>[\s\S]*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
  ];

  return patterns.some((pattern) => pattern.test(value));
};

export const logSecurityEvent = (event: string, details: Record<string, unknown>): void => {
  console.log(`[SECURITY] ${event}:`, {
    timestamp: new Date().toISOString(),
    ...details,
  });
};
