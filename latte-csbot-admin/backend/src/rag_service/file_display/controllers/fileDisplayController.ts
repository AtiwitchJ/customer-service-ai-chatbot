/**
 * File Display Controller
 * =======================
 * Manages file listing, viewing, and deletion operations.
 */

import * as path from 'path';
import { Request, Response } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getMimeType } from '../../../utils/ragUtils';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const STORAGE_BUCKET = process.env.STORAGE_BUCKET;
const SUPABASE_PUBLIC_URL = process.env.SUPABASE_PUBLIC_URL;

let supabase: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
}

function _transformToPublicUrl(url: string | null | undefined): string | null | undefined {
  if (!url) return url;
  const internalUrl = (SUPABASE_URL || '').replace(/\/$/, '');
  const publicUrl = (SUPABASE_PUBLIC_URL || '').replace(/\/$/, '');
  const alternativeInternalUrl = 'http://kong:8000';

  if (internalUrl && url.includes(internalUrl)) {
    return url.replace(internalUrl, publicUrl);
  }
  if (url.includes(alternativeInternalUrl)) {
    return url.replace(alternativeInternalUrl, publicUrl);
  }
  return url;
}

function _parseFilePath(inputPath: string): { bucket: string; storagePath: string } {
  let bucket = STORAGE_BUCKET || 'file_rag';
  let storagePath = inputPath;

  const storageMarker = '/storage/v1/object/public/';
  if (inputPath.includes(storageMarker)) {
    const parts = inputPath.split(storageMarker);
    const remaining = parts[parts.length - 1];
    const firstSlashIndex = remaining.indexOf('/');
    if (firstSlashIndex !== -1) {
      bucket = remaining.substring(0, firstSlashIndex);
      storagePath = remaining.substring(firstSlashIndex + 1);
    }
  }
  return { bucket, storagePath };
}

async function getFiles(req: Request, res: Response): Promise<Response> {
  if (!supabase) return res.json([]);

  const limit = parseInt(req.query.limit as string) || 100;

  try {
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching files:', error);
      return res.status(500).json([]);
    }

    const formattedFiles = (data || []).map((f: Record<string, unknown>) => ({
      id: f.id,
      name: f.file_name,
      created: f.created_at,
      storage_id: f.storage_id,
      file_path: (f.file_path as string)?.startsWith('http')
        ? _transformToPublicUrl(f.file_path as string)
        : `${(SUPABASE_PUBLIC_URL || '').replace(/\/$/, '')}/storage/v1/object/public/${process.env.FILE_RAG_BUCKET || 'file_rag'}/${f.file_path}`,
      file_size: f.file_size,
      mime_type: f.mime_type,
      status: f.status || 'done',
    }));

    res.json(formattedFiles);
    return res;
  } catch (err) {
    console.error('Error in getFiles:', err);
    return res.status(500).json([]);
  }
}

async function deleteFile(req: Request, res: Response): Promise<Response> {
  const fileId = req.params.id.trim();
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    const { data: fileRecord, error: findError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (findError || !fileRecord) {
      return res.status(404).json({ error: 'File not found' });
    }

    const { data: documents } = await supabase
      .from('documents')
      .select('metadata')
      .eq('file_id', fileId);

    if (documents && documents.length > 0) {
      const imagePathsToDelete: string[] = [];
      const IMAGE_RAG_BUCKET = process.env.IMAGE_RAG_BUCKET;

      for (const doc of documents) {
        const metadata = (doc as { metadata?: { image_url?: string; image_urls?: string[] } }).metadata || {};
        const urls: string[] = [];
        if (metadata.image_url) urls.push(metadata.image_url);
        if (metadata.image_urls && Array.isArray(metadata.image_urls)) urls.push(...metadata.image_urls);

        for (const url of urls) {
          const { bucket, storagePath } = _parseFilePath(url);
          if (bucket === IMAGE_RAG_BUCKET && storagePath) {
            imagePathsToDelete.push(storagePath);
          }
        }
      }

      if (imagePathsToDelete.length > 0) {
        const uniquePaths = [...new Set(imagePathsToDelete)];
        console.log(`🗑️ Deleting ${uniquePaths.length} images from ${IMAGE_RAG_BUCKET}`);
        await supabase.storage.from(IMAGE_RAG_BUCKET!).remove(uniquePaths);
      }
    }

    await supabase.from('documents').delete().eq('file_id', fileId);
    await supabase.from('files').delete().eq('id', fileId);

    if (fileRecord.file_path) {
      let { bucket, storagePath } = _parseFilePath(fileRecord.file_path as string);
      const FILE_RAG_BUCKET = process.env.FILE_RAG_BUCKET;

      if (bucket === STORAGE_BUCKET) {
        const { error: ragError } = await supabase.storage.from(FILE_RAG_BUCKET || 'file_rag').remove([storagePath]);
        if (ragError) {
          await supabase.storage.from(bucket).remove([storagePath]);
        }
      } else {
        await supabase.storage.from(bucket).remove([storagePath]);
      }

      if (fileRecord.storage_id) {
        await supabase.schema('storage').from('objects').delete().eq('id', fileRecord.storage_id).eq('bucket_id', FILE_RAG_BUCKET || 'file_rag');
        await supabase.schema('storage').from('objects').delete().eq('id', fileRecord.storage_id).eq('bucket_id', bucket);
      }
    }

    res.json({ success: true, message: 'File deleted successfully' });
    return res;
  } catch (err) {
    console.error('Error deleting file:', err);
    return res.status(500).json({ error: (err as Error).message });
  }
}

