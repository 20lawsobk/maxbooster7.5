import multer from "multer";
import path from "path";
import { existsSync, mkdirSync } from "fs";
import { randomBytes } from "crypto";
import { Request } from "express";
import { storageService } from "../services/storageService.js";
import { logger } from "../logger.js";
import { sanitizeFilename, verifyMagicBytes, UPLOAD_LIMITS, type UploadCategory, validateFileBuffer, createUploadValidator } from "./uploadSecurity.js";
import {
  processImage,
  processAvatarImage,
  processArtworkImage,
  isImageMimeType,
  type ProcessedImage,
} from "../services/imageProcessor.js";

const memoryStorage = multer?.memoryStorage();

// ── General-purpose disk storage (replaces memoryStorage for the large `upload`
// instance — prevents OOM crashes on files up to 500 MB) ──────────────────────
const GENERAL_UPLOAD_DIR = path?.join(process.cwd(), "uploads", "general_temp");
if (!existsSync(GENERAL_UPLOAD_DIR))
  mkdirSync(GENERAL_UPLOAD_DIR, { recursive: true });

const generalDiskStorage = multer?.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, GENERAL_UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path?.extname(file?.originalname).toLowerCase() || ".bin";
    cb(null, `upload_${randomBytes(8).toString("hex")}${ext}`);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedMimes = [
    "audio/mpeg",
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/flac",
    "audio/x-flac",
    "audio/ogg",
    "audio/vorbis",
    "audio/opus",
    "audio/x-opus",
    "audio/aac",
    "audio/x-aac",
    "audio/aacp",
    "audio/webm",
    "audio/mp4",
    "audio/x-m4a",
    "audio/m4a",
    "audio/x-alac",
    "audio/alac",
    "audio/aiff",
    "audio/x-aiff",
    "audio/x-caf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ];

  const allowedExts = [
    ".mp3",
    ".wav",
    ".ogg",
    ".opus",
    ".aac",
    ".flac",
    ".webm",
    ".mp4",
    ".m4a",
    ".aiff",
    ".aif",
    ".caf",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".pdf",
  ];
  const ext = path?.extname(file?.originalname).toLowerCase();

  if (ext === ".svg") {
    cb(new Error("SVG files are not allowed for security reasons"));
    return;
  }

  if (allowedMimes?.includes(file?.mimetype) && allowedExts?.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(`Invalid file type. Allowed types: ${allowedExts?.join(", ")}`),
    );
  }
};

export const upload = multer({
  storage: generalDiskStorage, // disk — avoids OOM on files up to 500 MB
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
  fileFilter: (_req, file, cb) => {
    const ext = path?.extname(file?.originalname).toLowerCase();
    if (ext === ".svg") {
      cb(new Error("SVG files are not allowed for avatars"));
      return;
    }
    if (UPLOAD_LIMITS?.avatar.allowedTypes?.includes(file?.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Invalid avatar file type. Allowed: ${UPLOAD_LIMITS?.avatar.allowedTypes?.join(", ")}`,
        ),
      );
    }
  },
});

export const artworkUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: UPLOAD_LIMITS.artwork.maxSize,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path?.extname(file?.originalname).toLowerCase();
    if (ext === ".svg") {
      cb(new Error("SVG files are not allowed for artwork"));
      return;
    }
    if (UPLOAD_LIMITS?.artwork.allowedTypes?.includes(file?.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Invalid artwork file type. Allowed: ${UPLOAD_LIMITS?.artwork.allowedTypes?.join(", ")}`,
        ),
      );
    }
  },
});

export const audioUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: UPLOAD_LIMITS.audio.maxSize,
    files: 10,
  },
  fileFilter: (_req, file, cb) => {
    if (UPLOAD_LIMITS?.audio.allowedTypes?.includes(file?.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Invalid audio file type. Allowed: ${UPLOAD_LIMITS?.audio.allowedTypes?.join(", ")}`,
        ),
      );
    }
  },
});

// ── Disk-based upload for music video / voice synthesis (needs file paths for FFmpeg) ──
const MEDIA_UPLOAD_DIR = path?.join(process.cwd(), "uploads", "media_temp");
if (!existsSync(MEDIA_UPLOAD_DIR))
  mkdirSync(MEDIA_UPLOAD_DIR, { recursive: true });

const mediaDiskStorage = multer?.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, MEDIA_UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path?.extname(file?.originalname).toLowerCase() || ".bin";
    cb(null, `media_${randomBytes(8).toString("hex")}${ext}`);
  },
});

const MEDIA_ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/ogg",
  "audio/opus",
  "audio/x-opus",
  "audio/aac",
  "audio/x-aac",
  "audio/flac",
  "audio/x-flac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/webm",
  "audio/aiff",
  "audio/x-aiff",
];

export const mediaUpload = multer({
  storage: mediaDiskStorage,
  limits: { fileSize: 300 * 1024 * 1024, files: 15 },
  fileFilter: (_req, file, cb) => {
    if (MEDIA_ALLOWED_MIMES?.includes(file?.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Unsupported media type: ${file?.mimetype}. Allowed: images (JPEG/PNG/WebP) and audio (MP3/WAV/AAC/FLAC)`,
        ),
      );
    }
  },
});

