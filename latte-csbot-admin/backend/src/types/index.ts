/**
 * Shared types for Admin Backend
 * ==============================
 * Chat, analytics, and common interfaces
 */

// Chat types (from JsonChatModel, ChatModel)
export interface ChatMessage {
  msgId?: string;
  sender: string;
  text: string;
  time?: string | Date;
  createdAt?: string | Date;
  feedback?: string;
}

export interface ChatSession {
  sessionId: string;
  messages: ChatMessage[];
  createdAt?: string;
  updatedAt?: string;
}

/** Internal type for aggregation pipeline - allows dynamic property access */
export type ChatSessionDoc = ChatSession & Record<string, unknown>;

// Analytics types (from analyticsService)
export type PeriodType = 'last_day' | '7days' | '30days' | '1year' | 'all';

export interface SessionTrendItem {
  date: string;
  count: number;
}

export interface FeedbackTrendItem {
  date: string;
  likes: number;
  dislikes: number;
}

export interface TrendsData {
  sessionTrend: SessionTrendItem[];
  feedbackTrend: FeedbackTrendItem[];
}

export interface HourlyItem {
  hour: number;
  count: number;
}

export interface PeakHoursData {
  heatmap: HourlyItem[];
  hourly: Array<{ _id: number; count: number }>;
}

export interface TopQuestionItem {
  text: string;
  count: number;
}

export interface TopQuestionsData {
  topQuestions: TopQuestionItem[];
}

// Filter for chat queries
export interface ChatFilter {
  startDate?: string | Date;
  endDate?: string | Date;
  feedback?: string;
  searchText?: string;
}
