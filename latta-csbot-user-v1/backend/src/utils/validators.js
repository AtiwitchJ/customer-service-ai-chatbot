/**
 * Shared Validation Module
 * OWASP A03:2021 - Injection Prevention
 * รวม validation functions ไว้ที่เดียวเพื่อลด code duplication
 */

// Session ID Validation (UUID format or alphanumeric, max 64 chars)
const validateSessionId = (sessionId) => {
    if (!sessionId || typeof sessionId !== 'string') return false;
    return /^[a-zA-Z0-9-]{1,64}$/.test(sessionId);
};

// Card ID Validation (Alphanumeric only, 5-20 chars)
const validateCardID = (cardId) => {
    if (!cardId || typeof cardId !== 'string') return false;
    return /^[a-zA-Z0-9]{5,20}$/.test(cardId);
};

// Email Validation (Basic email format, max 254 chars)
const validateEmail = (email) => {
    if (!email || typeof email !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
};

// Message ID Validation
const validateMsgId = (msgId) => {
    if (!msgId || typeof msgId !== 'string') return false;
    return /^[a-zA-Z0-9-]{1,100}$/.test(msgId);
};

// Feedback Action Validation
const validateFeedbackAction = (action) => {
    const allowedActions = ['like', 'dislike', 'none'];
    return allowedActions.includes(action);
};

// Text Message Validation (Max 2000 characters)
const validateText = (text) => {
    if (!text || typeof text !== 'string') return false;
    return text.length > 0 && text.length <= 2000;
};

// Sanitize string input
const sanitizeString = (str, maxLength = 1000) => {
    if (typeof str !== 'string') return '';
    return str.trim().slice(0, maxLength);
};

// Check for common injection patterns
const detectInjection = (value) => {
    if (typeof value !== 'string') return false;

    const patterns = [
        /(\$where|\$gt|\$lt|\$ne|\$regex|\$or|\$and)/i, // NoSQL injection
        /<script[^>]*>[\s\S]*?<\/script>/gi,            // XSS script tags
        /javascript:/gi,                                  // JavaScript protocol
        /on\w+\s*=/gi,                                    // Event handlers
    ];

    return patterns.some(pattern => pattern.test(value));
};

// Security Event Logger
const logSecurityEvent = (event, details) => {
    console.log(`[SECURITY] ${event}:`, {
        timestamp: new Date().toISOString(),
        ...details
    });
};

module.exports = {
    validateSessionId,
    validateCardID,
    validateEmail,
    validateMsgId,
    validateFeedbackAction,
    validateText,
    sanitizeString,
    detectInjection,
    logSecurityEvent
};
