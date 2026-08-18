import crypto from "crypto";
import express, { Router, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { db } from "../db.js";
import { env } from "../config/env.js";
import { logger } from "../logger.js";
import { requireAuth } from "../middleware/auth.js";
import { storageService } from "../services/storageService.js";
import { userStorage, userStorageFiles } from "../../shared/schema.js";
import { eq } from "drizzle-orm";

const router = Router();

const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;
const MAX_FILE_SIZE = 500 * 1024 * 1024;
const ALLOWED_CATEGORIES = new Set([
  "audio",
  "tracks",
  "beats",
  "images",
  "covers",
  "avatars",
  "videos",
  "files",
  "documents",
  "stems",
  "projects",
]);
const ALLOWED_MIME_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp3",
  "audio/mpeg",
  "audio/flac",
  "audio/x-flac",
  "audio/aiff",
  "audio/x-aiff",
  "audio/ogg",
  "audio/webm",
  "audio/aac",
  "audio/mp4",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "application/octet-stream",
]);
const UPLOAD_TOKEN_SECRET = env.SESSION_SECRET;

type UploadTokenPayload = {
  u: string;
  k: string;
  n: string;
  ct: string;
  s: number;
  c: string;
  exp: number;
};

function sanitizeCategory(raw: unknown): string {
  const category = typeof raw === "string" ? raw.toLowerCase() : "files";
  return ALLOWED_CATEGORIES.has(category) ? category : "files";
}

function sanitizeFileName(raw: unknown): string {
  const name = typeof raw === "string" ? raw : "upload";
  return (
    name
      .split(/[/\\]/)
      .pop()
      ?.replace(/[^a-zA-Z0-9._\- ]/g, "_")
      .slice(0, 255) || "upload"
  );
}

function normalizeContentType(raw: unknown): string {
  const contentType = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const normalized = contentType.split(";")[0]?.trim() || "application/octet-stream";
  return ALLOWED_MIME_TYPES.has(normalized)
    ? normalized
    : "application/octet-stream";
}

function createUploadToken(payload: UploadTokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", UPLOAD_TOKEN_SECRET)
    .update(encoded)
    .digest("base64url");
  return `${encoded}~${signature}`;
}

function verifyUploadToken(rawToken: string): UploadTokenPayload | null {
  try {
    const splitAt = rawToken.lastIndexOf("~");
    if (splitAt < 0) return null;
    const encoded = rawToken.slice(0, splitAt);
    const signature = rawToken.slice(splitAt + 1);
    const expectedSignature = crypto
      .createHmac("sha256", UPLOAD_TOKEN_SECRET)
      .update(encoded)
      .digest("base64url");
    if (signature.length !== expectedSignature.length) return null;
    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      )
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf-8"),
    ) as Partial<UploadTokenPayload>;
    if (
      typeof payload.u !== "string" ||
      typeof payload.k !== "string" ||
      typeof payload.n !== "string" ||
      typeof payload.ct !== "string" ||
      typeof payload.s !== "number" ||
      typeof payload.c !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (Date.now() > payload.exp) return null;
    return payload as UploadTokenPayload;
  } catch {
    return null;
  }
}

async function ensureUserStorageRow(userId: string): Promise<string | null> {
  let [storageRow] = await db
    .select({ id: userStorage.id })
    .from(userStorage)
    .where(eq(userStorage.userId, userId))
    .limit(1);

  if (!storageRow) {
    [storageRow] = await db
      .insert(userStorage)
      .values({ userId, storagePrefix: `users/${userId}` })
      .onConflictDoNothing()
      .returning({ id: userStorage.id });
  }

  if (!storageRow) {
    [storageRow] = await db
      .select({ id: userStorage.id })
      .from(userStorage)
      .where(eq(userStorage.userId, userId))
      .limit(1);
  }

  return storageRow?.id ?? null;
}

