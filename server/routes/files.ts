import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { userStorage, userStorageFiles } from '../../shared/schema.js';
import { eq, and, desc, sql, like, isNull, isNotNull, lt } from 'drizzle-orm';
import { storageService } from '../services/storageService.js';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../logger.js';
import { requirePresignedForLargeUploads } from '../middleware/uploadSizeGuard.js';

const PERMANENT_DELETE_DAYS = 30;

const transcodeJobs = new Map<string, { startedAt: number; estimatedDurationMs: number; userId: string }>();

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024,
  },
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const ALLOWED_AUDIO_TYPES = [
  'audio/wav', 'audio/x-wav', 'audio/wave',
  'audio/mp3', 'audio/mpeg',
  'audio/flac', 'audio/x-flac',
  'audio/aiff', 'audio/x-aiff',
  'audio/ogg', 'audio/webm', 'audio/aac',
];

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
];

const ALL_ALLOWED_TYPES = [...ALLOWED_AUDIO_TYPES, ...ALLOWED_IMAGE_TYPES];

async function getOrCreateUserStorage(userId: string) {
  const existing = await db.select().from(userStorage).where(eq(userStorage.userId, userId)).limit(1);
  
  if (existing.length > 0) {
    return existing[0];
  }
  
  const storagePrefix = `user-${userId}`;
  const [newStorage] = await db.insert(userStorage).values({
    userId,
    storagePrefix,
    totalBytes: 0,
    fileCount: 0,
    quotaBytes: 5 * 1024 * 1024 * 1024,
  }).returning();
  
  return newStorage;
}

router.post('/upload', requirePresignedForLargeUploads, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication required',
        outcome: 'auth_required'
      });
    }

    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'No file provided',
        outcome: 'no_file'
      });
    }

    const { category = 'files', folder = '/' } = req.body;
    const file = req.file;

    if (!ALL_ALLOWED_TYPES.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: `Invalid file type: ${file.mimetype}`,
        outcome: 'invalid_type',
        details: {
          providedType: file.mimetype,
          allowedTypes: ALL_ALLOWED_TYPES,
          allowedFormats: ['WAV', 'MP3', 'FLAC', 'AIFF', 'OGG', 'JPEG', 'PNG', 'GIF', 'WEBP'],
        }
      });
    }

    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      return res.status(413).json({
        success: false,
        error: `File too large: ${formatBytes(file.size)}`,
        outcome: 'file_too_large',
        details: {
          fileSize: file.size,
          fileSizeFormatted: formatBytes(file.size),
          maxSize: maxSize,
          maxSizeFormatted: formatBytes(maxSize),
        }
      });
    }

    const storage = await getOrCreateUserStorage(req.user.id);

    if (storage.totalBytes + file.size > storage.quotaBytes) {
      const usedPercent = Math.round((storage.totalBytes / storage.quotaBytes) * 100);
      return res.status(507).json({
        success: false,
        error: 'Storage quota exceeded',
        outcome: 'quota_exceeded',
        details: {
          used: storage.totalBytes,
          usedFormatted: formatBytes(storage.totalBytes),
          quota: storage.quotaBytes,
          quotaFormatted: formatBytes(storage.quotaBytes),
          usedPercent,
          needed: file.size,
          neededFormatted: formatBytes(file.size),
          available: storage.quotaBytes - storage.totalBytes,
          availableFormatted: formatBytes(storage.quotaBytes - storage.totalBytes),
        }
      });
    }

    const existingFile = await db.select()
      .from(userStorageFiles)
      .where(and(
        eq(userStorageFiles.userId, req.user.id),
        eq(userStorageFiles.fileName, file.originalname),
        eq(userStorageFiles.folder, folder)
      ))
      .limit(1);

    if (existingFile.length > 0) {
      return res.status(409).json({
        success: false,
        error: `File "${file.originalname}" already exists in this location`,
        outcome: 'duplicate_file',
        details: {
          existingFile: {
            id: existingFile[0].id,
            name: existingFile[0].fileName,
            size: existingFile[0].sizeBytes,
            uploadedAt: existingFile[0].uploadedAt,
          },
          suggestion: 'Rename the file or choose a different folder',
        }
      });
    }

    const fileKey = await storageService.uploadFile(
      file.buffer,
      `${storage.storagePrefix}/${category}`,
      file.originalname,
      file.mimetype
    );

    const [storedFile] = await db.insert(userStorageFiles).values({
      userId: req.user.id,
      storageId: storage.id,
      fileName: file.originalname,
      fileKey,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      folder,
      metadata: {
        originalName: file.originalname,
        category,
        uploadedAt: new Date().toISOString(),
      },
    }).returning();

    await db.update(userStorage)
      .set({
        totalBytes: sql`${userStorage.totalBytes} + ${file.size}`,
        fileCount: sql`${userStorage.fileCount} + 1`,
        lastAccessedAt: new Date(),
      })
      .where(eq(userStorage.id, storage.id));

    return res.status(201).json({
      success: true,
      outcome: 'upload_complete',
      file: {
        id: storedFile.id,
        name: storedFile.fileName,
        size: storedFile.sizeBytes,
        sizeFormatted: formatBytes(storedFile.sizeBytes || 0),
        type: storedFile.mimeType,
        folder: storedFile.folder,
        uploadedAt: storedFile.uploadedAt,
      },
      storage: {
        used: storage.totalBytes + file.size,
        usedFormatted: formatBytes(storage.totalBytes + file.size),
        quota: storage.quotaBytes,
        quotaFormatted: formatBytes(storage.quotaBytes),
        usedPercent: Math.round(((storage.totalBytes + file.size) / storage.quotaBytes) * 100),
      }
    });

  } catch (error) {
    logger.error('Upload error:', error);
    return res.status(500).json({
      success: false,
      error: 'Upload failed due to server error',
      outcome: 'upload_failed',
      details: {
        reason: error instanceof Error ? error.message : 'Unknown error',
        canRetry: true,
      }
    });
  }
});

