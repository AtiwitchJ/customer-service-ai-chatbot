/**
 * JsonDataStore - JSON-based Data Storage
 * ========================================
 * Replaces MongoDB with JSON file storage for 100% JSON export system
 *
 * Features:
 * - Chat session storage
 * - Analytics data caching
 * - Upload metadata storage
 * - Index management for fast lookups
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ChatSession, ChatFilter } from '../types';

interface SessionsIndex {
  sessions: Record<string, { updatedAt?: string; createdAt?: string; hasFeedback: boolean; messageCount: number }>;
  lastUpdated: string | null;
}

interface AnalyticsExport {
  generatedAt: string;
  data: unknown;
}

interface UploadMetadataStore {
  uploads: Array<Record<string, unknown> & { id: string; createdAt?: string; updatedAt?: string }>;
  lastUpdated: string | null;
}

interface BulkDeleteResult {
  deletedCount: number;
  failed: string[];
}

class JsonDataStore {
  private dataDir: string;
  private chatsDir: string;
  private sessionsDir: string;
  private indexDir: string;
  private analyticsDir: string;
  private uploadsDir: string;

  constructor() {
    this.dataDir = path.join(__dirname, '../../data');
    this.chatsDir = path.join(this.dataDir, 'chats');
    this.sessionsDir = path.join(this.chatsDir, 'sessions');
    this.indexDir = path.join(this.chatsDir, 'index');
    this.analyticsDir = path.join(this.dataDir, 'analytics');
    this.uploadsDir = path.join(this.dataDir, 'uploads');
  }

  /**
   * Initialize directories
   */
  async init(): Promise<void> {
    const dirs = [this.sessionsDir, this.indexDir, this.analyticsDir, this.uploadsDir];
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
    console.log('✅ JsonDataStore initialized');
  }

  // ============ CHATS ============

  /**
   * Save a chat session to JSON file
   */
  async saveChat(sessionId: string, chatData: Partial<ChatSession> & { sessionId: string }): Promise<ChatSession> {
    const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
    const data: ChatSession = {
      ...chatData,
      sessionId,
      messages: chatData.messages || [],
      updatedAt: chatData.updatedAt || chatData.createdAt || new Date().toISOString(),
      createdAt: chatData.createdAt || new Date().toISOString(),
    } as ChatSession;
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    await this._updateSessionsIndex(sessionId, data);
    return data;
  }

  /**
   * Get a single chat by sessionId
   */
  async getChat(sessionId: string): Promise<ChatSession | null> {
    try {
      const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content) as ChatSession;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') return null;
      throw e;
    }
  }

  /**
   * Get all chats with optional filtering
   */
  async getAllChats(filter: ChatFilter = {}): Promise<ChatSession[]> {
    try {
      const files = await fs.readdir(this.sessionsDir);
      const chats: ChatSession[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          const content = await fs.readFile(path.join(this.sessionsDir, file), 'utf8');
          const chat = JSON.parse(content) as ChatSession;

          if (this._matchFilter(chat, filter)) {
            chats.push(chat);
          }
        } catch {
          console.warn(`Warning: Could not parse ${file}`);
        }
      }

      return chats.sort((a, b) => {
        const dateA = new Date(b.updatedAt || b.createdAt || 0).getTime();
        const dateB = new Date(a.updatedAt || a.createdAt || 0).getTime();
        return dateA - dateB;
      });
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') return [];
      throw e;
    }
  }

  /**
   * Delete a single chat by sessionId
   */
  async deleteChat(sessionId: string): Promise<boolean> {
    try {
      const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
      await fs.unlink(filePath);
      await this._removeFromIndex(sessionId);
      return true;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') return false;
      throw e;
    }
  }

  /**
   * Bulk delete chats by sessionIds
   */
  async bulkDeleteChats(sessionIds: string[]): Promise<BulkDeleteResult> {
    const results: BulkDeleteResult = { deletedCount: 0, failed: [] };

    for (const sessionId of sessionIds) {
      try {
        const deleted = await this.deleteChat(sessionId);
        if (deleted) results.deletedCount++;
      } catch {
        results.failed.push(sessionId);
      }
    }

    return results;
  }

  /**
   * Count chats matching filter
   */
  async countChats(filter: ChatFilter = {}): Promise<number> {
    const chats = await this.getAllChats(filter);
    return chats.length;
  }

  // ============ INDEX MANAGEMENT ============

  private async _updateSessionsIndex(sessionId: string, chatData: ChatSession): Promise<void> {
    const indexPath = path.join(this.indexDir, 'sessions_index.json');
    let index: SessionsIndex = { sessions: {}, lastUpdated: null };

    try {
      const content = await fs.readFile(indexPath, 'utf8');
      index = JSON.parse(content) as SessionsIndex;
    } catch {
      /* file doesn't exist */
    }

    index.sessions[sessionId] = {
      updatedAt: chatData.updatedAt,
      createdAt: chatData.createdAt,
      hasFeedback: chatData.messages?.some((m) => m.feedback) || false,
      messageCount: chatData.messages?.length || 0,
    };
    index.lastUpdated = new Date().toISOString();

    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  }

  private async _removeFromIndex(sessionId: string): Promise<void> {
    const indexPath = path.join(this.indexDir, 'sessions_index.json');
    let index: SessionsIndex = { sessions: {}, lastUpdated: null };

    try {
      const content = await fs.readFile(indexPath, 'utf8');
      index = JSON.parse(content) as SessionsIndex;
    } catch {
      return;
    }

    delete index.sessions[sessionId];
    index.lastUpdated = new Date().toISOString();

    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  }

  // ============ ANALYTICS ============

  async saveAnalytics(type: string, data: unknown): Promise<AnalyticsExport> {
    const filePath = path.join(this.analyticsDir, `${type}.json`);
    const exportData: AnalyticsExport = {
      generatedAt: new Date().toISOString(),
      data,
    };
    await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));
    return exportData;
  }

  async getAnalytics(type: string): Promise<AnalyticsExport | null> {
    const filePath = path.join(this.analyticsDir, `${type}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content) as AnalyticsExport;
    } catch {
      return null;
    }
  }

  // ============ UPLOADS ============

  async saveUploadMetadata(metadata: Record<string, unknown> & { id: string }): Promise<Record<string, unknown>> {
    const filePath = path.join(this.uploadsDir, 'metadata.json');
    let metadataStore: UploadMetadataStore = { uploads: [], lastUpdated: null };

    try {
      const content = await fs.readFile(filePath, 'utf8');
      metadataStore = JSON.parse(content) as UploadMetadataStore;
    } catch {
      /* new file */
    }

    const existingIndex = metadataStore.uploads.findIndex((u) => u.id === metadata.id);
    if (existingIndex >= 0) {
      metadataStore.uploads[existingIndex] = {
        ...metadataStore.uploads[existingIndex],
        ...metadata,
        updatedAt: new Date().toISOString(),
      } as (Record<string, unknown> & { id: string; createdAt?: string; updatedAt?: string });
    } else {
      metadataStore.uploads.push({
        ...metadata,
        createdAt: new Date().toISOString(),
      } as (Record<string, unknown> & { id: string; createdAt?: string; updatedAt?: string }));
    }

    metadataStore.lastUpdated = new Date().toISOString();
    await fs.writeFile(filePath, JSON.stringify(metadataStore, null, 2));
    return metadata;
  }

  async getUploadMetadata(id: string): Promise<Record<string, unknown> | null> {
    const filePath = path.join(this.uploadsDir, 'metadata.json');
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const metadataStore = JSON.parse(content) as UploadMetadataStore;
      return metadataStore.uploads.find((u) => u.id === id) || null;
    } catch {
      return null;
    }
  }

  async getAllUploadMetadata(): Promise<Array<Record<string, unknown>>> {
    const filePath = path.join(this.uploadsDir, 'metadata.json');
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const metadataStore = JSON.parse(content) as UploadMetadataStore;
      return metadataStore.uploads || [];
    } catch {
      return [];
    }
  }

  async deleteUploadMetadata(id: string): Promise<boolean> {
    const filePath = path.join(this.uploadsDir, 'metadata.json');
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const metadataStore = JSON.parse(content) as UploadMetadataStore;
      metadataStore.uploads = metadataStore.uploads.filter((u) => u.id !== id);
      metadataStore.lastUpdated = new Date().toISOString();
      await fs.writeFile(filePath, JSON.stringify(metadataStore, null, 2));
      return true;
    } catch {
      return false;
    }
  }

  // ============ HELPERS ============

  private _matchFilter(chat: ChatSession, filter: ChatFilter): boolean {
    if (filter.startDate || filter.endDate) {
      const chatDate = new Date(chat.updatedAt || chat.createdAt || 0);

      if (filter.startDate) {
        const start = new Date(filter.startDate);
        if (chatDate < start) return false;
      }

      if (filter.endDate) {
        const end = new Date(filter.endDate);
        end.setHours(23, 59, 59, 999);
        if (chatDate > end) return false;
      }
    }

    if (filter.feedback) {
      const hasFeedback = chat.messages?.some((m) => m.feedback === filter.feedback);
      if (!hasFeedback) return false;
    }

    if (filter.searchText) {
      const searchLower = filter.searchText.toLowerCase();
      const hasText = chat.messages?.some((m) => m.text?.toLowerCase().includes(searchLower));
      if (!hasText) return false;
    }

    return true;
  }
}

export = new JsonDataStore();
