/**
 * JsonChatModel
 * =============
 * JSON-based Chat Model that replaces MongoDB/Mongoose / โมเดลแชทแบบ JSON แทน MongoDB/Mongoose
 * Provides compatible API with the original ChatModel / ให้ API ที่เข้ากันได้กับ ChatModel เดิม
 */

import jsonStore from '../../utils/jsonDataStore';
import type { ChatSession, ChatFilter, ChatSessionDoc } from '../../types';

type MongoFilter = Record<string, unknown>;
type SortOptions = Record<string, 1 | -1>;
type PipelineStage = Record<string, unknown>;

interface JsonQueryExecResult {
  then: (resolve: (value: unknown[]) => void, reject?: (reason?: unknown) => void) => Promise<unknown[]>;
}

/**
 * Query Builder for method chaining support / ตัวสร้าง Query รองรับการ chain method
 */
class JsonQuery {
  model: JsonChatModel;
  filter: MongoFilter;
  sortOptions: SortOptions | null;
  limitValue: number | null;
  selectFields: string | null;
  skipValue: number | null;

  constructor(model: JsonChatModel) {
    this.model = model;
    this.filter = {};
    this.sortOptions = null;
    this.limitValue = null;
    this.selectFields = null;
    this.skipValue = null;
  }

  sort(sortObj: SortOptions): this {
    this.sortOptions = sortObj;
    return this;
  }

  limit(n: number): this {
    this.limitValue = n;
    return this;
  }

  select(fields: string): this {
    this.selectFields = fields;
    return this;
  }

  lean(): this {
    return this;
  }

  skip(n: number): this {
    this.skipValue = n;
    return this;
  }

  async exec(): Promise<ChatSession[]> {
    let chats = await this.model._findInternal(this.filter);

    if (this.sortOptions) {
      const entries = Object.entries(this.sortOptions);
      chats.sort((a, b) => {
        for (const [field, order] of entries) {
          let aVal: number | string | unknown, bVal: number | string | unknown;
          if (field === 'updatedAt') {
            aVal = new Date(a.updatedAt || 0).getTime();
            bVal = new Date(b.updatedAt || 0).getTime();
          } else {
            aVal = (a as ChatSessionDoc)[field];
            bVal = (b as ChatSessionDoc)[field];
          }
          const aNum = aVal as number | string;
          const bNum = bVal as number | string;
          if (aNum < bNum) return -1 * order;
          if (aNum > bNum) return 1 * order;
        }
        return 0;
      });
    }

    if (this.skipValue) {
      chats = chats.slice(this.skipValue);
    }

    if (this.limitValue) {
      chats = chats.slice(0, this.limitValue);
    }

    if (this.selectFields && typeof this.selectFields === 'string') {
      const fields = this.selectFields.split(' ').filter((f) => !f.startsWith('-'));
      if (fields.length > 0 && fields[0] !== '') {
        chats = chats.map((chat) => {
          const selected: Record<string, unknown> = {};
          const chatObj = chat as ChatSessionDoc;
          fields.forEach((field) => {
            if (chatObj[field] !== undefined) selected[field] = chatObj[field];
          });
          return selected as unknown as ChatSession;
        });
      }
    }

    return chats;
  }

  then(
    resolve: (value: ChatSession[]) => void,
    reject?: (reason?: unknown) => void
  ): Promise<ChatSession[]> {
    return this.exec().then(
      (v) => {
        resolve(v);
        return v;
      },
      (err) => {
        reject?.(err);
        throw err;
      }
    ) as Promise<ChatSession[]>;
  }
}

class JsonChatModel {
  private initialized = false;

  async init(): Promise<void> {
    if (!this.initialized) {
      await jsonStore.init();
      this.initialized = true;
    }
  }

  async create(chatData: Partial<ChatSession> & { sessionId?: string }): Promise<ChatSession> {
    await this.init();

    const sessionId =
      chatData.sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const now = new Date().toISOString();

    const chat: ChatSession = {
      sessionId,
      messages: chatData.messages || [],
      createdAt: chatData.createdAt || now,
      updatedAt: now,
      ...chatData,
    } as ChatSession;

    await jsonStore.saveChat(sessionId, chat);
    return chat;
  }

  find(filter: MongoFilter = {}): JsonQuery {
    const query = new JsonQuery(this);
    query.filter = filter;
    return query;
  }

  async _findInternal(filter: MongoFilter = {}): Promise<ChatSession[]> {
    await this.init();
    const jsonFilter = this._convertFilter(filter);
    return await jsonStore.getAllChats(jsonFilter);
  }

  async findById(sessionId: string): Promise<ChatSession | null> {
    await this.init();
    return await jsonStore.getChat(sessionId);
  }

  async findOne(filter: MongoFilter = {}): Promise<ChatSession | null> {
    await this.init();
    const chats = await this._findInternal(filter);
    return chats[0] || null;
  }

