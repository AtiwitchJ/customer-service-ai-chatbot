/**
 * Chat Controller
 * ===============
 * Handles HTTP requests for chat operations / รับผิดชอบจัดการคำสั่ง HTTP ที่เกี่ยวกับระบบแชท
 * Interacts with ChatModel to manage chat logs / ทำงานร่วมกับ ChatModel เพื่อจัดการประวัติการสนทนา
 */

import { Request, Response } from 'express';
import ChatModel from '../models/JsonChatModel';

class ChatController {
  async getChats(req: Request, res: Response): Promise<Response> {
    try {
      const { limit = '10000', start, end, feedback } = req.query;
      const filter: Record<string, unknown> = {};

      if (start || end) {
        filter.updatedAt = {} as Record<string, Date>;
        if (start) (filter.updatedAt as Record<string, Date>).$gte = new Date(start as string);
        if (end)
          (filter.updatedAt as Record<string, Date>).$lte = new Date(
            new Date(end as string).setHours(23, 59, 59, 999)
          );
      }

      if (feedback) {
        filter['messages.feedback'] = feedback;
      }

      const chats = await ChatModel.find(filter)
        .sort({ updatedAt: -1 })
        .limit(parseInt(limit as string));

      const total = await ChatModel.countDocuments(filter);

      const totalMessages = chats.reduce(
        (acc: number, chat: { messages?: unknown[] }) => acc + (chat.messages ? chat.messages.length : 0),
        0
      );

      return res.status(200).json({
        status: 'success',
        data: chats,
        total,
        overview: { totalMessages },
      });
    } catch (error) {
      console.error('Error fetching chats:', error);
      return res.status(500).json({
        status: 'error',
        message: (error as Error).message,
      });
    }
  }

  async getChatById(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const chat = await ChatModel.findById(id);

      if (!chat) {
        return res.status(404).json({ status: 'error', message: 'Chat not found' });
      }

      return res.status(200).json({ status: 'success', data: chat });
    } catch (error) {
      console.error(`Error fetching chat ${req.params.id}:`, error);
      return res.status(500).json({
        status: 'error',
        message: (error as Error).message,
      });
    }
  }

  async deleteChat(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const result = await ChatModel.findByIdAndDelete(id);

      if (!result) {
        return res.status(404).json({ status: 'error', message: 'Chat not found' });
      }

      return res.status(200).json({ status: 'success', message: 'Chat deleted successfully' });
    } catch (error) {
      console.error(`Error deleting chat ${req.params.id}:`, error);
      return res.status(500).json({
        status: 'error',
        message: (error as Error).message,
      });
    }
  }

  async bulkDeleteChats(req: Request, res: Response): Promise<Response> {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Invalid IDs provided' });
      }

      const result = await ChatModel.deleteMany({ _id: { $in: ids } });

      return res.status(200).json({
        status: 'success',
        message: `${result.deletedCount} chats deleted successfully`,
      });
    } catch (error) {
      console.error('Error bulk deleting chats:', error);
      return res.status(500).json({
        status: 'error',
        message: (error as Error).message,
      });
    }
  }

  async importChats(req: Request, res: Response): Promise<Response> {
    try {
      const body = req.body;

      let chatsToImport: Record<string, unknown>[] = [];
      if (Array.isArray(body)) {
        chatsToImport = body;
      } else if (body.chats && Array.isArray(body.chats)) {
        chatsToImport = body.chats;
      } else if (typeof body === 'object' && body !== null) {
        chatsToImport = [body];
      }

      if (chatsToImport.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'No valid chat data provided. Expected array or { chats: [...] }',
        });
      }

      const results = { success: 0, failed: 0, errors: [] as Array<{ index: number; sessionId?: string; error: string }> };

      const extractDate = (value: unknown): string => {
        if (!value) return new Date().toISOString();
        if (typeof value === 'object' && value !== null && '$date' in value) {
          return new Date((value as { $date: string }).$date).toISOString();
        }
        if (typeof value === 'string') return new Date(value).toISOString();
        return new Date().toISOString();
      };

      for (let i = 0; i < chatsToImport.length; i++) {
        const chatData = chatsToImport[i] as Record<string, unknown>;
        try {
          if (!chatData.sessionId) {
            chatData.sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
          }

          try {
            chatData.createdAt = extractDate(chatData.createdAt);
            chatData.updatedAt = extractDate(chatData.updatedAt);
          } catch {
            chatData.createdAt = new Date().toISOString();
            chatData.updatedAt = new Date().toISOString();
          }

          if (Array.isArray(chatData.messages)) {
            chatData.messages = chatData.messages.map((msg: Record<string, unknown>) => {
              try {
                return {
                  ...msg,
                  role: msg.sender === 'bot' ? 'assistant' : (msg.role || msg.sender || 'user'),
                  time: extractDate(msg.time || msg.createdAt),
                  createdAt: extractDate(msg.createdAt || msg.time),
                };
              } catch {
                return {
                  ...msg,
                  role: msg.sender === 'bot' ? 'assistant' : (msg.role || msg.sender || 'user'),
                  time: new Date().toISOString(),
                  createdAt: new Date().toISOString(),
                };
              }
            });
          }

          await ChatModel.create(chatData);
          results.success++;
        } catch (err) {
          results.failed++;
          results.errors.push({
            index: i,
            sessionId: chatData.sessionId as string,
            error: (err as Error).message,
          });
        }
      }

      return res.status(200).json({
        status: 'success',
        message: `Imported ${results.success} chats (${results.failed} failed)`,
        data: results,
      });
    } catch (error) {
      console.error('Error importing chats:', error);
      return res.status(500).json({
        status: 'error',
        message: (error as Error).message,
      });
    }
  }

  async exportChats(req: Request, res: Response): Promise<Response> {
    try {
      const { start, end, feedback } = req.query;
      const filter: Record<string, unknown> = {};

      if (start || end) {
        filter.updatedAt = {} as Record<string, Date>;
        if (start) (filter.updatedAt as Record<string, Date>).$gte = new Date(start as string);
        if (end)
          (filter.updatedAt as Record<string, Date>).$lte = new Date(
            new Date(end as string).setHours(23, 59, 59, 999)
          );
      }

      if (feedback) {
        filter['messages.feedback'] = feedback;
      }

      const chats = await ChatModel.find(filter);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="chats_export_${Date.now()}.json"`);

      return res.status(200).json({
        status: 'success',
        exportedAt: new Date().toISOString(),
        count: chats.length,
        chats,
      });
    } catch (error) {
      console.error('Error exporting chats:', error);
      return res.status(500).json({
        status: 'error',
        message: (error as Error).message,
      });
    }
  }
}

export = new ChatController();
