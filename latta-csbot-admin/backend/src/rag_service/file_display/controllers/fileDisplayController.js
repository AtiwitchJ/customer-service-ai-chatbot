const path = require('path');
const { getMimeType } = require('../../utils/ragUtils');

/**
 * File Display Controller
 * =======================
 * Responsibilities:
 * - Manage file listing, viewing, and deletion operations.
 * - Transform internal storage URLs to public accessible URLs.
 * - Handle bulk deletion of files and associated images/documents.
 * - Note: File upload logic is handled separately by the Python service.
 * 
 * หน้าที่หลัก:
 * - จัดการการแสดงรายการ ดู และลบไฟล์ต่างๆ
 * - แปลง URL ภายในให้เป็น URL สาธารณะที่เข้าถึงได้
 * - จัดการการลบไฟล์และรูปภาพ/เอกสารที่เกี่ยวข้องแบบกลุ่ม
 * - หมายเหตุ: การอัปโหลดไฟล์ถูกจัดการแยกต่างหากโดย Python service
 */
const { createClient } = require('@supabase/supabase-js');
// INITIALIZE SUPABASE CLIENT
// Similar to Python's get_supabase_client()
// ----------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const STORAGE_BUCKET = process.env.STORAGE_BUCKET;
const SUPABASE_PUBLIC_URL = process.env.SUPABASE_PUBLIC_URL;

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    // console.log('✅ [File Display Controller] Supabase initialized');
}

/**
 * File Display Controller (Module Style)
 * ======================================
 * Responsibilities:
 * - Manage file listing, viewing, and deletion.
 * - Same internal logic as Python controller style.
 */