  async countDocuments(filter: MongoFilter = {}): Promise<number> {
    await this.init();
    const jsonFilter = this._convertFilter(filter);
    return await jsonStore.countChats(jsonFilter);
  }

  async findByIdAndDelete(sessionId: string): Promise<ChatSession | null> {
    await this.init();
    const chat = await jsonStore.getChat(sessionId);
    if (chat) {
      await jsonStore.deleteChat(sessionId);
    }
    return chat;
  }

  async deleteMany(filter: MongoFilter = {}): Promise<{ deletedCount: number }> {
    await this.init();

    const filterObj = filter as { _id?: { $in?: string[] } };
    if (filterObj._id && filterObj._id.$in) {
      const sessionIds = filterObj._id.$in;
      const result = await jsonStore.bulkDeleteChats(sessionIds);
      return { deletedCount: result.deletedCount };
    }

    const chats = await this._findInternal(filter);
    const sessionIds = chats.map((c) => c.sessionId);
    const result = await jsonStore.bulkDeleteChats(sessionIds);
    return { deletedCount: result.deletedCount };
  }

  async updateOne(
    filter: MongoFilter,
    updates: { $set?: Partial<ChatSession> }
  ): Promise<ChatSession | null> {
    await this.init();

    const chat = await this.findOne(filter);
    if (!chat) return null;

    const updatedChat: ChatSession = {
      ...chat,
      ...updates.$set,
      updatedAt: new Date().toISOString(),
    } as ChatSession;

    await jsonStore.saveChat(chat.sessionId, updatedChat);
    return updatedChat;
  }

  async aggregate(pipeline: PipelineStage[]): Promise<unknown[]> {
    await this.init();

    let results: ChatSession[] = await jsonStore.getAllChats();

    for (let i = 0; i < pipeline.length; i++) {
      const stage = pipeline[i];

      if (stage.$match) {
        results = this._applyMatch(results, stage.$match as MongoFilter);
      } else if (stage.$facet) {
        return [this._applyFacet(results, stage.$facet as Record<string, PipelineStage[]>)];
      } else if (stage.$group) {
        results = this._applyGroup(results, stage.$group as ChatSessionDoc) as ChatSession[];
      } else if (stage.$sort) {
        results = this._applySort(results, stage.$sort as SortOptions);
      } else if (stage.$limit) {
        results = results.slice(0, stage.$limit as number);
      } else if (stage.$project) {
        results = this._applyProject(results, stage.$project as ChatSessionDoc) as ChatSession[];
      } else if (stage.$unwind) {
        results = this._applyUnwind(results, stage.$unwind as string);
      }
    }

    return results;
  }

  private _convertFilter(mongoFilter: MongoFilter): ChatFilter {
    const jsonFilter: ChatFilter = {};
    const updatedAt = mongoFilter.updatedAt as Record<string, Date> | undefined;
    if (updatedAt?.$gte) jsonFilter.startDate = updatedAt.$gte;
    if (updatedAt?.$lte) jsonFilter.endDate = updatedAt.$lte;
    if (mongoFilter['messages.feedback']) {
      jsonFilter.feedback = mongoFilter['messages.feedback'] as string;
    }
    return jsonFilter;
  }

  private _applyMatch(docs: ChatSession[], matchStage: MongoFilter): ChatSession[] {
    return docs.filter((doc) => {
      for (const [key, value] of Object.entries(matchStage)) {
        const docValue = this._getNestedValue(doc as ChatSessionDoc, key);

        if (typeof value === 'object' && value !== null) {
          const val = value as ChatSessionDoc;
          if (val.$gte !== undefined) {
            const docDate = new Date(docValue as string | number).getTime();
            const gteDate = new Date(val.$gte as string | number).getTime();
            if (!(docDate >= gteDate)) return false;
          }
          if (val.$lte !== undefined) {
            const docDate = new Date(docValue as string | number).getTime();
            const lteDate = new Date(val.$lte as string | number).getTime();
            if (!(docDate <= lteDate)) return false;
          }
          if (val.$in && !(val.$in as unknown[]).includes(docValue)) return false;
          if (val.$nin && (val.$nin as unknown[]).includes(docValue)) return false;
          if (val.$ne !== undefined && docValue === val.$ne) return false;
        } else {
          if (docValue !== value) return false;
        }
      }
      return true;
    });
  }

