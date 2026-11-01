/**
 * STORAGE ROUTES
 *
 * File upload / download / management via PocketDimension or Replit Object Storage.
 * Auth: Authorization: Bearer <instance-token>  (same as Redis instances)
 */

import { Router, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { storageService } from "../services/storageService.js";
import { userPocketService } from "../services/userPocketDimensionService.js";
import { logger } from "../logger.js";
import path from "path";
import fs from "fs/promises";

const router = Router();

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB
const MAX_CHUNK_SIZE = 256 * 1024 * 1024; // 256 MB
const CHUNK_TTL_MS = 24 * 60 * 60 * 1000; //  24 h

const ALLOWED_CATEGORIES = new Set([
  // Audio / music
  "audio",
  "tracks",
  "beats",
  "stems",
  "samples",
  "loops",
  "midi",
  "podcasts",
  "recordings",
  "masters",
  "mixdowns",
  // Visual
  "images",
  "covers",
  "avatars",
  "thumbnails",
  "artwork",
  "videos",
  "animations",
  "renders",
  // ML / data
  "models",
  "weights",
  "checkpoints",
  "embeddings",
  "datasets",
  "data",
  "parquet",
  "vectors",
  "annotations",
  // General
  "documents",
  "projects",
  "archives",
  "backups",
  "logs",
  "files",
]);

function sanitizeCategory(raw: unknown): string {
  const cat = typeof raw === "string" ? raw.toLowerCase() : "files";
  return ALLOWED_CATEGORIES.has(cat) ? cat : "files";
}

function sanitizeFileName(raw: unknown): string {
  const name = typeof raw === "string" ? raw : "upload";
  return (
    path
      .basename(name)
      .replace(/[^a-zA-Z0-9._\- ]/g, "_")
      .slice(0, 255) || "upload"
  );
}

// ── Multer setup ──────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CHUNK_SIZE },
});

// ── Chunked upload tracker ────────────────────────────────────────────────

interface ChunkSession {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  uploadedChunks: Set<number>;
  category: string;
  ownerId: string;
  createdAt: number;
}

const chunkSessions = new Map<string, ChunkSession>();

setInterval(
  () => {
    const now = Date.now();
    for (const [id, s] of chunkSessions) {
      if (now - s.createdAt > CHUNK_TTL_MS) {
        chunkSessions.delete(id);
        cleanupChunkTemp(id).catch(() => {});
      }
    }
  },
  60 * 60 * 1000,
);

async function cleanupChunkTemp(fileId: string) {
  const dir = path.join(process.cwd(), "uploads", "temp", fileId);
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}

/**
 * On startup: delete any temp directories left over from a previous server run.
 * (In-memory chunkSessions are cleared on restart, so all persisted temp dirs are orphaned.)
 */
async function cleanupOrphanedTempDirs() {
  const tempRoot = path.join(process.cwd(), "uploads", "temp");
  try {
    const entries = await fs.readdir(tempRoot);
    await Promise.all(
      entries.map((name) =>
        fs
          .rm(path.join(tempRoot, name), { recursive: true, force: true })
          .catch(() => {}),
      ),
    );
    if (entries.length > 0) {
      logger.info(
        `[Storage] Cleaned ${entries.length} orphaned temp upload dir(s) on startup`,
      );
    }
  } catch {
    // Temp root may not exist yet — that's fine
  }
}
cleanupOrphanedTempDirs();

// ── Helpers ───────────────────────────────────────────────────────────────

function getOwnerId(req: Request): string {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  return token || "anonymous";
}

// ── Routes ────────────────────────────────────────────────────────────────

/**
 * POST /api/storage/upload
 * Single-shot upload (≤ 500 MB). Multipart form: file + optional category + optional fileId.
 */
router.post(
  "/upload",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      const ownerId = getOwnerId(req);
      const category = sanitizeCategory(req.body.category);
      const safeFileName = sanitizeFileName(req.file.originalname);
      const fileId = (req.body.fileId as string) || randomUUID();

      const key = await storageService.uploadFile(
        req.file.buffer,
        `${ownerId}/${category}`,
        safeFileName,
        req.file.mimetype,
      );

      logger.info(`[Storage] Upload: ${key} (${req.file.size} B)`);
      res.json({
        success: true,
        file: {
          id: fileId,
          key,
          name: safeFileName,
          size: req.file.size,
          type: req.file.mimetype,
          url: await storageService.getDownloadUrl(key),
        },
      });
    } catch (err) {
      logger.error("[Storage] Upload error:", err);
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : "Upload failed" });
    }
  },
);