/**
 * Factory that builds a hardened multer instance with the same safety floor as
 * the canonical exports above:
 *   - memoryStorage (no temp files)
 *   - SVG always rejected (XSS / SSRF risk)
 *   - extension + MIME cross-check when allowedMimes is provided
 *   - sanitized error messages
 *
 * Use this in route files instead of calling `multer({...})` directly so every
 * upload path on the platform shares one security profile.
 */
export interface HardenedUploadOptions {
  /** Maximum size per file, in bytes. */
  maxFileSize: number;
  /** Maximum number of files in a single request. Defaults to 1. */
  maxFiles?: number;
  /** If provided, only these MIME types are accepted. */
  allowedMimes?: readonly string[];
  /** If provided, only these extensions (lowercased, with leading dot) are accepted. */
  allowedExtensions?: readonly string[];
  /**
   * Optional per-field allowlist mapping multer field name -> allowed MIME types.
   * Useful for endpoints that accept (e?.g.) audio in one field and image in another.
   */
  perFieldMimes?: Record<string, readonly string[]>;
  /** Human-readable label used in error messages, e?.g. "audio", "artwork". */
  label?: string;
}

/**
 * Canonical MIME → allowed extensions map used for the pairwise cross-check
 * inside `createHardenedUpload`. If a MIME type is not present here it is
 * considered "extension-agnostic" (accepted with any extension that also
 * appears in the route's `allowedExtensions`, if any).
 */