  private _applyFacet(
    docs: ChatSession[],
    facetStage: Record<string, PipelineStage[]>
  ): Record<string, unknown[]> {
    const result: Record<string, unknown[]> = {};
    for (const [name, subPipeline] of Object.entries(facetStage)) {
      let subResults: unknown[] = [...docs];
      for (const stage of subPipeline) {
        if (stage.$match) {
          subResults = this._applyMatch(subResults as ChatSession[], stage.$match as MongoFilter);
        } else if (stage.$group) {
          subResults = this._applyGroup(subResults as ChatSession[], stage.$group as ChatSessionDoc);
        } else if (stage.$sort) {
          subResults = this._applySort(subResults as ChatSession[], stage.$sort as SortOptions);
        } else if (stage.$limit) {
          subResults = (subResults as ChatSession[]).slice(0, stage.$limit as number);
        } else if (stage.$project) {
          subResults = this._applyProject(subResults as ChatSession[], stage.$project as ChatSessionDoc);
        } else if (stage.$count) {
          subResults = [{ count: (subResults as unknown[]).length }];
        } else if (stage.$unwind) {
          subResults = this._applyUnwind(subResults as ChatSession[], stage.$unwind as string);
        }
      }
      result[name] = subResults;
    }
    return result;
  }

  private _applyGroup(docs: ChatSession[], groupStage: Record<string, unknown>): unknown[] {
    const idField = groupStage._id;
    const groups: Record<string, Record<string, unknown>> = {};

    for (const doc of docs) {
      let groupKey: string;

      if (idField === null) {
        groupKey = 'all';
      } else if (typeof idField === 'string' && idField.startsWith('$')) {
        groupKey = String(this._getNestedValue(doc as ChatSessionDoc, idField.slice(1)) ?? '');
      } else if (typeof idField === 'object' && idField !== null) {
        const idObj = idField as ChatSessionDoc;
        if (idObj.$dateToString) {
          const dateConfig = idObj.$dateToString as ChatSessionDoc;
          const dateField = (dateConfig.date as string)?.slice?.(1) ?? 
            ((dateConfig.date as Record<string, string[]>)?.$ifNull?.[0]?.slice(1));
          const dateValue = this._getNestedValue(doc as ChatSessionDoc, dateField);
          const date = new Date(dateValue as string | number);
          groupKey = date.toISOString().split('T')[0];
        } else {
          groupKey = JSON.stringify(idField);
        }
      } else {
        groupKey = String(this._getNestedValue(doc as ChatSessionDoc, idField as string) ?? '');
      }

      if (!groups[groupKey]) {
        groups[groupKey] = { _id: groupKey };
      }

      for (const [field, expr] of Object.entries(groupStage)) {
        if (field === '_id') continue;

        const exprObj = expr as ChatSessionDoc;
        if (exprObj.$sum !== undefined) {
          if (typeof exprObj.$sum === 'number') {
            (groups[groupKey][field] as number) = ((groups[groupKey][field] as number) || 0) + exprObj.$sum;
          } else {
            const val = this._getNestedValue(doc as ChatSessionDoc, (exprObj.$sum as string).slice(1)) || 0;
            (groups[groupKey][field] as number) = ((groups[groupKey][field] as number) || 0) + (val as number);
          }
        } else if (exprObj.$avg !== undefined) {
          if (!groups[groupKey][field]) {
            groups[groupKey][field] = { sum: 0, count: 0 };
          }
          const avgVal = groups[groupKey][field] as { sum: number; count: number };
          const val = this._getNestedValue(doc as ChatSessionDoc, (exprObj.$avg as string).slice(1)) || 0;
          avgVal.sum += val as number;
          avgVal.count++;
        } else if (exprObj.$min !== undefined) {
          const val = this._getNestedValue(doc as ChatSessionDoc, (exprObj.$min as string).slice(1));
          if (val !== undefined) {
            const current = groups[groupKey][field];
            groups[groupKey][field] = current === undefined ? val : Math.min(current as number, val as number);
          }
        } else if (exprObj.$max !== undefined) {
          const val = this._getNestedValue(doc as ChatSessionDoc, (exprObj.$max as string).slice(1));
          if (val !== undefined) {
            const current = groups[groupKey][field];
            groups[groupKey][field] = current === undefined ? val : Math.max(current as number, val as number);
          }
        } else if (exprObj.$first !== undefined) {
          if (groups[groupKey][field] === undefined) {
            groups[groupKey][field] = this._getNestedValue(doc as ChatSessionDoc, (exprObj.$first as string).slice(1));
          }
        } else if (exprObj.$last !== undefined) {
          groups[groupKey][field] = this._getNestedValue(doc as ChatSessionDoc, (exprObj.$last as string).slice(1));
        }
      }
    }

    return Object.values(groups).map((g) => {
      for (const [k, v] of Object.entries(g)) {
        if (v && typeof v === 'object' && 'sum' in v && 'count' in v) {
          const vv = v as { sum: number; count: number };
          (g as ChatSessionDoc)[k] = vv.count > 0 ? vv.sum / vv.count : 0;
        }
      }
      return g;
    });
  }