// Helper: Transform URL
function _transformToPublicUrl(url) {
    if (!url) return url;

    // Ensure we have robust base URLs for comparison/replacement
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

// Helper: Parse Path
function _parseFilePath(inputPath) {
    let bucket = STORAGE_BUCKET;
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

/**
 * GET /api/files
 */
async function getFiles(req, res) {
    if (!supabase) return res.json([]);

    const limit = parseInt(req.query.limit) || 100;

    try {
        const { data, error } = await supabase.from('files')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error fetching files:', error);
            return res.status(500).json([]);
        }

        const formattedFiles = data.map(f => ({
            id: f.id,
            name: f.file_name,
            created: f.created_at,
            storage_id: f.storage_id,
            file_path: f.file_path.startsWith('http')
                ? _transformToPublicUrl(f.file_path)
                : `${(SUPABASE_PUBLIC_URL || '').replace(/\/$/, '')}/storage/v1/object/public/${process.env.FILE_RAG_BUCKET || 'file_rag'}/${f.file_path}`,
            file_size: f.file_size,
            mime_type: f.mime_type,
            status: f.status || 'done'
        }));

        res.json(formattedFiles);
    } catch (err) {
        console.error('Error in getFiles:', err);
        res.status(500).json([]);
    }
}

/**
 * DELETE /api/files/:id
 */
async function deleteFile(req, res) {
    const fileId = req.params.id.trim();
    if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

    try {
        const { data: fileRecord, error: findError } = await supabase
            .from('files').select('*').eq('id', fileId).single();

        if (findError || !fileRecord) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Get documents
        const { data: documents } = await supabase
            .from('documents')
            .select('metadata')
            .eq('file_id', fileId);

        // Delete images logic
        if (documents && documents.length > 0) {
            const imagePathsToDelete = [];
            const IMAGE_RAG_BUCKET = process.env.IMAGE_RAG_BUCKET;

            for (const doc of documents) {
                const metadata = doc.metadata || {};
                const urls = [];
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
                await supabase.storage.from(IMAGE_RAG_BUCKET).remove(uniquePaths);
            }
        }

        // Delete DB records
        await supabase.from('documents').delete().eq('file_id', fileId);
        await supabase.from('files').delete().eq('id', fileId);

        // Delete source file
        if (fileRecord.file_path) {
            let { bucket, storagePath } = _parseFilePath(fileRecord.file_path);
            const FILE_RAG_BUCKET = process.env.FILE_RAG_BUCKET;

            if (bucket === STORAGE_BUCKET) {
                const { error: ragError } = await supabase.storage.from(FILE_RAG_BUCKET).remove([storagePath]);
                if (ragError) {
                    await supabase.storage.from(bucket).remove([storagePath]);
                }
            } else {
                await supabase.storage.from(bucket).remove([storagePath]);
            }

            if (fileRecord.storage_id) {
                await supabase.schema('storage').from('objects')
                    .delete().eq('id', fileRecord.storage_id).eq('bucket_id', FILE_RAG_BUCKET);
                await supabase.schema('storage').from('objects')
                    .delete().eq('id', fileRecord.storage_id).eq('bucket_id', bucket);
            }
        }

        res.json({ success: true, message: 'File deleted successfully' });
    } catch (err) {
        console.error('Error deleting file:', err);
        res.status(500).json({ error: err.message });
    }
}

/**
 * POST /api/files/bulk-delete
 */
async function bulkDelete(req, res) {
    if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'No IDs provided' });
        }

        let deletedCount = 0;
        const errors = [];
        const IMAGE_RAG_BUCKET = process.env.IMAGE_RAG_BUCKET;
        const FILE_RAG_BUCKET = process.env.FILE_RAG_BUCKET;

        for (const fileId of ids) {
            try {
                const { data: fileRecord } = await supabase.from('files').select('*').eq('id', fileId).single();

                if (fileRecord) {
                    // Image Cleanup
                    const { data: documents } = await supabase.from('documents').select('metadata').eq('file_id', fileId);
                    if (documents && documents.length > 0) {
                        const imagePathsToDelete = [];
                        for (const doc of documents) {
                            const metadata = doc.metadata || {};
                            const urls = [];
                            if (metadata.image_url) urls.push(metadata.image_url);
                            if (metadata.image_urls && Array.isArray(metadata.image_urls)) urls.push(...metadata.image_urls);

                            for (const url of urls) {
                                const { bucket, storagePath } = _parseFilePath(url);
                                if (bucket === IMAGE_RAG_BUCKET && storagePath) imagePathsToDelete.push(storagePath);
                            }
                        }
                        if (imagePathsToDelete.length > 0) {
                            await supabase.storage.from(IMAGE_RAG_BUCKET).remove([...new Set(imagePathsToDelete)]);
                        }
                    }

                    // DB cleanup
                    await supabase.from('documents').delete().eq('file_id', fileId);
                    await supabase.from('files').delete().eq('id', fileId);

                    // Storage cleanup
                    if (fileRecord.file_path) {
                        let { bucket, storagePath } = _parseFilePath(fileRecord.file_path);
                        if (bucket === STORAGE_BUCKET) {
                            const { error: ragError } = await supabase.storage.from(FILE_RAG_BUCKET).remove([storagePath]);
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
                errors.push({ fileId, error: e.message });
            }
        }

        res.json({ success: true, deletedCount, errors: errors.length > 0 ? errors : undefined });
    } catch (err) {
        console.error('Error in bulk delete:', err);
        res.status(500).json({ error: err.message });
    }
}

/**
 * GET /api/files/view/{filepath}
 */
async function viewFile(req, res) {
    if (!supabase) return res.status(500).send('Storage not configured');

    let inputPath = req.rawFilePath || req.url;
    if (inputPath.startsWith('/') && !req.rawFilePath) inputPath = inputPath.substring(1);

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
    } catch (err) {
        console.error('Error viewing file:', err);
        res.status(500).send('Internal Server Error');
    }
}

/**
 * GET /api/files/stats
 */
async function getFileStats(req, res) {
    if (!supabase) return res.json({ count: 0, totalSize: 0 });

    try {
        const { data, error } = await supabase.from('files').select('file_size');
        if (error) return res.json({ count: 0, totalSize: 0 });

        const count = data.length;
        const totalSize = data.reduce((sum, file) => sum + (file.file_size || 0), 0);

        res.json({
            count,
            totalSize,
            totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100
        });
    } catch (err) {
        res.json({ count: 0, totalSize: 0 });
    }
}

// Export functions directly (like Python controller)
module.exports = {
    getFiles,
    deleteFile,
    bulkDelete,
    viewFile,
    getFileStats
};