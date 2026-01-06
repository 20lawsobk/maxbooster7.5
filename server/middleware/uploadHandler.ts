import multer from 'multer';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { storageService } from '../services/storageService.js';
import { logger } from '../logger.js';
import {
  validateUpload,
  sanitizeFilename,
  verifyMagicBytes,
  UPLOAD_LIMITS,
  type UploadCategory,
  validateFileBuffer,
  createUploadValidator,
} from './uploadSecurity.js';
import {
  processImage,
  processAvatarImage,
  processArtworkImage,
  isImageMimeType,
  type ProcessedImage,
} from '../services/imageProcessor.js';

const memoryStorage = multer.memoryStorage();

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    'audio/mpeg',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/flac',
    'audio/x-flac',
    'audio/ogg',
    'audio/aac',
    'audio/webm',
    'audio/mp4',
    'audio/x-m4a',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ];

  const allowedExts = ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.webm', '.mp4', '.m4a', '.jpg', '.jpeg', '.png', '.webp', '.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === '.svg') {
    cb(new Error('SVG files are not allowed for security reasons'));
    return;
  }

  if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${allowedExts.join(', ')}`));
  }
};

export const upload = multer({
  storage: memoryStorage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB to match UI
    files: 10,
  },
});

export const avatarUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: UPLOAD_LIMITS.avatar.maxSize,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.svg') {
      cb(new Error('SVG files are not allowed for avatars'));
      return;
    }
    if (UPLOAD_LIMITS.avatar.allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid avatar file type. Allowed: ${UPLOAD_LIMITS.avatar.allowedTypes.join(', ')}`));
    }
  },
});

export const artworkUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: UPLOAD_LIMITS.artwork.maxSize,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.svg') {
      cb(new Error('SVG files are not allowed for artwork'));
      return;
    }
    if (UPLOAD_LIMITS.artwork.allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid artwork file type. Allowed: ${UPLOAD_LIMITS.artwork.allowedTypes.join(', ')}`));
    }
  },
});

export const audioUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: UPLOAD_LIMITS.audio.maxSize,
    files: 10,
  },
  fileFilter: (req, file, cb) => {
    if (UPLOAD_LIMITS.audio.allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid audio file type. Allowed: ${UPLOAD_LIMITS.audio.allowedTypes.join(', ')}`));
    }
  },
});