/**
 * POST /api/storage/upload/pocket
 * Upload directly into the caller's personal Pocket Dimension namespace.
 */
router.post(
  "/upload/pocket",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      const ownerId = getOwnerId(req);
      const category = sanitizeCategory(req.body.category);
      const safeFileName = sanitizeFileName(req.file.originalname);

      // Ensure storage exists for this owner
      const existing = await userPocketService.getStorageStats(ownerId);
      if (!existing) {
        await userPocketService.initializeUserStorage(
          ownerId,
          `instance-${ownerId.slice(0, 8)}`,
        );
      }

      const result = await userPocketService.storeFile(
        ownerId,
        safeFileName,
        req.file.buffer,
        {
          folder: category,
          mimeType: req.file.mimetype,
        },
      );

      res.json({ success: true, ...result });
    } catch (err) {
      logger.error("[Storage] Pocket upload error:", err);
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : "Upload failed" });
    }
  },
);

/**
 * GET /api/storage/download/:key
 * Stream a file back to the caller.
 */
router.get("/download/:key(*)", async (req: Request, res: Response) => {
  try {
    const key = decodeURIComponent(req.params.key as string);
    const data = await storageService.downloadFile(key);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", data.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${path.basename(key)}"`,
    );
    res.send(data);
  } catch (err) {
    res.status(404).json({ error: "File not found" });
  }
});

/**
 * GET /api/storage/pocket/files
 * List files in the caller's Pocket Dimension namespace.
 */
router.get("/pocket/files", async (req: Request, res: Response) => {
  try {
    const ownerId = getOwnerId(req);
    const files = await userPocketService.listFiles(ownerId);
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: "Failed to list files" });
  }
});

/**
 * GET /api/storage/pocket/file/:fileKey
 * Read a file from the caller's Pocket Dimension namespace.
 */
router.get(
  "/pocket/file/:fileKey(*)",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const ownerId = getOwnerId(req);
      const fileKey = decodeURIComponent(req.params.fileKey as string);
      const data = await userPocketService.readFile(ownerId, fileKey);
      if (!data) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      res.setHeader("Content-Length", data.length);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${path.basename(fileKey)}"`,
      );
      res.send(data);
    } catch (err) {
      res.status(500).json({ error: "Failed to read file" });
    }
  },
);

/**
 * DELETE /api/storage/pocket/file/:fileKey
 */
router.delete(
  "/pocket/file/:fileKey(*)",
  async (req: Request, res: Response) => {
    try {
      const ownerId = getOwnerId(req);
      const fileKey = decodeURIComponent(req.params.fileKey as string);
      const ok = await userPocketService.deleteFile(ownerId, fileKey);
      res.json({ success: ok });
    } catch (err) {
      res.status(500).json({ error: "Delete failed" });
    }
  },
);

/**
 * GET /api/storage/pocket/stats
 * Get storage quota/usage stats for the caller's namespace.
 */
router.get(
  "/pocket/stats",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const ownerId = getOwnerId(req);
      const stats = await userPocketService.getStorageStats(ownerId);
      if (!stats) {
        res
          .status(404)
          .json({ error: "No storage found — upload a file first" });
        return;
      }
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: "Failed to get stats" });
    }
  },
);

/**
 * POST /api/storage/delete
 * Body: { key: string }
 */
