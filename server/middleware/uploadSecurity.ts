import { Request, Response, NextFunction } from 'express';
import path from 'path';
import { logger } from '../logger.js';

export type UploadCategory = 'avatar' | 'artwork' | 'audio' | 'document';

export interface UploadLimits {
  maxSize: number;
  allowedTypes: string[];
  maxDimensions?: { width: number; height: number };
}

export const UPLOAD_LIMITS: Record<UploadCategory, UploadLimits> = {
  avatar: {
    maxSize: 5 * 1024 * 1024,
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxDimensions: { width: 1024, height: 1024 },
  },
  artwork: {
    maxSize: 10 * 1024 * 1024,
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxDimensions: { width: 3000, height: 3000 },
  },
  audio: {
    maxSize: 100 * 1024 * 1024,
    allowedTypes: [
      'audio/mpeg',
      'audio/wav', 'audio/x-wav', 'audio/wave',
      'audio/flac', 'audio/x-flac',
      'audio/aac', 'audio/x-aac', 'audio/aacp',
      'audio/ogg', 'audio/vorbis',
      'audio/mp4', 'audio/x-m4a', 'audio/m4a',
      'audio/aiff', 'audio/x-aiff',
      'audio/webm',
    ],
  },
  document: {
    maxSize: 20 * 1024 * 1024,
    allowedTypes: ['application/pdf'],
  },
};

const MAGIC_BYTES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
  'audio/mpeg': [0x49, 0x44, 0x33],
  'audio/wav': [0x52, 0x49, 0x46, 0x46],
  'audio/wave': [0x52, 0x49, 0x46, 0x46],
  'audio/x-wav': [0x52, 0x49, 0x46, 0x46],
  'audio/flac': [0x66, 0x4c, 0x61, 0x43],
  'audio/x-flac': [0x66, 0x4c, 0x61, 0x43],
  'audio/ogg': [0x4f, 0x67, 0x67, 0x53],
  'audio/vorbis': [0x4f, 0x67, 0x67, 0x53],
  'audio/aiff': [0x46, 0x4f, 0x52, 0x4d],
  'audio/x-aiff': [0x46, 0x4f, 0x52, 0x4d],
  'audio/mp4': [0x00, 0x00, 0x00],
  'audio/x-m4a': [0x00, 0x00, 0x00],
  'audio/m4a': [0x00, 0x00, 0x00],
  'audio/webm': [0x1a, 0x45, 0xdf, 0xa3],
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
};

const MPEG_FRAME_SYNC = [0xff, 0xfb];

const EXTENSION_TO_MIME: Record<string, string[]> = {
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
  '.mp3': ['audio/mpeg'],
  '.wav': ['audio/wav', 'audio/wave', 'audio/x-wav'],
  '.flac': ['audio/flac', 'audio/x-flac'],
  '.aac': ['audio/aac', 'audio/x-aac', 'audio/aacp'],
  '.ogg': ['audio/ogg', 'audio/vorbis'],
  '.m4a': ['audio/mp4', 'audio/x-m4a', 'audio/m4a'],
  '.aiff': ['audio/aiff', 'audio/x-aiff'],
  '.aif': ['audio/aiff', 'audio/x-aiff'],
  '.webm': ['audio/webm'],
  '.pdf': ['application/pdf'],
};

const BLOCKED_EXTENSIONS = ['.svg', '.html', '.htm', '.js', '.php', '.exe', '.sh', '.bat', '.cmd'];

export interface UploadValidationResult {
  valid: boolean;
  error?: string;
  sanitizedFilename?: string;
  detectedMime?: string;
}

export function sanitizeFilename(filename: string): string {
  const basename = path.basename(filename);
  const ext = path.extname(basename).toLowerCase();
  const name = path.basename(basename, ext);
  const sanitizedName = name
    .replace(/\.\./g, '')
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/[^\w\s.-]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+/, '')
    .replace(/[._-]+$/, '')
    .substring(0, 200);

  const safeName = sanitizedName || `file_${Date.now()}`;
  return `${safeName}${ext}`;
}

export function verifyMagicBytes(buffer: Buffer, expectedMimeType: string): boolean {
  if (!buffer || buffer.length < 4) {
    return false;
  }

  const magicBytes = MAGIC_BYTES[expectedMimeType];
  if (!magicBytes) {
    if (expectedMimeType === 'audio/mpeg') {
      if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
        return true;
      }
      if ((buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
        return true;
      }
      return false;
    }
    logger.warn(`No magic bytes defined for MIME type: ${expectedMimeType}`);
    return true;
  }

  if (expectedMimeType.startsWith('audio/wav') || expectedMimeType === 'audio/x-wav' || expectedMimeType === 'audio/wave') {
    if (buffer.length >= 12) {
      const isRiff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
      const isWave = buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45;
      return isRiff && isWave;
    }
    return false;
  }

  if (expectedMimeType === 'image/webp') {
    if (buffer.length >= 12) {
      const isRiff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
      const isWebp = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
      return isRiff && isWebp;
    }
    return false;
  }

  for (let i = 0; i < magicBytes.length; i++) {
    if (buffer[i] !== magicBytes[i]) {
      return false;
    }
  }

  return true;
}