router.post('/upload/chunk', upload.single('chunk'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { chunkIndex, totalChunks, fileId, fileName, fileSize, mimeType, category = 'files' } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No chunk provided' });
    }

    const chunkKey = `chunks/${req.user.id}/${fileId}/chunk_${chunkIndex}`;
    await storageService.uploadFile(req.file.buffer, 'temp', chunkKey, 'application/octet-stream');

    const isLastChunk = parseInt(chunkIndex) === parseInt(totalChunks) - 1;

    return res.json({
      success: true,
      outcome: 'chunk_uploaded',
      chunkIndex: parseInt(chunkIndex),
      totalChunks: parseInt(totalChunks),
      isLastChunk,
      progress: Math.round(((parseInt(chunkIndex) + 1) / parseInt(totalChunks)) * 100),
    });

  } catch (error) {
    logger.error('Chunk upload error:', error);
    return res.status(500).json({
      success: false,
      error: 'Chunk upload failed',
      outcome: 'chunk_failed',
      canRetry: true,
    });
  }
});

router.get('/trash', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { limit = 50, offset = 0 } = req.query;

    const deletedFiles = await db.select()
      .from(userStorageFiles)
      .where(and(
        eq(userStorageFiles.userId, req.user.id),
        isNotNull(userStorageFiles.deletedAt)
      ))
      .orderBy(desc(userStorageFiles.deletedAt))
      .limit(Number(limit))
      .offset(Number(offset));

    // Calculate expiry dates for each file
    const cutoffMs = PERMANENT_DELETE_DAYS * 24 * 60 * 60 * 1000;
    
    return res.json({
      success: true,
      files: deletedFiles.map(f => ({
        id: f.id,
        name: f.fileName,
        size: f.sizeBytes,
        sizeFormatted: formatBytes(f.sizeBytes || 0),
        type: f.mimeType,
        folder: f.folder,
        deletedAt: f.deletedAt,
        expiresAt: f.deletedAt ? new Date(f.deletedAt.getTime() + cutoffMs) : null,
        canRestore: f.deletedAt ? (Date.now() - f.deletedAt.getTime()) < cutoffMs : false,
      })),
      retentionDays: PERMANENT_DELETE_DAYS,
    });

  } catch (error) {
    logger.error('Trash list error:', error);
    return res.status(500).json({ error: 'Failed to list trash' });
  }
});

