/**
 * Shared types for User Backend
 */

export interface AuthResult {
  status: 'success' | 'fail' | 'blocked' | 'error';
  message?: string;
  user?: Record<string, string>;
}

export interface VerificationStatus {
  status: 'verified' | 'unverified' | 'error';
  user?: Record<string, string>;
}

export interface ChatMessage {
  msgId?: string;
  sender: string;
  text: string;
  image_urls?: string[];
  time?: string;
  feedback?: string;
  createdAt?: Date;
}

export interface SessionData {
  sessionId: string;
  CardID?: string;
  Email?: string;
  [key: string]: unknown;
}
