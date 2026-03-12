/**
 * EXPORT CONTROLLER
 * =================
 * Export JSON data to file / ส่งออกข้อมูลจาก JSON storage เป็นไฟล์
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Request, Response } from 'express';
import jsonStore from '../../utils/jsonDataStore';

async function exportChats(req: Request, res: Response): Promise<Response> {
  try {
    const chats = await jsonStore.getAllChats();

    if (chats.length === 0) {
      return res.status(404).json({
        error: 'No data found',
        message: 'No chats found in JSON storage',
      });
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      totalChats: chats.length,
      source: 'JSON_Storage',
      chats,
    };

    res.setHeader('Content-Disposition', `attachment; filename=chats_export_${Date.now()}.json`);
    res.setHeader('Content-Type', 'application/json');

    res.json(exportData);
    return res;
  } catch (error) {
    console.error('Export error:', error);
    return res.status(500).json({ error: (error as Error).message });
  }
}

async function getStorageStatus(req: Request, res: Response): Promise<Response> {
  try {
    const chats = await jsonStore.getAllChats();

    const chatsDir = path.join(__dirname, '../../../data/chats/sessions');
    let fileCount = 0;

    try {
      const files = await fs.readdir(chatsDir);
      fileCount = files.filter((f) => f.endsWith('.json')).length;
    } catch {
      fileCount = 0;
    }

    res.json({
      storage: {
        type: 'JSON',
        path: 'backend/data/chats/sessions/',
        chatCount: chats.length,
        fileCount,
      },
    });
    return res;
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
}

export { exportChats, getStorageStatus };