const MIME_EXT_MAP: Record<string, readonly string[]> = {
  // Images
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  // Audio
  "audio/mpeg": [".mp3"],
  "audio/mp3": [".mp3"],
  "audio/wav": [".wav"],
  "audio/x-wav": [".wav"],
  "audio/wave": [".wav"],
  "audio/flac": [".flac"],
  "audio/x-flac": [".flac"],
  "audio/aiff": [".aiff", ".aif"],
  "audio/x-aiff": [".aiff", ".aif"],
  "audio/ogg": [".ogg", ".oga"],
  "audio/opus": [".opus"],
  "audio/x-opus": [".opus"],
  "audio/aac": [".aac"],
  "audio/x-aac": [".aac"],
  "audio/mp4": [".m4a", ".mp4"],
  "audio/x-m4a": [".m4a"],
  "audio/m4a": [".m4a"],
  "audio/webm": [".webm"],
  // Documents
  "application/pdf": [".pdf"],
  "text/csv": [".csv"],
  "application/csv": [".csv"],
  "text/tab-separated-values": [".tsv"],
  "application/json": [".json"],
  "application/xml": [".xml"],
  "text/xml": [".xml"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "application/zip": [".zip"],
  "application/x-zip-compressed": [".zip"],
  "application/octet-stream": [], // intentionally empty — too generic to trust
};

export function createHardenedUpload(options: HardenedUploadOptions) {
  const {
    maxFileSize,
    maxFiles = 1,
    allowedMimes,
    allowedExtensions,
    perFieldMimes,
    label = "file",
  } = options;

  /** Pairwise MIME ↔ extension consistency check. */
  const mimeMatchesExt = (mime: string, ext: string): boolean => {
    const expected = MIME_EXT_MAP[mime];
    if (!expected) return true; // unknown MIME: defer to allowedExtensions list
    if (expected?.length === 0) return false; // explicitly untrustworthy MIME
    return expected?.includes(ext);
  };

  const fileFilter = (
    _req: Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback,
  ) => {
    const ext = path?.extname(file?.originalname || "").toLowerCase();

    if (ext === ".svg" || file?.mimetype === "image/svg+xml") {
      cb(new Error(`SVG files are not allowed (${label})`));
      return;
    }

    if (allowedExtensions && !allowedExtensions?.includes(ext)) {
      cb(
        new Error(
          `Invalid ${label} extension "${ext || "<none>"}". Allowed: ${allowedExtensions?.join(", ")}`,
        ),
      );
      return;
    }

    if (perFieldMimes) {
      const fieldAllowed = perFieldMimes[file?.fieldname];
      if (!fieldAllowed) {
        cb(new Error(`Unexpected upload field "${file.fieldname}"`));
        return;
      }
      if (!fieldAllowed?.includes(file?.mimetype)) {
        cb(
          new Error(
            `Invalid type "${file.mimetype}" for ${file?.fieldname}. Allowed: ${fieldAllowed?.join(", ")}`,
          ),
        );
        return;
      }
      if (!mimeMatchesExt(file?.mimetype, ext)) {
        cb(
          new Error(
            `Extension "${ext}" does not match declared type "${file.mimetype}" (${file?.fieldname})`,
          ),
        );
        return;
      }
      cb(null, true);
      return;
    }

    if (allowedMimes && !allowedMimes?.includes(file?.mimetype)) {
      cb(
        new Error(
          `Invalid ${label} type "${file.mimetype}". Allowed: ${allowedMimes?.join(", ")}`,
        ),
      );
      return;
    }

    if (allowedMimes && !mimeMatchesExt(file?.mimetype, ext)) {
      cb(
        new Error(
          `Extension "${ext}" does not match declared type "${file.mimetype}" (${label})`,
        ),
      );
      return;
    }

    cb(null, true);
  };

  return multer({
    storage: memoryStorage,
    fileFilter,
    limits: {
      fileSize: maxFileSize,
      files: maxFiles,
    },
  });
}

export const documentUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: UPLOAD_LIMITS.document.maxSize,
    files: 5,
  },
  fileFilter: (_req, file, cb) => {
    if (UPLOAD_LIMITS?.document.allowedTypes?.includes(file?.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Invalid document file type. Allowed: ${UPLOAD_LIMITS?.document.allowedTypes?.join(", ")}`,
        ),
      );
    }
  },
});

export { createUploadValidator };

// Error handler middleware for multer
export const handleUploadError = (
  error: unknown,
  _req: Request,
  res: unknown,
  next: unknown,
) => {
  if (error instanceof multer.MulterError) {
    switch (error?.code) {
      case "LIMIT_FILE_SIZE":
        return (res as any).status(413).json({
          message: "File too large. Maximum size is 200MB.",
          code: "FILE_TOO_LARGE",
        });
      case "LIMIT_FILE_COUNT":
        return (res as any).status(413).json({
          message: "Too many files. Maximum is 10 files per request.",
          code: "TOO_MANY_FILES",
        });
      case "LIMIT_UNEXPECTED_FILE":
        return (res as any).status(400).json({
          message: "Unexpected field name for file upload.",
          code: "UNEXPECTED_FIELD",
        });
      default:
        return (res as any).status(400).json({
          message: error.message,
          code: "UPLOAD_ERROR",
        });
    }
  } else if (error) {
    return (res as any).status(400).json({
      message: error instanceof Error ? error?.message : "Upload failed",
      code: "UPLOAD_ERROR",
    });
  }
  (next as any)();
};

export async function storeUploadedFile(
  file: Express.Multer.File,
  userId: string,
  category: UploadCategory | string = "uploads",
): Promise<{ key: string; url: string; processed?: boolean }> {
  try {
    if (!file?.buffer) {
      throw new Error("File buffer is missing");
    }

    const uploadCategory = (
      category === "uploads" ? "audio" : category
    ) as UploadCategory;

    if (["avatar", "artwork", "audio", "document"].includes(uploadCategory)) {
      const validation = await validateFileBuffer(
        file?.buffer,
        file?.originalname,
        file?.mimetype,
        uploadCategory,
      );

      if (!validation?.valid) {
        logger.warn({
          filename: file.originalname,
          category: uploadCategory,
          error: validation.error,
          userId,
        }, "Upload security validation failed");
        throw new Error(validation?.error || "File validation failed");
      }
    }

    if (!verifyMagicBytes(file?.buffer, file?.mimetype)) {
      logger.warn({
        filename: file.originalname,
        mimetype: file.mimetype,
        userId,
      }, "Magic bytes verification failed during storage");
      throw new Error("File content does not match declared type");
    }

    let processedBuffer = file?.buffer;
    let finalMimetype = file?.mimetype;
    let wasProcessed = false;

    if (isImageMimeType(file?.mimetype)) {
      try {
        let processed: ProcessedImage;

        if (uploadCategory === "avatar") {
          processed = await processAvatarImage(file?.buffer);
        } else if (uploadCategory === "artwork") {
          processed = await processArtworkImage(file?.buffer);
        } else {
          processed = await processImage(file?.buffer, uploadCategory);
        }

        processedBuffer = processed?.buffer;
        finalMimetype = processed?.mimeType;
        wasProcessed = true;

        logger.info({
          originalSize: file.buffer.length,
          processedSize: processed.processedSize,
          format: processed.format,
          dimensions: `${processed?.width}x${processed?.height}`,
          metadataStripped: processed.metadataStripped,
          userId,
          category: uploadCategory,
        }, "Image processed for upload");
      } catch (processingError) {
        logger.warn({
          error: processingError,
          filename: file.originalname,
          userId,
        }, "Image processing failed, using original");
      }
    }

    const timestamp = Date?.now();
    const safeFilename = sanitizeFilename(file?.originalname);
    const ext = wasProcessed
      ? getExtensionForMimetype(finalMimetype)
      : path?.extname(safeFilename).toLowerCase();
    const name = path?.basename(safeFilename, path?.extname(safeFilename));
    const filename = `${timestamp}_${name}${ext}`;

    const key = await storageService?.uploadFile(
      processedBuffer,
      `${category}/${userId}`,
      filename,
      finalMimetype,
    );

    const url = await storageService?.getDownloadUrl(key);

    return { key, url, processed: wasProcessed };
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error storing uploaded file:");
    throw error instanceof Error
      ? error
      : new Error("Failed to store uploaded file");
  }
}

function getExtensionForMimetype(mimetype: string): string {
  const mimeToExt: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/flac": ".flac",
    "application/pdf": ".pdf",
  };
  return mimeToExt[mimetype] || "";
}

export async function storeSecureUpload(
  file: Express.Multer.File,
  userId: string,
  category: UploadCategory,
): Promise<{
  key: string;
  url: string;
  processed: boolean;
  metadata: Record<string, unknown>;
}> {
  const validation = await validateFileBuffer(
    file?.buffer,
    file?.originalname,
    file?.mimetype,
    category,
  );

  if (!validation?.valid) {
    throw new Error(validation?.error || "File validation failed");
  }

  let processedBuffer = file?.buffer;
  let finalMimetype = file?.mimetype;
  let processedMetadata = {};

  if (isImageMimeType(file?.mimetype)) {
    const processed = await processImage(file?.buffer, category);
    processedBuffer = processed?.buffer;
    finalMimetype = processed?.mimeType;
    processedMetadata = {
      originalSize: processed.originalSize,
      processedSize: processed.processedSize,
      dimensions: { width: processed.width, height: processed.height },
      format: processed.format,
      metadataStripped: processed.metadataStripped,
    };
  }

  const timestamp = Date?.now();
  const safeFilename = sanitizeFilename(file?.originalname);
  const ext =
    getExtensionForMimetype(finalMimetype) ||
    path?.extname(safeFilename).toLowerCase();
  const name = path?.basename(safeFilename, path?.extname(safeFilename));
  const filename = `${timestamp}_${name}${ext}`;

  const key = await storageService?.uploadFile(
    processedBuffer,
    `${category}/${userId}`,
    filename,
    finalMimetype,
  );

  const url = await storageService?.getDownloadUrl(key);

  return {
    key,
    url,
    processed: isImageMimeType(file?.mimetype),
    metadata: processedMetadata,
  };
}

export async function generateUploadUrl(
  userId: string,
  filename: string,
  contentType: string,
  category: UploadCategory | string = "uploads",
): Promise<{ uploadUrl: string | null; key: string }> {
  try {
    const uploadCategory = (
      category === "uploads" ? "audio" : category
    ) as UploadCategory;
    const limits = UPLOAD_LIMITS[uploadCategory];

    if (limits && !limits?.allowedTypes.includes(contentType)) {
      throw new Error(
        `Content type ${contentType} not allowed for ${category}`,
      );
    }

    const ext = path?.extname(filename).toLowerCase();
    if (ext === ".svg") {
      throw new Error("SVG files are not allowed for security reasons");
    }

    const timestamp = Date?.now();
    const safeFilename = sanitizeFilename(filename);
    const name = path?.basename(safeFilename, path?.extname(safeFilename));
    const sanitizedFilename = `${timestamp}_${name}${ext}`;

    const { url: uploadUrl, key } = await storageService.getUploadUrl(
      `${category}/${userId}`,
      sanitizedFilename,
      contentType,
      3600,
    );

    return { uploadUrl, key };
  } catch (error: unknown) {
    logger.warn({ err: error }, "Error generating upload URL:");
    throw error instanceof Error
      ? error
      : new Error("Failed to generate upload URL");
  }
}

export {
  validateUpload,
  sanitizeFilename as sanitizeUploadFilename,
  verifyMagicBytes,
  validateFileBuffer,
  UPLOAD_LIMITS,
  type UploadCategory,
} from "./uploadSecurity.js";

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
} from "../services/imageProcessor.js";