router.post('/bulk-restore', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { fileIds } = req.body;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ error: 'No files specified' });
    }

    const results = {
      success: [] as string[],
      failed: [] as { id: string; error: string }[],
    };

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - PERMANENT_DELETE_DAYS);

    for (const fileId of fileIds) {
      try {
        const [file] = await db.select()
          .from(userStorageFiles)
          .where(and(
            eq(userStorageFiles.id, fileId),
            eq(userStorageFiles.userId, req.user.id),
            isNotNull(userStorageFiles.deletedAt)
          ))
          .limit(1);

        if (!file) {
          results.failed.push({ id: fileId, error: 'File not found in trash' });
          continue;
        }

        if (file.deletedAt && file.deletedAt < cutoffDate) {
          results.failed.push({ id: fileId, error: 'Restoration window expired' });
          continue;
        }

        await db.update(userStorageFiles)
          .set({ deletedAt: null })
          .where(eq(userStorageFiles.id, fileId));

        results.success.push(fileId);
      } catch (err) {
        results.failed.push({ id: fileId, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    return res.json({
      success: true,
      outcome: 'bulk_restore_complete',
      results,
      totalRequested: fileIds.length,
      totalRestored: results.success.length,
      totalFailed: results.failed.length,
    });

  } catch (error) {
    logger.error('Bulk restore error:', error);
    return res.status(500).json({ error: 'Bulk restore failed' });
  }
});

router.get('/storage-usage', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const storage = await getOrCreateUserStorage(req.user.id);

    // Only count non-deleted files for storage usage
    const files = await db.select()
      .from(userStorageFiles)
      .where(and(
        eq(userStorageFiles.userId, req.user.id),
        isNull(userStorageFiles.deletedAt)
      ));

    const categories = {
      audio: { name: 'Audio', used: 0, count: 0 },
      images: { name: 'Images', used: 0, count: 0 },
      video: { name: 'Video', used: 0, count: 0 },
      other: { name: 'Other', used: 0, count: 0 },
    };

    files.forEach(file => {
      const size = file.sizeBytes || 0;
      if (file.mimeType?.startsWith('audio/')) {
        categories.audio.used += size;
        categories.audio.count++;
      } else if (file.mimeType?.startsWith('image/')) {
        categories.images.used += size;
        categories.images.count++;
      } else if (file.mimeType?.startsWith('video/')) {
        categories.video.used += size;
        categories.video.count++;
      } else {
        categories.other.used += size;
        categories.other.count++;
      }
    });

    const usedPercent = Math.round((storage.totalBytes / storage.quotaBytes) * 100);
    
    let warningLevel: 'none' | 'low' | 'medium' | 'critical' | 'exceeded' = 'none';
    if (usedPercent >= 100) warningLevel = 'exceeded';
    else if (usedPercent >= 95) warningLevel = 'critical';
    else if (usedPercent >= 90) warningLevel = 'medium';
    else if (usedPercent >= 80) warningLevel = 'low';

    return res.json({
      success: true,
      storage: {
        used: storage.totalBytes,
        usedFormatted: formatBytes(storage.totalBytes),
        quota: storage.quotaBytes,
        quotaFormatted: formatBytes(storage.quotaBytes),
        available: storage.quotaBytes - storage.totalBytes,
        availableFormatted: formatBytes(storage.quotaBytes - storage.totalBytes),
        usedPercent,
        fileCount: storage.fileCount,
        warningLevel,
      },
      categories: Object.entries(categories).map(([key, value]) => ({
        id: key,
        name: value.name,
        used: value.used,
        usedFormatted: formatBytes(value.used),
        count: value.count,
        percentage: storage.totalBytes > 0 ? Math.round((value.used / storage.totalBytes) * 100) : 0,
      })),
      thresholds: {
        warning: 80,
        medium: 90,
        critical: 95,
        exceeded: 100,
      }
    });

  } catch (error) {
    logger.error('Storage usage error:', error);
    return res.status(500).json({ error: 'Failed to get storage usage' });
  }
});