router.post("/request-url", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const fileName = sanitizeFileName(req.body?.name);
    const category = sanitizeCategory(req.body?.category);
    const contentType = normalizeContentType(req.body?.contentType);
    const sizeBytes = Number(req.body?.size);

    if (!Number.isFinite(sizeBytes) || !Number.isInteger(sizeBytes) || sizeBytes <= 0) {
      return res.status(400).json({ error: "Invalid file size" });
    }
    if (sizeBytes > MAX_FILE_SIZE) {
      return res.status(413).json({
        error: "Payload Too Large",
        message: `Files larger than ${MAX_FILE_SIZE / 1024 / 1024}MB are not allowed.`,
      });
    }

    const objectPath = `users/${userId}/${category}/${randomUUID()}/${fileName}`;
    const token = createUploadToken({
      u: userId,
      k: objectPath,
      n: fileName,
      ct: contentType,
      s: sizeBytes,
      c: category,
      exp: Date.now() + UPLOAD_URL_TTL_MS,
    });

    res.json({
      uploadURL: `/api/uploads/direct/${encodeURIComponent(token)}`,
      objectPath,
      metadata: {
        name: fileName,
        size: sizeBytes,
        contentType,
      },
      expiresInMs: UPLOAD_URL_TTL_MS,
    });
  } catch (error) {
    logger.error({ err: error }, "[Uploads] Failed to issue direct upload URL");
    return res.status(500).json({ error: "Failed to create upload URL" });
  }
});

router.put(
  "/direct/:token",
  express.raw({ type: () => true, limit: MAX_FILE_SIZE }),
  async (req: Request, res: Response) => {
    const token = Array.isArray(req.params.token)
      ? req.params.token[0]
      : req.params.token;
    if (!token) {
      return res.status(404).json({ error: "Upload URL is invalid or expired" });
    }
    const payload = verifyUploadToken(token);
    if (!payload) {
      return res.status(404).json({ error: "Upload URL is invalid or expired" });
    }

    const body =
      Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? "");
    if (body.length !== payload.s) {
      return res.status(400).json({
        error: "Uploaded file size does not match the reserved upload size",
      });
    }

    const contentType = normalizeContentType(req.headers["content-type"] ?? payload.ct);
    if (contentType !== payload.ct) {
      return res.status(400).json({ error: "Uploaded file type does not match the reserved upload type" });
    }

    try {
      const alreadyTracked = await db
        .select({ id: userStorageFiles.id })
        .from(userStorageFiles)
        .where(eq(userStorageFiles.fileKey, payload.k))
        .limit(1);
      if (alreadyTracked.length > 0) {
        return res.status(409).json({ error: "Upload URL has already been used" });
      }

      await storageService.uploadFileAtKey(body, payload.k, payload.ct);

      const storageId = await ensureUserStorageRow(payload.u);
      if (!storageId) {
        await storageService.deleteFile(payload.k);
        return res.status(500).json({ error: "Upload could not be recorded" });
      }

      await db
        .insert(userStorageFiles)
        .values({
          userId: payload.u,
          storageId,
          fileName: payload.n,
          fileKey: payload.k,
          mimeType: payload.ct,
          sizeBytes: payload.s,
          folder: payload.c,
          metadata: {
            category: payload.c,
            uploadedVia: "uploads/request-url",
          },
        })
        .onConflictDoNothing();

      return res.status(200).json({
        success: true,
        file: {
          key: payload.k,
          name: payload.n,
          size: payload.s,
          type: payload.ct,
          url: await storageService.getDownloadUrl(payload.k),
        },
      });
    } catch (error) {
      logger.error({ err: error }, `[Uploads] Direct upload failed for key=${payload.k}`);
      try {
        await storageService.deleteFile(payload.k);
      } catch (cleanupError) {
        logger.error(
          { err: cleanupError },
          `[Uploads] Cleanup failed for key=${payload.k}`,
        );
      }
      return res.status(500).json({ error: "Failed to store uploaded file" });
    }
  },
);

export default router;
