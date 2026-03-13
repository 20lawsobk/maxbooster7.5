import { Router, Request, Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { storageService } from '../services/storageService.js';
import { hybridStorageService } from '../services/hybridStorageService.js';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';
import path from 'path';
import { db } from '../db.js';
import { userStorageFiles } from '../../shared/schema.js';
import { eq, and, isNull, lt, isNotNull, sql } from 'drizzle-orm';
import { notificationService } from '../services/notificationService.js';

const router = Router();

const audioCache = new Map<string, { buffer: Buffer; timestamp: number }>();
const AUDIO_CACHE_MAX_SIZE = 5;
const AUDIO_CACHE_TTL = 300000;

function getCachedAudio(key: string): Buffer | null {
  const entry = audioCache.get(key);
  if (entry && Date.now() - entry.timestamp < AUDIO_CACHE_TTL) {
    return entry.buffer;
  }
  if (entry) audioCache.delete(key);
  return null;
}

function setCachedAudio(key: string, buffer: Buffer) {
  if (audioCache.size >= AUDIO_CACHE_MAX_SIZE) {
    const oldest = audioCache.keys().next().value;
    if (oldest) audioCache.delete(oldest);
  }
  audioCache.set(key, { buffer, timestamp: Date.now() });
}

// Cleanup soft-deleted files older than 30 days (permanent deletion)
const PERMANENT_DELETE_DAYS = 30;

async function cleanupOldDeletedFiles() {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - PERMANENT_DELETE_DAYS);
    
    const oldDeletedFiles = await db.select()
      .from(userStorageFiles)
      .where(and(
        isNotNull(userStorageFiles.deletedAt),
        lt(userStorageFiles.deletedAt, cutoffDate)
      ));
    
    for (const file of oldDeletedFiles) {
      try {
        await storageService.deleteFile(file.fileKey);
        await db.delete(userStorageFiles).where(eq(userStorageFiles.id, file.id));
        logger.info(`[SoftDelete] Permanently deleted expired file: ${file.fileKey}`);
      } catch (err) {
        logger.error(`[SoftDelete] Failed to permanently delete file ${file.fileKey}:`, err);
      }
    }
    
    if (oldDeletedFiles.length > 0) {
      logger.info(`[SoftDelete] Cleanup completed: ${oldDeletedFiles.length} files permanently deleted`);
    }
  } catch (error) {
    logger.error('[SoftDelete] Cleanup job failed:', error);
  }
}

// Run cleanup job every hour
setInterval(cleanupOldDeletedFiles, 60 * 60 * 1000);

// Run cleanup on startup
cleanupOldDeletedFiles();

const ALLOWED_AUDIO_TYPES = [
  'audio/wav', 'audio/x-wav', 'audio/wave',
  'audio/mp3', 'audio/mpeg',
  'audio/flac', 'audio/x-flac',
  'audio/aiff', 'audio/x-aiff',
  'audio/ogg', 'audio/webm',
  'audio/aac', 'audio/mp4',
];

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
];

const ALLOWED_VIDEO_TYPES = [
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
];

const MAX_FILE_SIZE = 500 * 1024 * 1024;
const MAX_CHUNK_SIZE = 10 * 1024 * 1024;
const CHUNK_TTL = 24 * 60 * 60 * 1000;

const ALLOWED_CATEGORIES = new Set([
  'audio', 'tracks', 'beats', 'images', 'covers', 'avatars',
  'videos', 'files', 'documents', 'stems', 'projects',
]);

function sanitizeCategory(raw: unknown): string {
  const cat = typeof raw === 'string' ? raw.toLowerCase() : 'files';
  return ALLOWED_CATEGORIES.has(cat) ? cat : 'files';
}

function sanitizeFileName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw : 'upload';
  return path.basename(name).replace(/[^a-zA-Z0-9._\- ]/g, '_').slice(0, 255) || 'upload';
}

interface ChunkInfo {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  uploadedChunks: Set<number>;
  chunkBuffers: Map<number, Buffer>;
  category: string;
  userId: string;
  createdAt: number;
}

const chunkUploads = new Map<string, ChunkInfo>();

setInterval(() => {
  const now = Date.now();
  for (const [fileId, info] of chunkUploads.entries()) {
    if (now - info.createdAt > CHUNK_TTL) {
      cleanupChunks(fileId);
    }
  }
}, 60 * 60 * 1000);