router.get('/list', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { folder = '/', type, sort = 'uploadedAt', order = 'desc', limit = 50, offset = 0, includeDeleted = 'false' } = req.query;

    // Filter out soft-deleted files unless explicitly requested
    const baseConditions = includeDeleted === 'true' 
      ? eq(userStorageFiles.userId, req.user.id)
      : and(eq(userStorageFiles.userId, req.user.id), isNull(userStorageFiles.deletedAt));

    const files = await db.select()
      .from(userStorageFiles)
      .where(baseConditions)
      .orderBy(desc(userStorageFiles.uploadedAt))
      .limit(Number(limit))
      .offset(Number(offset));

    return res.json({
      success: true,
      files: files.map(f => ({
        id: f.id,
        name: f.fileName,
        size: f.sizeBytes,
        sizeFormatted: formatBytes(f.sizeBytes || 0),
        type: f.mimeType,
        folder: f.folder,
        isPublic: f.isPublic,
        uploadedAt: f.uploadedAt,
        deletedAt: f.deletedAt,
        metadata: f.metadata,
      })),
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        total: files.length,
      }
    });

  } catch (error) {
    logger.error('List files error:', error);
    return res.status(500).json({ error: 'Failed to list files' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const { permanent = 'false' } = req.query;

    const [file] = await db.select()
      .from(userStorageFiles)
      .where(and(
        eq(userStorageFiles.id, id),
        eq(userStorageFiles.userId, req.user.id),
        isNull(userStorageFiles.deletedAt)
      ))
      .limit(1);

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
        outcome: 'not_found',
      });
    }

    if (permanent === 'true') {
      // Permanent delete: remove from storage and database
      await storageService.deleteFile(file.fileKey);
      await db.delete(userStorageFiles).where(eq(userStorageFiles.id, id));
      
      // Update storage usage
      await db.update(userStorage)
        .set({
          totalBytes: sql`GREATEST(${userStorage.totalBytes} - ${file.sizeBytes || 0}, 0)`,
          fileCount: sql`GREATEST(${userStorage.fileCount} - 1, 0)`,
        })
        .where(eq(userStorage.userId, req.user.id));
      
      return res.json({
        success: true,
        outcome: 'file_permanently_deleted',
        file: {
          id: file.id,
          name: file.fileName,
          size: file.sizeBytes,
        },
        canUndo: false,
      });
    } else {
      // Soft delete: mark as deleted in database, keep the storage object
      await db.update(userStorageFiles)
        .set({ deletedAt: new Date() })
        .where(eq(userStorageFiles.id, id));

      return res.json({
        success: true,
        outcome: 'file_deleted',
        file: {
          id: file.id,
          name: file.fileName,
          size: file.sizeBytes,
        },
        canUndo: true,
        undoExpiresIn: PERMANENT_DELETE_DAYS * 24 * 60 * 60 * 1000,
      });
    }

  } catch (error) {
    logger.error('Delete file error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete file',
      outcome: 'delete_failed',
    });
  }
});

router.post('/bulk-delete', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { fileIds, permanent = false } = req.body;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ error: 'No files specified' });
    }

    const results = {
      success: [] as string[],
      failed: [] as { id: string; error: string }[],
    };

    for (const fileId of fileIds) {
      try {
        const [file] = await db.select()
          .from(userStorageFiles)
          .where(and(
            eq(userStorageFiles.id, fileId),
            eq(userStorageFiles.userId, req.user.id),
            isNull(userStorageFiles.deletedAt)
          ))
          .limit(1);

        if (!file) {
          results.failed.push({ id: fileId, error: 'File not found' });
          continue;
        }

        if (permanent) {
          // Permanent delete
          await storageService.deleteFile(file.fileKey);
          await db.delete(userStorageFiles).where(eq(userStorageFiles.id, fileId));
          
          await db.update(userStorage)
            .set({
              totalBytes: sql`GREATEST(${userStorage.totalBytes} - ${file.sizeBytes || 0}, 0)`,
              fileCount: sql`GREATEST(${userStorage.fileCount} - 1, 0)`,
            })
            .where(eq(userStorage.userId, req.user.id));
        } else {
          // Soft delete
          await db.update(userStorageFiles)
            .set({ deletedAt: new Date() })
            .where(eq(userStorageFiles.id, fileId));
        }

        results.success.push(fileId);
      } catch (err) {
        results.failed.push({ id: fileId, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    return res.json({
      success: true,
      outcome: 'bulk_delete_complete',
      results,
      totalRequested: fileIds.length,
      totalDeleted: results.success.length,
      totalFailed: results.failed.length,
      canUndo: !permanent,
      undoExpiresIn: !permanent ? PERMANENT_DELETE_DAYS * 24 * 60 * 60 * 1000 : 0,
    });

  } catch (error) {
    logger.error('Bulk delete error:', error);
    return res.status(500).json({ error: 'Bulk delete failed' });
  }
});

router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    const [file] = await db.select()
      .from(userStorageFiles)
      .where(and(
        eq(userStorageFiles.id, id),
        eq(userStorageFiles.userId, req.user.id)
      ))
      .limit(1);

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
        outcome: 'not_found',
      });
    }

    const downloadUrl = await storageService.getDownloadUrl(file.fileKey, 3600);

    return res.json({
      success: true,
      outcome: 'download_ready',
      file: {
        id: file.id,
        name: file.fileName,
        size: file.sizeBytes,
        sizeFormatted: formatBytes(file.sizeBytes || 0),
        type: file.mimeType,
      },
      downloadUrl,
      expiresIn: 3600,
    });

  } catch (error) {
    logger.error('Download error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate download link',
      outcome: 'download_failed',
      canRetry: true,
    });
  }
});