async function bulkDelete(req: Request, res: Response): Promise<Response> {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No IDs provided' });
    }

    let deletedCount = 0;
    const errors: Array<{ fileId: string; error: string }> = [];
    const IMAGE_RAG_BUCKET = process.env.IMAGE_RAG_BUCKET;
    const FILE_RAG_BUCKET = process.env.FILE_RAG_BUCKET;

    for (const fileId of ids as string[]) {
      try {
        const { data: fileRecord } = await supabase.from('files').select('*').eq('id', fileId).single();

        if (fileRecord) {
          const { data: documents } = await supabase.from('documents').select('metadata').eq('file_id', fileId);
          if (documents && documents.length > 0) {
            const imagePathsToDelete: string[] = [];
            for (const doc of documents) {
              const metadata = (doc as { metadata?: { image_url?: string; image_urls?: string[] } }).metadata || {};
              const urls: string[] = [];
              if (metadata.image_url) urls.push(metadata.image_url);
              if (metadata.image_urls && Array.isArray(metadata.image_urls)) urls.push(...metadata.image_urls);

              for (const url of urls) {
                const { bucket, storagePath } = _parseFilePath(url);
                if (bucket === IMAGE_RAG_BUCKET && storagePath) imagePathsToDelete.push(storagePath);
              }
            }
            if (imagePathsToDelete.length > 0) {
              await supabase.storage.from(IMAGE_RAG_BUCKET!).remove([...new Set(imagePathsToDelete)]);
            }
          }

          await supabase.from('documents').delete().eq('file_id', fileId);
          await supabase.from('files').delete().eq('id', fileId);

          if (fileRecord.file_path) {
            let { bucket, storagePath } = _parseFilePath(fileRecord.file_path as string);
            if (bucket === STORAGE_BUCKET) {
              const { error: ragError } = await supabase.storage.from(FILE_RAG_BUCKET || 'file_rag').remove([storagePath]);
              if (ragError) {
                await supabase.storage.from(bucket).remove([storagePath]);
              }
            } else {
              await supabase.storage.from(bucket).remove([storagePath]);
            }
          }
          deletedCount++;
        }
      } catch (e) {
        errors.push({ fileId, error: (e as Error).message });
      }
    }

    res.json({ success: true, deletedCount, errors: errors.length > 0 ? errors : undefined });
    return res;
  } catch (err) {
    console.error('Error in bulk delete:', err);
    return res.status(500).json({ error: (err as Error).message });
  }
}

async function viewFile(req: Request, res: Response): Promise<Response> {
  if (!supabase) return res.status(500).send('Storage not configured');

  let inputPath = (req as Request & { rawFilePath?: string }).rawFilePath || req.url;
  if (inputPath.startsWith('/') && !(req as Request & { rawFilePath?: string }).rawFilePath) {
    inputPath = inputPath.substring(1);
  }

  if (!inputPath) return res.status(404).send('File path missing');

  try {
    const { bucket, storagePath } = _parseFilePath(inputPath);
    const { data, error } = await supabase.storage.from(bucket).download(storagePath);

    if (error) return res.status(404).send('File not found');

    const buffer = Buffer.from(await data.arrayBuffer());
    const ext = path.extname(storagePath).toLowerCase();

    res.setHeader('Content-Type', getMimeType(ext));
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
    return res;
  } catch (err) {
    console.error('Error viewing file:', err);
    return res.status(500).send('Internal Server Error');
  }
}

async function getFileStats(req: Request, res: Response): Promise<Response> {
  if (!supabase) return res.json({ count: 0, totalSize: 0 });

  try {
    const { data, error } = await supabase.from('files').select('file_size');
    if (error) return res.json({ count: 0, totalSize: 0 });

    const count = (data || []).length;
    const totalSize = (data || []).reduce((sum: number, file: { file_size?: number }) => sum + (file.file_size || 0), 0);

    res.json({
      count,
      totalSize,
      totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100,
    });
    return res;
  } catch {
    res.json({ count: 0, totalSize: 0 });
    return res;
  }
}

export { getFiles, deleteFile, bulkDelete, viewFile, getFileStats };