export const documentUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: UPLOAD_LIMITS.document.maxSize,
    files: 5,
  },
  fileFilter: (req, file, cb) => {
    if (UPLOAD_LIMITS.document.allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid document file type. Allowed: ${UPLOAD_LIMITS.document.allowedTypes.join(', ')}`));
    }
  },
});

export { createUploadValidator };

// Error handler middleware for multer
export const handleUploadError = (error: unknown, req: Request, res: unknown, next: unknown) => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(413).json({
          message: 'File too large. Maximum size is 100MB.',
          code: 'FILE_TOO_LARGE',
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(413).json({
          message: 'Too many files. Maximum is 10 files per request.',
          code: 'TOO_MANY_FILES',
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          message: 'Unexpected field name for file upload.',
          code: 'UNEXPECTED_FIELD',
        });
      default:
        return res.status(400).json({
          message: error.message,
          code: 'UPLOAD_ERROR',
        });
    }
  } else if (error) {
    return res.status(400).json({
      message: error.message || 'Upload failed',
      code: 'UPLOAD_ERROR',
    });
  }
  next();
};

export async function storeUploadedFile(
  file: Express.Multer.File,
  userId: string,
  category: UploadCategory | string = 'uploads'
): Promise<{ key: string; url: string; processed?: boolean }> {
  try {
    if (!file.buffer) {
      throw new Error('File buffer is missing');
    }

    const uploadCategory = (category === 'uploads' ? 'audio' : category) as UploadCategory;
    
    if (['avatar', 'artwork', 'audio', 'document'].includes(uploadCategory)) {
      const validation = await validateFileBuffer(
        file.buffer,
        file.originalname,
        file.mimetype,
        uploadCategory
      );

      if (!validation.valid) {
        logger.warn('Upload security validation failed', {
          filename: file.originalname,
          category: uploadCategory,
          error: validation.error,
          userId,
        });
        throw new Error(validation.error || 'File validation failed');
      }
    }

    if (!verifyMagicBytes(file.buffer, file.mimetype)) {
      logger.warn('Magic bytes verification failed during storage', {
        filename: file.originalname,
        mimetype: file.mimetype,
        userId,
      });
      throw new Error('File content does not match declared type');
    }

    let processedBuffer = file.buffer;
    let finalMimetype = file.mimetype;
    let wasProcessed = false;

    if (isImageMimeType(file.mimetype)) {
      try {
        let processed: ProcessedImage;
        
        if (uploadCategory === 'avatar') {
          processed = await processAvatarImage(file.buffer);
        } else if (uploadCategory === 'artwork') {
          processed = await processArtworkImage(file.buffer);
        } else {
          processed = await processImage(file.buffer, uploadCategory);
        }

        processedBuffer = processed.buffer;
        finalMimetype = processed.mimeType;
        wasProcessed = true;

        logger.info('Image processed for upload', {
          originalSize: file.buffer.length,
          processedSize: processed.processedSize,
          format: processed.format,
          dimensions: `${processed.width}x${processed.height}`,
          metadataStripped: processed.metadataStripped,
          userId,
          category: uploadCategory,
        });
      } catch (processingError) {
        logger.error('Image processing failed, using original', {
          error: processingError,
          filename: file.originalname,
          userId,
        });
      }
    }

    const timestamp = Date.now();
    const safeFilename = sanitizeFilename(file.originalname);
    const ext = wasProcessed ? getExtensionForMimetype(finalMimetype) : path.extname(safeFilename).toLowerCase();
    const name = path.basename(safeFilename, path.extname(safeFilename));
    const filename = `${timestamp}_${name}${ext}`;

    const key = await storageService.uploadFile(
      processedBuffer,
      `${category}/${userId}`,
      filename,
      finalMimetype
    );

    const url = await storageService.getDownloadUrl(key);

    return { key, url, processed: wasProcessed };
  } catch (error: unknown) {
    logger.error('Error storing uploaded file:', error);
    throw error instanceof Error ? error : new Error('Failed to store uploaded file');
  }
}

function getExtensionForMimetype(mimetype: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/flac': '.flac',
    'application/pdf': '.pdf',
  };
  return mimeToExt[mimetype] || '';
}

export async function storeSecureUpload(
  file: Express.Multer.File,
  userId: string,
  category: UploadCategory
): Promise<{ key: string; url: string; processed: boolean; metadata: any }> {
  const validation = await validateFileBuffer(
    file.buffer,
    file.originalname,
    file.mimetype,
    category
  );

  if (!validation.valid) {
    throw new Error(validation.error || 'File validation failed');
  }

  let processedBuffer = file.buffer;
  let finalMimetype = file.mimetype;
  let processedMetadata = {};

  if (isImageMimeType(file.mimetype)) {
    const processed = await processImage(file.buffer, category);
    processedBuffer = processed.buffer;
    finalMimetype = processed.mimeType;
    processedMetadata = {
      originalSize: processed.originalSize,
      processedSize: processed.processedSize,
      dimensions: { width: processed.width, height: processed.height },
      format: processed.format,
      metadataStripped: processed.metadataStripped,
    };
  }

  const timestamp = Date.now();
  const safeFilename = sanitizeFilename(file.originalname);
  const ext = getExtensionForMimetype(finalMimetype) || path.extname(safeFilename).toLowerCase();
  const name = path.basename(safeFilename, path.extname(safeFilename));
  const filename = `${timestamp}_${name}${ext}`;

  const key = await storageService.uploadFile(
    processedBuffer,
    `${category}/${userId}`,
    filename,
    finalMimetype
  );

  const url = await storageService.getDownloadUrl(key);

  return {
    key,
    url,
    processed: isImageMimeType(file.mimetype),
    metadata: processedMetadata,
  };
}

export async function generateUploadUrl(
  userId: string,
  filename: string,
  contentType: string,
  category: UploadCategory | string = 'uploads'
): Promise<{ uploadUrl: string | null; key: string }> {
  try {
    const uploadCategory = (category === 'uploads' ? 'audio' : category) as UploadCategory;
    const limits = UPLOAD_LIMITS[uploadCategory];
    
    if (limits && !limits.allowedTypes.includes(contentType)) {
      throw new Error(`Content type ${contentType} not allowed for ${category}`);
    }

    const ext = path.extname(filename).toLowerCase();
    if (ext === '.svg') {
      throw new Error('SVG files are not allowed for security reasons');
    }

    const timestamp = Date.now();
    const safeFilename = sanitizeFilename(filename);
    const name = path.basename(safeFilename, path.extname(safeFilename));
    const sanitizedFilename = `${timestamp}_${name}${ext}`;

    const { url, key } = await storageService.getUploadUrl(
      `${category}/${userId}`,
      sanitizedFilename,
      contentType,
      3600
    );

    return { uploadUrl: url, key };
  } catch (error: unknown) {
    logger.error('Error generating upload URL:', error);
    throw error instanceof Error ? error : new Error('Failed to generate upload URL');
  }
}

export {
  validateUpload,
  sanitizeFilename as sanitizeUploadFilename,
  verifyMagicBytes,
  validateFileBuffer,
  UPLOAD_LIMITS,
  type UploadCategory,
} from './uploadSecurity.js';

export {
  processImage,
  processAvatarImage,
  processArtworkImage,
  isImageMimeType,
  validateImageFormat,
  stripImageMetadata,
  convertToSafeFormat,
  type ProcessedImage,
  type ImageProcessingOptions,
} from '../services/imageProcessor.js';