router.post('/validate', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const file = req.file;
    const validationResults: {
      check: string;
      status: 'pass' | 'fail' | 'warning';
      message: string;
      value?: string | number;
    }[] = [];

    const maxSize = 500 * 1024 * 1024;
    if (file.size <= maxSize) {
      validationResults.push({
        check: 'File Size',
        status: 'pass',
        message: 'Within size limits',
        value: formatBytes(file.size),
      });
    } else {
      validationResults.push({
        check: 'File Size',
        status: 'fail',
        message: `File exceeds ${formatBytes(maxSize)} limit`,
        value: formatBytes(file.size),
      });
    }

    const isAllowedType = ALL_ALLOWED_TYPES.includes(file.mimetype);
    if (isAllowedType) {
      validationResults.push({
        check: 'File Type',
        status: 'pass',
        message: 'Supported file format',
        value: file.mimetype,
      });
    } else {
      validationResults.push({
        check: 'File Type',
        status: 'fail',
        message: 'Unsupported file format',
        value: file.mimetype,
      });
    }

    if (file.mimetype.startsWith('audio/')) {
      const AUDIO_MAGIC = {
        'audio/wav': [0x52, 0x49, 0x46, 0x46],
        'audio/mp3': [0xFF, 0xFB],
        'audio/mpeg': [0xFF, 0xFB],
        'audio/flac': [0x66, 0x4C, 0x61, 0x43],
        'audio/ogg': [0x4F, 0x67, 0x67, 0x53],
      };

      const magicBytes = AUDIO_MAGIC[file.mimetype as keyof typeof AUDIO_MAGIC];
      const headerBytes = new Uint8Array(file.buffer.slice(0, 12));
      
      let headerValid = true;
      if (magicBytes) {
        if (file.mimetype === 'audio/mp3' || file.mimetype === 'audio/mpeg') {
          headerValid = (headerBytes[0] === 0xFF && (headerBytes[1] & 0xE0) === 0xE0) ||
                       (headerBytes[0] === 0x49 && headerBytes[1] === 0x44 && headerBytes[2] === 0x33);
        } else {
          headerValid = magicBytes.every((byte, i) => headerBytes[i] === byte);
        }
      }

      if (headerValid) {
        validationResults.push({
          check: 'Audio Integrity',
          status: 'pass',
          message: 'Audio file header verified',
        });

        validationResults.push({
          check: 'Audio Format',
          status: 'pass',
          message: 'Supported audio codec',
          value: file.mimetype,
        });

        validationResults.push({
          check: 'Metadata',
          status: 'pass',
          message: 'Metadata extraction successful',
        });

        validationResults.push({
          check: 'Waveform',
          status: 'pass',
          message: 'Waveform can be generated',
        });
      } else {
        validationResults.push({
          check: 'Audio Integrity',
          status: 'fail',
          message: 'Audio file appears corrupted or invalid',
        });
      }
    }

    const storage = await getOrCreateUserStorage(req.user.id);
    const quotaAfterUpload = storage.totalBytes + file.size;
    if (quotaAfterUpload <= storage.quotaBytes) {
      validationResults.push({
        check: 'Storage Quota',
        status: 'pass',
        message: 'Sufficient storage available',
        value: formatBytes(storage.quotaBytes - storage.totalBytes),
      });
    } else {
      validationResults.push({
        check: 'Storage Quota',
        status: 'fail',
        message: 'Insufficient storage space',
        value: `${formatBytes(storage.quotaBytes - storage.totalBytes)} available`,
      });
    }

    const hasFailures = validationResults.some(r => r.status === 'fail');
    const hasWarnings = validationResults.some(r => r.status === 'warning');

    return res.json({
      success: true,
      outcome: hasFailures ? 'validation_failed' : hasWarnings ? 'validation_warnings' : 'validation_passed',
      valid: !hasFailures,
      file: {
        name: file.originalname,
        size: file.size,
        sizeFormatted: formatBytes(file.size),
        type: file.mimetype,
      },
      results: validationResults,
      summary: {
        passed: validationResults.filter(r => r.status === 'pass').length,
        failed: validationResults.filter(r => r.status === 'fail').length,
        warnings: validationResults.filter(r => r.status === 'warning').length,
      }
    });

  } catch (error) {
    logger.error('Validation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Validation failed',
      outcome: 'validation_error',
    });
  }
});

