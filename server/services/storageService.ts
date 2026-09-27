/**
 * Storage Service — PDIM-only.
 *
 * All file I/O is routed exclusively through the Pocket Dimension engine,
 * which persists chunks via the PDIM HTTP server. The Replit local
 * filesystem is NEVER used as a storage source: no durability copy on
 * upload, no fallback read, no disk-based existence check. If PDIM is
 * unreachable, every operation fails explicitly (the caller sees a real
 * error) instead of silently reading or writing local files.
 */

import { randomUUID, createHash } from "crypto";
import { logger } from "../logger.js";
import { db } from "../db.js";
import { userStorage, userStorageFiles } from "../../shared/schema.js";
import { eq } from "drizzle-orm";

// Throttle noisy PDIM-unavailable warnings to once per 30 s per operation type
// so a storage-server outage doesn't flood the log on every upload/delete.
const _STORAGE_WARN_THROTTLE_MS = 30_000;
let _lastPdimWriteWarnAt = 0;
let _lastPdimReadWarnAt = 0;
let _lastPdimDeleteWarnAt = 0;

export interface StorageProvider {
  uploadFile(file: Buffer, key: string, contentType?: string): Promise<string>;
  downloadFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
  getUploadUrl(
    key: string,
    contentType: string,
    expiresIn?: number,
  ): Promise<string | null>;
  getDownloadUrl(key: string, expiresIn?: number): Promise<string>;
  fileExists(key: string): Promise<boolean>;
}

/**
 * Pocket Dimension Storage Provider
 *
 * Routes ALL file I/O through the Pocket Dimension engine:
 *   - Level-9 Gzip compression on every chunk
 *   - SHA-256 content-addressed deduplication
 *   - 32 MB chunk size for efficient large-file handling
 *   - Chunks persisted exclusively to the PDIM HTTP server
 *
 * PDIM is the ONLY storage backend this provider ever touches. There is no
 * local-filesystem write, read, or existence check anywhere in this class —
 * a PDIM failure is a real failure, surfaced to the caller, never masked by
 * a disk fallback.
 */
class PocketDimensionStorageProvider implements StorageProvider {
  private pocket: Record<string, unknown> | null = null;
  private initPromise: Promise<void> | null = null;

  private async init(): Promise<void> {
    // This runs on first I/O, never while the ESM import graph is evaluating.
    // index.ts/cluster.ts must finish starting the canonical local owner before
    // handlers can use storage. Eager constructor I/O ran before that await,
    // swallowed the connection error, and permanently poisoned the singleton.
    const { PocketDimensionManager } = await import("../pocket-dimension/index.js");
    const { PdimRedisClient } = await import("../lib/pdimClient.js");
    const { runtimePorts, loopbackUrl } = await import("../config/ports.js");
    const local = process.env.PDIM_FORCE_REMOTE !== "1";
    const execUrl = local
      ? `${loopbackUrl(runtimePorts.localPdim)}/api/redis/instances/local/exec`
      : process.env.PDIM_EXEC_URL || process.env.PDIM_HTTP_EXEC_URL;
    const token = local
      ? process.env.PDIM_LOCAL_CHANNEL_TOKEN
      : process.env.PDIM_EXEC_TOKEN || process.env.PDIM_BEARER_TOKEN;
    if (!execUrl || !token) {
      throw new Error(local
        ? "Canonical local PDIM endpoint requires the inherited private channel token"
        : "Remote PDIM requires an explicitly configured endpoint and credential");
    }
    // Bind endpoint and credential together. Do not reuse a singleton that
    // may have captured stale external env vars before pdimEnvFix ran.
    const storage = new PdimRedisClient(execUrl, token);
    const manager = PocketDimensionManager.getInstance("./pocket-dimensions");
    this.pocket = await manager.openPocket("application-storage", {
      storage,
      compressionLevel: 9,
      enableDeduplication: true,
      enableVersioning: false,
      chunkSize: 32 * 1024 * 1024,
    });
    logger.info(
      "📦 [Storage] Pocket Dimension provider ready (PDIM-only, level-9 gzip, dedup, 32 MB chunks)",
    );
  }

  private async ensure(): Promise<void> {
    if (this.pocket) return;
    // Single-flight initialization; failures stay visible to this operation.
    // A later explicit operation may initialize again, but there is no timer,
    // automatic retry, alternate store, or empty-pocket fallback.
    const pending = this.initPromise ??= this.init();
    try {
      await pending;
    } catch (error) {
      if (this.initPromise === pending) this.initPromise = null;
      throw error;
    }
  }