router.post("/delete", async (req: Request, res: Response): Promise<void> => {
  try {
    const { key } = req.body as { key?: string };
    if (!key) {
      res.status(400).json({ error: "key required" });
      return;
    }
    await storageService.deleteFile(key);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
});

/**
 * POST /api/storage/chunk/init
 * Initialize a chunked upload session.
 * Body: { fileId, fileName, fileSize, mimeType, totalChunks, category }
 */
router.post(
  "/chunk/init",
  async (req: Request, res: Response): Promise<void> => {
    const { fileId, fileName, fileSize, mimeType, totalChunks, category } =
      req.body;
    if (!fileName || !fileSize || !totalChunks) {
      res
        .status(400)
        .json({ error: "fileName, fileSize, totalChunks required" });
      return;
    }
    const id = fileId || randomUUID();
    chunkSessions.set(id, {
      fileId: id,
      fileName: sanitizeFileName(fileName),
      fileSize: Number(fileSize),
      mimeType: mimeType || "application/octet-stream",
      totalChunks: Number(totalChunks),
      uploadedChunks: new Set(),
      category: sanitizeCategory(category),
      ownerId: getOwnerId(req),
      createdAt: Date.now(),
    });
    res.json({ success: true, fileId: id });
  },
);

/**
 * POST /api/storage/chunk/upload
 * Upload one chunk. Form fields: fileId, chunkIndex. File: chunk binary.
 */
router.post(
  "/chunk/upload",
  chunkUpload.single("chunk"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No chunk data" });
        return;
      }
      const { fileId, chunkIndex } = req.body;
      if (!fileId || chunkIndex === undefined || chunkIndex === null) {
        res.status(400).json({ error: "fileId and chunkIndex are required" });
        return;
      }
      const session = chunkSessions.get(fileId);
      if (!session) {
        res.status(404).json({ error: "Upload session not found" });
        return;
      }

      const idx = Number(chunkIndex);
      if (!Number.isInteger(idx) || idx < 0 || idx >= session.totalChunks) {
        res.status(400).json({
          error: `chunkIndex must be an integer in [0, ${session.totalChunks - 1}]`,
        });
        return;
      }
      const tmpDir = path.join(process.cwd(), "uploads", "temp", fileId);
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.writeFile(path.join(tmpDir, `chunk-${idx}`), req.file.buffer);
      session.uploadedChunks.add(idx);

      res.json({
        success: true,
        uploadedChunks: session.uploadedChunks.size,
        totalChunks: session.totalChunks,
      });
    } catch (err) {
      logger.error("[Storage] Chunk upload error:", err);
      res.status(500).json({ error: "Chunk upload failed" });
    }
  },
);

/**
 * POST /api/storage/chunk/finalize
 * Assemble chunks and store the complete file.
 * Body: { fileId }
 */
router.post(
  "/chunk/finalize",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { fileId } = req.body;
      const session = chunkSessions.get(fileId);
      if (!session) {
        res.status(404).json({ error: "Upload session not found" });
        return;
      }

      // Verify the uploaded chunk count matches
      if (session.uploadedChunks.size < session.totalChunks) {
        res.status(400).json({
          error: `Missing chunks: ${session.uploadedChunks.size}/${session.totalChunks}`,
        });
        return;
      }
      // Verify no gap in the sequence (e.g. chunk-0 missing but chunk-1..N present)
      for (let i = 0; i < session.totalChunks; i++) {
        if (!session.uploadedChunks.has(i)) {
          res.status(400).json({ error: `Chunk ${i} was never uploaded` });
          return;
        }
      }

      // Guard against OOM: reject files that would exceed the in-memory assembly limit.
      const FINALIZE_SIZE_LIMIT = 1024 * 1024 * 1024; // 1 GB
      if (session.fileSize > FINALIZE_SIZE_LIMIT) {
        res.status(413).json({
          error: `File too large for in-memory assembly (${Math.round(session.fileSize / 1024 / 1024)} MB > 1 GB limit). Use a streaming upload path.`,
        });
        return;
      }

      const tmpDir = path.join(process.cwd(), "uploads", "temp", fileId);
      // Read chunks sequentially (not all at once) to keep peak RSS low
      const parts: Buffer[] = [];
      for (let i = 0; i < session.totalChunks; i++) {
        parts.push(await fs.readFile(path.join(tmpDir, `chunk-${i}`)));
      }
      const assembled = Buffer.concat(parts);

      const key = await storageService.uploadFile(
        assembled,
        `${session.ownerId}/${session.category}`,
        session.fileName,
        session.mimeType,
      );

      chunkSessions.delete(fileId);
      await cleanupChunkTemp(fileId);

      logger.info(
        `[Storage] Chunked upload finalized: ${key} (${assembled.length} B)`,
      );
      res.json({
        success: true,
        file: {
          id: fileId,
          key,
          name: session.fileName,
          size: assembled.length,
          type: session.mimeType,
          url: await storageService.getDownloadUrl(key),
        },
      });
    } catch (err) {
      logger.error("[Storage] Finalize error:", err);
      res.status(500).json({ error: "Finalize failed" });
    }
  },
);

export default router;