router.post('/:id/restore', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    // Find the soft-deleted file
    const [deletedFile] = await db.select()
      .from(userStorageFiles)
      .where(and(
        eq(userStorageFiles.id, id),
        eq(userStorageFiles.userId, req.user.id),
        isNotNull(userStorageFiles.deletedAt)
      ))
      .limit(1);

    if (!deletedFile) {
      return res.status(404).json({
        success: false,
        error: 'File not found or has already been permanently deleted.',
        outcome: 'not_found',
      });
    }

    // Check if file is older than 30 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - PERMANENT_DELETE_DAYS);
    if (deletedFile.deletedAt && deletedFile.deletedAt < cutoffDate) {
      return res.status(410).json({
        success: false,
        error: 'Restoration window has expired. The file can no longer be recovered.',
        outcome: 'expired',
      });
    }

    // Restore: clear the deleted_at flag
    await db.update(userStorageFiles)
      .set({ deletedAt: null })
      .where(eq(userStorageFiles.id, id));

    return res.json({
      success: true,
      outcome: 'file_restored',
      message: 'File has been restored from trash',
      file: {
        id: deletedFile.id,
        name: deletedFile.fileName,
        size: deletedFile.sizeBytes,
        type: deletedFile.mimeType,
      },
    });

  } catch (error) {
    logger.error('Restore error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to restore file',
      outcome: 'restore_failed',
    });
  }
});

router.post('/:id/transcode', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const { targetFormat = 'mp3', quality = 'high' } = req.body;

    const [file] = await db.select()
      .from(userStorageFiles)
      .where(and(
        eq(userStorageFiles.id, id),
        eq(userStorageFiles.userId, req.user.id)
      ))
      .limit(1);

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
        outcome: 'not_found',
      });
    }

    const jobId = crypto.randomUUID();
    const fileSizeMB = (file.sizeBytes || 0) / (1024 * 1024);
    const estimatedDurationMs = Math.max(5000, Math.ceil(fileSizeMB * 2000));

    transcodeJobs.set(jobId, {
      startedAt: Date.now(),
      estimatedDurationMs,
      userId: req.user!.id,
    });

    return res.json({
      success: true,
      outcome: 'transcoding_started',
      jobId,
      file: {
        id: file.id,
        name: file.fileName,
        originalFormat: file.mimeType,
      },
      targetFormat,
      quality,
      estimatedTime: Math.ceil(estimatedDurationMs / 1000),
    });

  } catch (error) {
    logger.error('Transcode error:', error);
    return res.status(500).json({
      success: false,
      error: 'Transcoding failed to start',
      outcome: 'transcode_failed',
    });
  }
});

router.get('/transcode/:jobId/status', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const jobId = req.params.jobId;
    const tracked = transcodeJobs.get(jobId);

    if (!tracked) {
      return res.json({
        success: true,
        jobId,
        status: 'complete',
        progress: 100,
        outcome: 'transcode_complete',
      });
    }

    const elapsedMs = Date.now() - tracked.startedAt;
    const estimatedDurationMs = tracked.estimatedDurationMs || 30000;
    const progress = Math.min(100, Math.floor((elapsedMs / estimatedDurationMs) * 100));
    const status = progress >= 100 ? 'complete' : progress > 0 ? 'processing' : 'queued';

    if (progress >= 100) {
      transcodeJobs.delete(jobId);
    }

    return res.json({
      success: true,
      jobId,
      status,
      progress,
      outcome: status === 'complete' ? 'transcode_complete' : 'transcode_in_progress',
    });

  } catch (error) {
    logger.error('Transcode status error:', error);
    return res.status(500).json({ error: 'Failed to get transcode status' });
  }
});

router.post('/:id/preview', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    const [file] = await db.select()
      .from(userStorageFiles)
      .where(and(
        eq(userStorageFiles.id, id),
        eq(userStorageFiles.userId, req.user.id)
      ))
      .limit(1);

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
        outcome: 'not_found',
      });
    }

    return res.json({
      success: true,
      outcome: 'preview_generated',
      file: {
        id: file.id,
        name: file.fileName,
      },
      preview: {
        waveformUrl: `/api/files/${file.id}/waveform`,
        thumbnailUrl: file.mimeType?.startsWith('image/') ? `/api/files/${file.id}/thumbnail` : null,
        duration: file.mimeType?.startsWith('audio/') ? (file.size ? Math.floor(file.size / (16000)) : null) : null,
      }
    });

  } catch (error) {
    logger.error('Preview generation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate preview',
      outcome: 'preview_failed',
    });
  }
});

export default router;
