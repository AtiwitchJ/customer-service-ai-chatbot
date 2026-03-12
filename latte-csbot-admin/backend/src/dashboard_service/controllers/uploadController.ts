/**
 * UPLOAD CONTROLLER
 * =================
 * Handles file uploads for chats data / จัดการการอัพโหลดไฟล์สำหรับข้อมูล chats
 */

import * as fs from 'fs';
import * as path from 'path';
import { Request, Response } from 'express';
import JsonChatModel from '../../chat_service/models/JsonChatModel';
import { updateAllCaches } from '../analytics/analyticsService';

function transformMongoDBFormat(chat: Record<string, unknown>): Record<string, unknown> {
  const transformed = { ...chat };

  if (transformed._id && typeof transformed._id === 'object' && (transformed._id as { $oid?: string }).$oid) {
    transformed._id = (transformed._id as { $oid: string }).$oid;
  }

  const createdAtVal = transformed.createdAt;
  transformed.createdAt =
    typeof createdAtVal === 'object' && createdAtVal !== null && '_date' in createdAtVal
      ? (createdAtVal as { _date: string })._date
      : createdAtVal;

  const updatedAtVal = transformed.updatedAt;
  transformed.updatedAt =
    typeof updatedAtVal === 'object' && updatedAtVal !== null && '_date' in updatedAtVal
      ? (updatedAtVal as { _date: string })._date
      : updatedAtVal;

  if (Array.isArray(transformed.messages)) {
    transformed.messages = transformed.messages.map((msg: unknown) => {
      const newMsg = { ...(msg as Record<string, unknown>) };
      if (newMsg._id && typeof newMsg._id === 'object' && (newMsg._id as { $oid?: string }).$oid) {
        newMsg._id = (newMsg._id as { $oid: string }).$oid;
      }
      if (newMsg.createdAt && typeof newMsg.createdAt === 'object' && (newMsg.createdAt as { $date?: string }).$date) {
        newMsg.createdAt = (newMsg.createdAt as { $date: string }).$date;
      }
      if (newMsg.time && typeof newMsg.time === 'object' && (newMsg.time as { $date?: string }).$date) {
        newMsg.time = (newMsg.time as { $date: string }).$date;
      }
      if (newMsg._id && typeof newMsg._id !== 'string') {
        delete newMsg._id;
      }
      return newMsg;
    });
  }

  delete transformed.__v;

  return transformed;
}

async function uploadChats(req: Request, res: Response): Promise<Response> {
  try {
    const files = req.files as { chatsFile?: { tempFilePath?: string; name: string; data?: Buffer } } | undefined;
    if (!files || !files.chatsFile) {
      return res.status(400).json({
        error: 'No file uploaded. Please provide a chats.json file.',
      });
    }

    const file = files.chatsFile;
    const filePath = file.tempFilePath || path.join(__dirname, '../../..', file.name);

    let fileContent: string;
    try {
      if (file.tempFilePath) {
        fileContent = fs.readFileSync(file.tempFilePath, 'utf8');
      } else {
        fileContent = (file.data || Buffer.from('')).toString('utf8');
      }
    } catch {
      return res.status(500).json({ error: 'Failed to read uploaded file.' });
    }

    let chats: unknown[];
    try {
      chats = JSON.parse(fileContent);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON format in uploaded file.' });
    }

    if (!Array.isArray(chats)) {
      return res.status(400).json({
        error: 'Uploaded JSON must be an array of chat sessions.',
      });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < chats.length; i++) {
      try {
        const chat = chats[i] as Record<string, unknown>;
        const transformedChat = transformMongoDBFormat(chat);

        if (transformedChat.sessionId) {
          await JsonChatModel.create(transformedChat);
          successCount++;
        } else {
          errorCount++;
          errors.push({ index: i, error: 'Missing sessionId' });
        }
      } catch (saveError) {
        errorCount++;
        errors.push({ index: i, error: (saveError as Error).message });
      }
    }

    cleanupTempFile(file);

    try {
      await updateAllCaches();
    } catch (cacheError) {
      console.error('Cache update failed:', (cacheError as Error).message);
    }

    return res.json({
      success: true,
      message: `Successfully imported ${successCount} chat sessions`,
      summary: { total: chats.length, imported: successCount, failed: errorCount },
      errors: errors.length > 0 ? errors : null,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: (error as Error).message });
  }
}

function cleanupTempFile(file: { tempFilePath?: string }): { cleaned: boolean } {
  try {
    if (file.tempFilePath && fs.existsSync(file.tempFilePath)) {
      fs.unlinkSync(file.tempFilePath);
      return { cleaned: true };
    }
  } catch (e) {
    console.warn('Could not cleanup temp file:', (e as Error).message);
  }
  return { cleaned: false };
}

function healthCheck(req: Request, res: Response): void {
  res.json({ status: 'ok', service: 'upload' });
}

export { uploadChats, healthCheck };