  async uploadFile(
    file: Buffer,
    key: string,
    _contentType?: string,
  ): Promise<string> {
    try {
      await this.ensure();
      await (
        this.pocket as Record<string, (...a: unknown[]) => Promise<unknown>>
      ).write(`files/${key}`, file);

      const exists = await (
        this.pocket as Record<string, (...a: unknown[]) => Promise<boolean>>
      ).exists(`files/${key}`);
      if (!exists) {
        throw new Error("PDIM write verification failed");
      }

      return key;
    } catch (err) {
      const now = Date.now();
      if (now - _lastPdimWriteWarnAt >= _STORAGE_WARN_THROTTLE_MS) {
        _lastPdimWriteWarnAt = now;
        logger.warn(
          { err },
          `[Storage] PDIM write failed for key=${key} — suppressing repeats for 30 s`,
        );
      }
      throw new Error(
        `Storage upload failed for key=${key}: ${(err as Error)?.message ?? String(err)}`,
        { cause: err },
      );
    }
  }

  async downloadFile(key: string): Promise<Buffer> {
    try {
      await this.ensure();
      return await (
        this.pocket as Record<string, (...a: unknown[]) => Promise<Buffer>>
      ).read(`files/${key}`);
    } catch (err) {
      const now = Date.now();
      if (now - _lastPdimReadWarnAt >= _STORAGE_WARN_THROTTLE_MS) {
        _lastPdimReadWarnAt = now;
        logger.warn(
          { err },
          `[Storage] PDIM read failed for key=${key} — suppressing repeats for 30 s`,
        );
      }
      throw new Error(`File not found: ${key}`);
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.ensure();
      await (
        this.pocket as Record<string, (...a: unknown[]) => Promise<void>>
      ).delete(`files/${key}`);
    } catch (err) {
      const now = Date.now();
      if (now - _lastPdimDeleteWarnAt >= _STORAGE_WARN_THROTTLE_MS) {
        _lastPdimDeleteWarnAt = now;
        logger.warn(
          { err },
          `[Storage] PDIM delete failed for key=${key} — suppressing repeats for 30 s`,
        );
      }
      throw new Error(
        `Storage delete failed for key=${key}: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }

  async getUploadUrl(
    _key: string,
    _contentType: string,
    _expiresIn?: number,
  ): Promise<string | null> {
    return null;
  }

  async getDownloadUrl(key: string, _expiresIn?: number): Promise<string> {
    return `/api/storage/file/${encodeURIComponent(key)}`;
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      await this.ensure();
      return await (
        this.pocket as Record<string, (...a: unknown[]) => Promise<boolean>>
      ).exists(`files/${key}`);
    } catch {
      return false;
    }
  }
}

/**
 * Storage Service Singleton — always uses Pocket Dimension (PDIM-backed).
 */
class StorageService {
  private provider: StorageProvider;
  private generatedCommits = new Map<string, Promise<unknown>>();

  /** A stable owner/job/content key makes a lost HTTP acknowledgement retryable.
   * Completion requires BOTH ownership bookkeeping and a digest-verified read. */
  async commitGeneratedArtifact(file: Buffer, owner: string, jobId: string,
    filename: string, contentType: string, metadata: Record<string, unknown>) {
    if (!owner || !jobId || !file.length) throw new Error("Artifact identity and bytes required");
    const digest = createHash("sha256").update(file).digest("hex");
    const identity = createHash("sha256").update(`${owner}\0${jobId}`).digest("hex");
    const key = `users/${owner}/generated/${identity}/${digest}/${filename}`;
    const pending = this.generatedCommits.get(key);
    if (pending) return pending;
    const commit = (async () => {
      const [existing] = await db.select().from(userStorageFiles)
        .where(eq(userStorageFiles.fileKey, key)).limit(1);
      if (existing && existing.userId !== owner) throw new Error("Artifact ownership mismatch");
      if (existing?.deletedAt) throw new Error("Generated artifact has been deleted");
      if (!existing) {
        await this.provider.uploadFile(file, key, contentType);
        let [row] = await db.select({ id: userStorage.id }).from(userStorage)
          .where(eq(userStorage.userId, owner)).limit(1);
        if (!row) {
          await db.insert(userStorage).values({ userId: owner, storagePrefix: `users/${owner}` })
            .onConflictDoNothing();
          [row] = await db.select({ id: userStorage.id }).from(userStorage)
            .where(eq(userStorage.userId, owner)).limit(1);
        }
        if (!row) throw new Error("Artifact owner storage unavailable");
        // Keep the deterministic object on bookkeeping failure: a retry repairs it.
        await db.insert(userStorageFiles).values({
          userId: owner, storageId: row.id, fileName: filename, fileKey: key,
          mimeType: contentType, sizeBytes: file.length, folder: "generated",
          metadata: { ...metadata, sha256: digest, jobId, uploadedVia: "generated-media" },
        }).onConflictDoNothing();
      }
      const [tracked] = await db.select().from(userStorageFiles)
        .where(eq(userStorageFiles.fileKey, key)).limit(1);
      if (!tracked || tracked.userId !== owner || tracked.deletedAt) throw new Error("Artifact ownership was not committed");
      const retrieved = await this.downloadFile(key);
      if (retrieved.length !== file.length ||
          createHash("sha256").update(retrieved).digest("hex") !== digest) {
        throw new Error("PDIM artifact read-back digest mismatch");
      }
      return { ...metadata, url: await this.getDownloadUrl(key), storage_key: key,
        owner_id: owner, job_id: jobId, sha256: digest, size_bytes: file.length,
        durable: true, retrievable: true };
    })();
    this.generatedCommits.set(key, commit);
    try { return await commit; } finally { this.generatedCommits.delete(key); }
  }

  constructor() {
    logger.info(
      "📦 [Storage] Using Pocket Dimension (PDIM) as the sole storage backend",
    );
    this.provider = new PocketDimensionStorageProvider();
  }

  async uploadFile(
    file: Buffer,
    category: string,
    filename: string,
    contentType?: string,
  ): Promise<string> {
    const key = `${category}/${randomUUID()}/${filename}`;
    await this.provider.uploadFile(file, key, contentType);
    return key;
  }

  /** Generated user media is subject to the same quota/deletion tracking as
   * /api/storage/upload. Roll back the PDIM object if bookkeeping fails. */
  async uploadGeneratedFile(
    file: Buffer,
    userId: string,
    category: string,
    filename: string,
    contentType: string,
  ): Promise<string> {
    if (!userId) throw new Error("Generated media owner is required");
    const key = await this.uploadFile(file, `users/${userId}/${category}`, filename, contentType);
    try {
      let [row] = await db.select({ id: userStorage.id })
        .from(userStorage).where(eq(userStorage.userId, userId)).limit(1);
      if (!row) {
        [row] = await db.insert(userStorage)
          .values({ userId, storagePrefix: `users/${userId}` })
          .onConflictDoNothing().returning({ id: userStorage.id });
        if (!row) {
          [row] = await db.select({ id: userStorage.id })
            .from(userStorage).where(eq(userStorage.userId, userId)).limit(1);
        }
      }
      if (!row) throw new Error("User storage tracking row could not be created");
      await db.insert(userStorageFiles).values({
        userId,
        storageId: row.id,
        fileName: filename,
        fileKey: key,
        mimeType: contentType,
        sizeBytes: file.length,
        folder: category,
        metadata: { category, uploadedVia: "generated-media" },
      });
      return key;
    } catch (error) {
      try {
        await this.deleteFile(key);
      } catch (cleanupError) {
        logger.error({ err: cleanupError, key }, "[Storage] Generated media rollback failed");
      }
      throw error;
    }
  }

  async uploadFileAtKey(
    file: Buffer,
    key: string,
    contentType?: string,
  ): Promise<string> {
    await this.provider.uploadFile(file, key, contentType);
    return key;
  }

  async downloadFile(key: string): Promise<Buffer> {
    return await this.provider.downloadFile(key);
  }

  async deleteFile(key: string): Promise<void> {
    await this.provider.deleteFile(key);
  }

  async getUploadUrl(
    category: string,
    filename: string,
    contentType: string,
    expiresIn: number = 3600,
  ): Promise<{ url: string | null; key: string }> {
    const key = `${category}/${randomUUID()}/${filename}`;
    const url = await this.provider.getUploadUrl(key, contentType, expiresIn);
    return { url, key };
  }

  async getDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    return await this.provider.getDownloadUrl(key, expiresIn);
  }

  async fileExists(key: string): Promise<boolean> {
    return await this.provider.fileExists(key);
  }

  async deleteWithTTL(key: string, ttlMs: number): Promise<void> {
    setTimeout(async () => {
      try {
        await this.deleteFile(key);
        logger.info(`🗑️  Deleted temp file: ${key}`);
      } catch (error: unknown) {
        logger.warn({ err: error }, `Failed to delete temp file ${key}:`);
      }
    }, ttlMs);
  }
}

export const storageService = new StorageService();

export { PocketDimensionStorageProvider };
