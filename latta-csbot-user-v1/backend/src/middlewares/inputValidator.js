/**
 * OWASP A03:2021 - Injection Prevention
 * Input Validation Middleware
 * Note: Core validation functions moved to ../utils/validators.js
 */

const { sanitizeString, detectInjection } = require('../utils/validators');

// Validate and sanitize request body
const validateRequestBody = (allowedFields) => {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ status: 'error', message: 'Invalid request body' });
    }

    // Remove unexpected fields
    const sanitizedBody = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        sanitizedBody[field] = req.body[field];
      }
    }
    req.body = sanitizedBody;
    
    next();
  };
};

// Middleware to check for injection attempts
const injectionGuard = (req, res, next) => {
  const checkValue = (value, path = '') => {
    if (typeof value === 'string' && detectInjection(value)) {
      console.warn(`[SECURITY] Injection attempt detected at ${path}:`, {
        ip: req.ip,
        path: req.path,
        value: value.substring(0, 100)
      });
      return true;
    }
    if (typeof value === 'object' && value !== null) {
      for (const key in value) {
        if (checkValue(value[key], `${path}.${key}`)) return true;
      }
    }
    return false;
  };

  if (checkValue(req.body, 'body') || checkValue(req.query, 'query') || checkValue(req.params, 'params')) {
    return res.status(400).json({ status: 'error', message: 'Invalid input detected' });
  }
  
  next();
};

module.exports = {
  sanitizeString,
  validateRequestBody,
  detectInjection,
  injectionGuard
};