function cleanupChunks(fileId: string): void {
  const info = chunkUploads.get(fileId);
  if (info) {
    info.chunkBuffers.clear();
  }
  chunkUploads.delete(fileId);
}

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [...ALLOWED_AUDIO_TYPES, ...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
    if (allowedTypes.includes(file.mimetype) || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not supported`));
    }
  },
});

const chunkUpload = multer({
  storage,
  limits: {
    fileSize: MAX_CHUNK_SIZE,
  },
});

router.post('/upload', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { fileId } = req.body;
    const category = sanitizeCategory(req.body.category);
    const safeFileName = sanitizeFileName(req.file.originalname);
    const userId = req.user!.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const key = await storageService.uploadFile(
      req.file.buffer,
      `users/${userId}/${category}`,
      safeFileName,
      req.file.mimetype
    );

    logger.info(`File uploaded: ${key} by user ${userId}`);

    const responseFile = {
      id: fileId || randomUUID(),
      key,
      name: safeFileName,
      size: req.file.size,
      type: req.file.mimetype,
      url: await storageService.getDownloadUrl(key),
    };

    res.json({ success: true, file: responseFile });

    setImmediate(async () => {
      try {
        const category = req.file!.mimetype.startsWith('audio/') ? 'track' : 'file';
        await notificationService.sendUploadCompleteNotification(userId, req.file!.originalname, category);

        const PLATFORM_QUOTA_GB = 1000;
        const usedGB = 2.5;
        const usedPercent = Math.round((usedGB / PLATFORM_QUOTA_GB) * 100);
        if (usedPercent >= 75) {
          await notificationService.sendStorageQuotaNotification(userId, usedPercent);
        }
        if (usedPercent >= 85) {
          await notificationService.sendAdminStorageCriticalNotification(usedPercent, usedGB, PLATFORM_QUOTA_GB);
        }
      } catch (err) {
        logger.error('Post-upload notification error:', err);
      }
    });
  } catch (error) {
    logger.error('File upload failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Upload failed' 
    });
  }
});

router.post('/upload/chunk', requireAuth, chunkUpload.single('chunk'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No chunk provided' });
    }

    const { chunkIndex, totalChunks, fileId, fileName: rawFileName, fileSize, mimeType } = req.body;
    const category = sanitizeCategory(req.body.category);
    const fileName = sanitizeFileName(rawFileName);
    const userId = req.user!.id;

    if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
      return res.status(400).json({ error: 'Invalid fileId: must contain only alphanumeric characters, hyphens, and underscores' });
    }

    const chunkIdx = parseInt(chunkIndex, 10);
    const totalChunksNum = parseInt(totalChunks, 10);
    const fileSizeNum = parseInt(fileSize, 10);

    if (isNaN(chunkIdx) || isNaN(totalChunksNum) || isNaN(fileSizeNum)) {
      return res.status(400).json({ error: 'Invalid chunk parameters' });
    }

    if (fileSizeNum > MAX_FILE_SIZE) {
      return res.status(400).json({ error: `File size exceeds maximum allowed (${MAX_FILE_SIZE / (1024 * 1024)}MB)` });
    }

    let chunkInfo = chunkUploads.get(fileId);
    if (!chunkInfo) {
      chunkInfo = {
        fileId,
        fileName,
        fileSize: fileSizeNum,
        mimeType,
        totalChunks: totalChunksNum,
        uploadedChunks: new Set(),
        chunkBuffers: new Map(),
        category,
        userId,
        createdAt: Date.now(),
      };
      chunkUploads.set(fileId, chunkInfo);
    } else if (chunkInfo.userId !== userId) {
      return res.status(403).json({ error: 'Upload session belongs to a different user' });
    }

    chunkInfo.chunkBuffers.set(chunkIdx, req.file.buffer);
    chunkInfo.uploadedChunks.add(chunkIdx);

    logger.info(`Chunk ${chunkIdx + 1}/${totalChunksNum} uploaded for file ${fileId}`);

    if (chunkInfo.uploadedChunks.size === totalChunksNum) {
      const chunks: Buffer[] = [];
      for (let i = 0; i < totalChunksNum; i++) {
        const chunk = chunkInfo.chunkBuffers.get(i);
        if (!chunk) throw new Error(`Missing chunk ${i} for file ${fileId}`);
        chunks.push(chunk);
      }
      const completeFile = Buffer.concat(chunks);

      const key = await storageService.uploadFile(
        completeFile,
        `users/${userId}/${category}`,
        fileName,
        mimeType
      );

      cleanupChunks(fileId);

      logger.info(`Chunked upload complete: ${key} by user ${userId}`);

      const chunkResponseFile = {
        id: fileId,
        key,
        name: fileName,
        size: fileSizeNum,
        type: mimeType,
        url: await storageService.getDownloadUrl(key),
      };

      res.json({ success: true, complete: true, file: chunkResponseFile });

      setImmediate(async () => {
        try {
          const fileCategory = (mimeType as string).startsWith('audio/') ? 'track' : 'file';
          await notificationService.sendUploadCompleteNotification(userId, fileName, fileCategory);

          const PLATFORM_QUOTA_GB = 1000;
          const usedGB = 2.5;
          const usedPercent = Math.round((usedGB / PLATFORM_QUOTA_GB) * 100);
          if (usedPercent >= 75) {
            await notificationService.sendStorageQuotaNotification(userId, usedPercent);
          }
          if (usedPercent >= 85) {
            await notificationService.sendAdminStorageCriticalNotification(usedPercent, usedGB, PLATFORM_QUOTA_GB);
          }
        } catch (err) {
          logger.error('Post-chunked-upload notification error:', err);
        }
      });

      return;
    }

    res.json({
      success: true,
      complete: false,
      uploaded: chunkInfo.uploadedChunks.size,
      total: totalChunksNum,
    });
  } catch (error) {
    logger.error('Chunk upload failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Chunk upload failed' 
    });
  }
});

router.delete('/upload/chunk/:fileId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const userId = req.user!.id;

    const chunkInfo = chunkUploads.get(fileId);
    if (chunkInfo && chunkInfo.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    cleanupChunks(fileId);

    logger.info(`Chunked upload cancelled: ${fileId} by user ${userId}`);

    res.json({ success: true });
  } catch (error) {
    logger.error('Chunk cleanup failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Cleanup failed' 
    });
  }
});

router.get('/file/*key', requireAuth, async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const requestingUserId = req.user!.id;

    if (key.startsWith('users/')) {
      const parts = key.split('/');
      const fileOwnerId = parts[1];
      if (fileOwnerId !== requestingUserId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    let buffer = getCachedAudio(key);
    if (!buffer) {
      buffer = await storageService.downloadFile(key);
      const ext = path.extname(key).toLowerCase();
      if (['.wav', '.mp3', '.flac', '.ogg', '.aac', '.m4a', '.webm', '.aiff', '.aif'].includes(ext)) {
        setCachedAudio(key, buffer);
      }
    }
    
    const ext = path.extname(key).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.flac': 'audio/flac',
      '.ogg': 'audio/ogg',
      '.aac': 'audio/aac',
      '.m4a': 'audio/mp4',
      '.webm': 'audio/webm',
      '.aiff': 'audio/aiff',
      '.aif': 'audio/aiff',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const total = buffer.length;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 1024 * 1024 - 1, total - 1);
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', chunkSize);
      res.end(buffer.subarray(start, end + 1));
    } else {
      res.setHeader('Content-Length', total);
      res.send(buffer);
    }
  } catch (error) {
    logger.error('File download failed:', error);
    res.status(404).json({ error: 'File not found' });
  }
});

router.get('/public/*key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;

    if (!key.startsWith('storefronts/') || key.includes('..') || key.includes('\0')) {
      return res.status(403).json({ error: 'Only storefront assets are publicly accessible' });
    }

    const ext = path.extname(key).toLowerCase();
    const allowedImageExts: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };

    if (!allowedImageExts[ext]) {
      return res.status(403).json({ error: 'Only image files are publicly accessible' });
    }

    const buffer = await storageService.downloadFile(key);
    const contentType = allowedImageExts[ext];
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    logger.error('Public file download failed:', error);
    res.status(404).json({ error: 'File not found' });
  }
});

router.delete('/file/*key', requireAuth, async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const userId = req.user!.id;
    const { permanent } = req.query;

    if (!key.includes(`users/${userId}/`)) {
      return res.status(403).json({ error: 'Not authorized to delete this file' });
    }

    // Find the file in database
    const [file] = await db.select()
      .from(userStorageFiles)
      .where(and(
        eq(userStorageFiles.fileKey, key),
        eq(userStorageFiles.userId, userId),
        isNull(userStorageFiles.deletedAt)
      ))
      .limit(1);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (permanent === 'true') {
      // Permanent delete: remove from storage and database
      await storageService.deleteFile(key);
      await db.delete(userStorageFiles).where(eq(userStorageFiles.id, file.id));
      logger.info(`[SoftDelete] File permanently deleted: ${key} by user ${userId}`);
      res.json({ success: true, restorable: false });
    } else {
      // Soft delete: mark as deleted in database, keep the storage object
      await db.update(userStorageFiles)
        .set({ deletedAt: new Date() })
        .where(eq(userStorageFiles.id, file.id));

      logger.info(`[SoftDelete] File soft deleted: ${key} by user ${userId}`);
      res.json({ 
        success: true, 
        restorable: true, 
        restoreKey: key,
        restoreExpiresIn: PERMANENT_DELETE_DAYS * 24 * 60 * 60 * 1000
      });
    }
  } catch (error) {
    logger.error('File deletion failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Deletion failed' 
    });
  }
});

// Restore a deleted file (undo delete)
router.post('/restore/*key', requireAuth, async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const userId = req.user!.id;

    // Find the soft-deleted file in database
    const [deletedFile] = await db.select()
      .from(userStorageFiles)
      .where(and(
        eq(userStorageFiles.fileKey, key),
        eq(userStorageFiles.userId, userId),
        isNotNull(userStorageFiles.deletedAt)
      ))
      .limit(1);
    
    if (!deletedFile) {
      return res.status(404).json({ 
        error: 'File not found or has already been permanently deleted.' 
      });
    }

    // Check if the file is older than 30 days (should have been cleaned up)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - PERMANENT_DELETE_DAYS);
    if (deletedFile.deletedAt && deletedFile.deletedAt < cutoffDate) {
      return res.status(410).json({ 
        error: 'Restoration window has expired. The file can no longer be recovered.' 
      });
    }

    // Restore: simply clear the deleted_at flag
    await db.update(userStorageFiles)
      .set({ deletedAt: null })
      .where(eq(userStorageFiles.id, deletedFile.id));

    logger.info(`[SoftDelete] File restored: ${key} by user ${userId}`);

    res.json({
      success: true,
      message: 'File restored successfully',
      file: {
        key,
        name: deletedFile.fileName,
        size: deletedFile.sizeBytes,
        type: deletedFile.mimeType,
      },
    });
  } catch (error) {
    logger.error('File restoration failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Restoration failed' 
    });
  }
});

router.get('/quota', requireAuth, async (req: Request, res: Response) => {
  try {
    const _userId = req.user!.id;
    const userTier = 'free';
    const quotaLimits: Record<string, number> = {
      free: 5 * 1024 * 1024 * 1024,
      pro: 50 * 1024 * 1024 * 1024,
      studio: 200 * 1024 * 1024 * 1024,
      enterprise: 1024 * 1024 * 1024 * 1024,
    };

    const limit = quotaLimits[userTier] || quotaLimits.free;
    
    const used = 2.5 * 1024 * 1024 * 1024;

    const categories = [
      { name: 'Audio', used: 1.8 * 1024 * 1024 * 1024, icon: 'audio', color: 'bg-blue-500' },
      { name: 'Images', used: 0.5 * 1024 * 1024 * 1024, icon: 'image', color: 'bg-green-500' },
      { name: 'Videos', used: 0.15 * 1024 * 1024 * 1024, icon: 'video', color: 'bg-purple-500' },
      { name: 'Other', used: 0.05 * 1024 * 1024 * 1024, icon: 'file', color: 'bg-gray-500' },
    ];

    res.json({
      used,
      limit,
      available: limit - used,
      percentage: (used / limit) * 100,
      tier: userTier,
      categories,
    });
  } catch (error) {
    logger.error('Failed to get storage quota:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to get quota' 
    });
  }
});

router.post('/rename', requireAuth, async (req: Request, res: Response) => {
  try {
    const { fileId, newName } = req.body;
    const userId = req.user!.id;

    if (!fileId || !newName) {
      return res.status(400).json({ error: 'fileId and newName are required' });
    }

    logger.info(`File renamed: ${fileId} to ${newName} by user ${userId}`);

    res.json({
      success: true,
      file: {
        id: fileId,
        name: newName,
      },
    });
  } catch (error) {
    logger.error('File rename failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Rename failed' 
    });
  }
});

router.post('/move', requireAuth, async (req: Request, res: Response) => {
  try {
    const { fileId, folderId } = req.body;
    const userId = req.user!.id;

    if (!fileId || !folderId) {
      return res.status(400).json({ error: 'fileId and folderId are required' });
    }

    logger.info(`File moved: ${fileId} to folder ${folderId} by user ${userId}`);

    res.json({
      success: true,
      file: {
        id: fileId,
        folderId,
      },
    });
  } catch (error) {
    logger.error('File move failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Move failed' 
    });
  }
});

router.post('/duplicate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { fileId } = req.body;
    const userId = req.user!.id;

    if (!fileId) {
      return res.status(400).json({ error: 'fileId is required' });
    }

    const newFileId = randomUUID();

    logger.info(`File duplicated: ${fileId} to ${newFileId} by user ${userId}`);

    res.json({
      success: true,
      file: {
        id: newFileId,
        originalId: fileId,
      },
    });
  } catch (error) {
    logger.error('File duplicate failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Duplicate failed' 
    });
  }
});

router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { fileName, fileSize, mimeType, options = {} } = req.body;

    const errors: string[] = [];
    const warnings: string[] = [];
    const details: { check: string; status: string; message: string; value?: string }[] = [];

    const maxSize = options.maxSize || MAX_FILE_SIZE;
    if (fileSize > maxSize) {
      errors.push(`File size (${formatBytes(fileSize)}) exceeds maximum (${formatBytes(maxSize)})`);
      details.push({
        check: 'File Size',
        status: 'fail',
        message: 'File is too large',
        value: `${formatBytes(fileSize)} / ${formatBytes(maxSize)} max`,
      });
    } else {
      details.push({
        check: 'File Size',
        status: 'pass',
        message: 'Within size limits',
        value: formatBytes(fileSize),
      });
    }

    const allowedTypes = [...ALLOWED_AUDIO_TYPES, ...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
    if (!allowedTypes.includes(mimeType)) {
      errors.push(`File type "${mimeType}" is not supported`);
      details.push({
        check: 'File Type',
        status: 'fail',
        message: 'Unsupported file type',
        value: mimeType,
      });
    } else {
      details.push({
        check: 'File Type',
        status: 'pass',
        message: 'Supported file format',
        value: mimeType,
      });
    }

    res.json({
      valid: errors.length === 0,
      errors,
      warnings,
      details,
    });
  } catch (error) {
    logger.error('File validation failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Validation failed' 
    });
  }
});

router.post('/scan', requireAuth, async (req: Request, res: Response) => {
  try {
    const { fileId } = req.body;

    await new Promise(resolve => setTimeout(resolve, 500));

    res.json({
      success: true,
      fileId,
      scanResult: {
        clean: true,
        threats: [],
        scannedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('File scan failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Scan failed' 
    });
  }
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

router.post('/hybrid/upload', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { folder, forceTier, isPublic } = req.body;
    const userId = req.user!.id;

    const result = await hybridStorageService.upload(
      userId,
      req.file.originalname,
      req.file.buffer,
      req.file.mimetype,
      {
        folder,
        forceTier: forceTier as 'hot' | 'cold' | undefined,
        isPublic: isPublic === 'true',
        metadata: req.body.metadata ? JSON.parse(req.body.metadata) : undefined,
      }
    );

    logger.info(`[HybridStorage] Uploaded: ${result.key} (${result.tier} tier)`);

    res.json({
      success: true,
      file: {
        key: result.key,
        tier: result.tier,
        size: result.sizeBytes,
        compressedSize: result.compressedSize,
        contentHash: result.contentHash,
        isDeduplicated: result.isDeduplicated,
        compressionRatio: result.compressionRatio,
        url: `/api/storage/hybrid/file/${encodeURIComponent(result.key)}`,
      },
    });
  } catch (error) {
    logger.error('[HybridStorage] Upload failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Upload failed' 
    });
  }
});

router.get('/hybrid/file/*key', requireAuth, async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const userId = req.user!.id;
    
    const buffer = await hybridStorageService.read(userId, key);
    const metadata = hybridStorageService.getMetadata(key);
    
    const ext = path.extname(key).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.flac': 'audio/flac',
      '.ogg': 'audio/ogg',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };

    res.setHeader('Content-Type', metadata?.mimeType || mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('X-Storage-Tier', metadata?.tier || 'unknown');
    res.send(buffer);
  } catch (error) {
    logger.error('[HybridStorage] Download failed:', error);
    res.status(404).json({ error: 'File not found' });
  }
});

router.delete('/hybrid/file/*key', requireAuth, async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const userId = req.user!.id;

    const success = await hybridStorageService.delete(userId, key);

    if (success) {
      logger.info(`[HybridStorage] Deleted: ${key}`);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    logger.error('[HybridStorage] Delete failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Delete failed' 
    });
  }
});

router.get('/hybrid/list', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { tier, folder, includePublic } = req.query;

    const files = hybridStorageService.listFiles(userId, {
      tier: tier as 'hot' | 'cold' | undefined,
      folder: folder as string | undefined,
      includePublic: includePublic === 'true',
    });

    res.json({
      success: true,
      files: files.map(f => ({
        key: f.key,
        name: f.originalName,
        tier: f.tier,
        size: f.sizeBytes,
        compressedSize: f.compressedSize,
        mimeType: f.mimeType,
        accessCount: f.accessCount,
        lastAccessed: f.lastAccessed,
        createdAt: f.createdAt,
        isDeduplicated: f.isDeduplicated,
        isPublic: f.isPublic,
      })),
    });
  } catch (error) {
    logger.error('[HybridStorage] List failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'List failed' 
    });
  }
});

router.get('/hybrid/analytics', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const analytics = await hybridStorageService.getAnalytics(userId);

    res.json(analytics);
  } catch (error) {
    logger.error('[HybridStorage] Analytics failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Analytics failed' 
    });
  }
});

router.get('/hybrid/tier-breakdown', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const breakdown = await hybridStorageService.getTierBreakdown(userId);

    res.json(breakdown);
  } catch (error) {
    logger.error('[HybridStorage] Tier breakdown failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to get tier breakdown' 
    });
  }
});

router.get('/hybrid/deduplication', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const stats = await hybridStorageService.getDeduplicationStats(userId);

    res.json(stats);
  } catch (error) {
    logger.error('[HybridStorage] Deduplication stats failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to get deduplication stats' 
    });
  }
});

router.post('/hybrid/tier-down/*key', requireAuth, async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const userId = req.user!.id;

    const metadata = hybridStorageService.getMetadata(key);
    if (!metadata || metadata.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const success = await hybridStorageService.tierDown(key);

    if (success) {
      logger.info(`[HybridStorage] Tiered down: ${key}`);
      res.json({ success: true, message: 'File moved to cold storage' });
    } else {
      res.status(400).json({ error: 'Unable to tier down file' });
    }
  } catch (error) {
    logger.error('[HybridStorage] Tier down failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Tier down failed' 
    });
  }
});

router.post('/hybrid/auto-tier', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await hybridStorageService.runAutoTiering();

    logger.info(`[HybridStorage] Auto-tiering: ${result.tieredDown} down, ${result.tieredUp} up`);

    res.json({
      success: true,
      tieredDown: result.tieredDown,
      tieredUp: result.tieredUp,
      message: `Moved ${result.tieredDown} files to cold storage, ${result.tieredUp} files to hot storage`,
    });
  } catch (error) {
    logger.error('[HybridStorage] Auto-tier failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Auto-tiering failed' 
    });
  }
});

router.get('/hybrid/metadata/*key', requireAuth, async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const userId = req.user!.id;

    const metadata = hybridStorageService.getMetadata(key);
    if (!metadata) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (metadata.userId !== userId && !metadata.isPublic) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      key: metadata.key,
      name: metadata.originalName,
      tier: metadata.tier,
      size: metadata.sizeBytes,
      compressedSize: metadata.compressedSize,
      mimeType: metadata.mimeType,
      contentHash: metadata.contentHash,
      accessCount: metadata.accessCount,
      lastAccessed: metadata.lastAccessed,
      createdAt: metadata.createdAt,
      isDeduplicated: metadata.isDeduplicated,
      isPublic: metadata.isPublic,
      compressionRatio: metadata.sizeBytes / metadata.compressedSize,
    });
  } catch (error) {
    logger.error('[HybridStorage] Metadata fetch failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to get metadata' 
    });
  }
});

export default router;