export function validateExtension(filename: string, allowedMimeTypes: string[]): boolean {
  const ext = path.extname(filename).toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return false;
  }
  const mimeTypesForExt = EXTENSION_TO_MIME[ext];
  if (!mimeTypesForExt) {
    return false;
  }
  return mimeTypesForExt.some(mime => allowedMimeTypes.includes(mime));
}

export function validateMimeType(mimeType: string, allowedMimeTypes: string[]): boolean {
  return allowedMimeTypes.includes(mimeType);
}

export function validateFileSize(size: number, maxSize: number): boolean {
  return size > 0 && size <= maxSize;
}

export function isSvgBlocked(mimeType: string, filename: string, category: UploadCategory): boolean {
  if (category === 'avatar' || category === 'artwork') {
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.svg' || mimeType === 'image/svg+xml') {
      return true;
    }
  }
  return false;
}

export function validateUpload(
  file: Express.Multer.File,
  category: UploadCategory
): UploadValidationResult {
  const limits = UPLOAD_LIMITS[category];
  if (!limits) {
    return { valid: false, error: `Unknown upload category: ${category}` };
  }

  const sanitizedFilename = sanitizeFilename(file.originalname);

  if (isSvgBlocked(file.mimetype, file.originalname, category)) {
    logger.warn(`Blocked SVG upload attempt for ${category}`, { filename: file.originalname });
    return { valid: false, error: 'SVG files are not allowed for security reasons' };
  }

  if (!validateExtension(file.originalname, limits.allowedTypes)) {
    return {
      valid: false,
      error: `Invalid file extension. Allowed types: ${limits.allowedTypes.join(', ')}`,
    };
  }

  if (!validateMimeType(file.mimetype, limits.allowedTypes)) {
    return {
      valid: false,
      error: `Invalid MIME type: ${file.mimetype}. Allowed: ${limits.allowedTypes.join(', ')}`,
    };
  }

  if (!validateFileSize(file.size, limits.maxSize)) {
    const maxSizeMB = (limits.maxSize / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File too large. Maximum size: ${maxSizeMB}MB`,
    };
  }

  if (file.buffer && file.buffer.length > 0) {
    if (!verifyMagicBytes(file.buffer, file.mimetype)) {
      logger.warn('Magic bytes verification failed', {
        filename: file.originalname,
        mimetype: file.mimetype,
        bufferStart: file.buffer.slice(0, 16).toString('hex'),
      });
      return {
        valid: false,
        error: 'File content does not match declared type (magic bytes mismatch)',
      };
    }
  }

  return {
    valid: true,
    sanitizedFilename,
    detectedMime: file.mimetype,
  };
}

export function createUploadValidator(category: UploadCategory) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.file && !req.files) {
      return next();
    }

    const files = req.file ? [req.file] : (req.files as Express.Multer.File[]) || [];
    
    for (const file of files) {
      const result = validateUpload(file, category);
      if (!result.valid) {
        logger.warn('Upload validation failed', {
          category,
          filename: file.originalname,
          error: result.error,
          userId: (req as any).user?.id,
        });
        return res.status(400).json({
          success: false,
          error: result.error,
          code: 'UPLOAD_VALIDATION_FAILED',
        });
      }
      (file as any).sanitizedFilename = result.sanitizedFilename;
    }

    next();
  };
}

export function getUploadLimits(category: UploadCategory): UploadLimits {
  return UPLOAD_LIMITS[category];
}

export async function validateFileBuffer(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  category: UploadCategory
): Promise<UploadValidationResult> {
  const limits = UPLOAD_LIMITS[category];
  if (!limits) {
    return { valid: false, error: `Unknown upload category: ${category}` };
  }

  const sanitizedFilename = sanitizeFilename(filename);

  if (isSvgBlocked(mimeType, filename, category)) {
    return { valid: false, error: 'SVG files are not allowed for security reasons' };
  }

  if (!validateExtension(filename, limits.allowedTypes)) {
    return {
      valid: false,
      error: `Invalid file extension. Allowed types: ${limits.allowedTypes.join(', ')}`,
    };
  }

  if (!validateMimeType(mimeType, limits.allowedTypes)) {
    return {
      valid: false,
      error: `Invalid MIME type: ${mimeType}. Allowed: ${limits.allowedTypes.join(', ')}`,
    };
  }

  if (!validateFileSize(buffer.length, limits.maxSize)) {
    const maxSizeMB = (limits.maxSize / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File too large. Maximum size: ${maxSizeMB}MB`,
    };
  }

  if (!verifyMagicBytes(buffer, mimeType)) {
    logger.warn('Magic bytes verification failed', {
      filename,
      mimetype: mimeType,
      bufferStart: buffer.slice(0, 16).toString('hex'),
    });
    return {
      valid: false,
      error: 'File content does not match declared type (magic bytes mismatch)',
    };
  }

  return {
    valid: true,
    sanitizedFilename,
    detectedMime: mimeType,
  };
}