  private _applySort(docs: ChatSession[], sortStage: SortOptions): ChatSession[] {
    const entries = Object.entries(sortStage);
    return docs.sort((a, b) => {
      for (const [field, order] of entries) {
        const aVal = this._getNestedValue(a as ChatSessionDoc, field) as number | string;
        const bVal = this._getNestedValue(b as ChatSessionDoc, field) as number | string;
        if (aVal < bVal) return -1 * order;
        if (aVal > bVal) return 1 * order;
      }
      return 0;
    });
  }

  private _applyProject(docs: ChatSession[], projectStage: Record<string, unknown>): unknown[] {
    return docs.map((doc) => {
      const result: Record<string, unknown> = {};
      const docObj = doc as ChatSessionDoc;
      for (const [field, value] of Object.entries(projectStage)) {
        if (value === 1) {
          result[field] = this._getNestedValue(docObj, field);
        } else if (value === 0) {
          delete result[field];
        } else if (typeof value === 'string' && value.startsWith('$')) {
          result[field] = this._getNestedValue(docObj, value.slice(1));
        } else if (value && typeof value === 'object' && '$ifNull' in value) {
          const [fieldRef, defaultVal] = (value as { $ifNull: [string, unknown] }).$ifNull;
          const val = this._getNestedValue(docObj, fieldRef.slice(1));
          result[field] = val !== undefined ? val : defaultVal;
        } else if (value && typeof value === 'object' && '$toDate' in value) {
          const val = this._getNestedValue(docObj, (value as { $toDate: string }).$toDate.slice(1));
          result[field] = new Date(val as string | number);
        } else if (value && typeof value === 'object' && '$subtract' in value) {
          const [a, b] = (value as { $subtract: [string | number, string | number] }).$subtract;
          const aVal = typeof a === 'string' && a.startsWith('$') ? this._getNestedValue(docObj, a.slice(1)) : a;
          const bVal = typeof b === 'string' && b.startsWith('$') ? this._getNestedValue(docObj, b.slice(1)) : b;
          result[field] = (aVal as number) - (bVal as number);
        } else if (value && typeof value === 'object' && '$size' in value) {
          const sizeVal = (value as { $size: string | { $ifNull: [string, unknown[]] } }).$size;
          if (typeof sizeVal === 'string') {
            const arr = this._getNestedValue(docObj, sizeVal.slice(1)) || [];
            result[field] = (arr as unknown[]).length;
          } else if (sizeVal?.$ifNull) {
            const [fieldRef, defaultVal] = sizeVal.$ifNull;
            const arr = this._getNestedValue(docObj, fieldRef.slice(1)) || defaultVal;
            result[field] = (arr as unknown[]).length;
          }
        } else if (value && typeof value === 'object' && '$filter' in value) {
          const arr = this._getNestedValue(docObj, (value as { $filter: { input: string } }).$filter.input.slice(1)) || [];
          result[field] = arr;
        } else if (value && typeof value === 'object' && '$map' in value) {
          const arr = this._getNestedValue(docObj, (value as { $map: { input: string } }).$map.input.slice(1)) || [];
          result[field] = (arr as unknown[]).map((item) => item);
        } else if (value && typeof value === 'object' && '$hour' in value) {
          const hourVal = (value as { $hour: string | { $ifNull: [string, string] } }).$hour;
          let dateVal: unknown;
          if (typeof hourVal === 'string') {
            dateVal = this._getNestedValue(docObj, hourVal.slice(1));
          } else if (hourVal?.$ifNull) {
            const [fieldRef1, fieldRef2] = hourVal.$ifNull;
            dateVal = this._getNestedValue(docObj, fieldRef1.slice(1));
            if (!dateVal && fieldRef2) {
              dateVal = this._getNestedValue(docObj, fieldRef2.slice(1));
            }
          }
          result[field] = new Date(dateVal as string | number).getHours();
        }
      }
      return result;
    });
  }

  private _applyUnwind(docs: ChatSession[], unwindPath: string): ChatSession[] {
    const pathKey = unwindPath.startsWith('$') ? unwindPath.slice(1) : unwindPath;
    const result: ChatSession[] = [];

    for (const doc of docs) {
      const arr = this._getNestedValue(doc as ChatSessionDoc, pathKey);
      if (Array.isArray(arr)) {
        const key = pathKey.split('.').pop() || pathKey;
        for (const item of arr) {
          result.push({ ...doc, [key]: item } as ChatSession);
        }
      }
    }

    return result;
  }

  private _getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    if (!path) return undefined;
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as ChatSessionDoc)[part];
    }
    return current;
  }

  lean(): this {
    return this;
  }

  select(_fields: string): this {
    return this;
  }

  sort(_sortObj: SortOptions): this {
    return this;
  }

  limit(_n: number): this {
    return this;
  }
}

export = new JsonChatModel();
