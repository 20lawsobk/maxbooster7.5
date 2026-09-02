/**
 * USER POCKET DIMENSION SERVICE
 *
 * Creates and manages a personal Pocket Dimension storage space per Redis instance.
 * Each instance gets its own isolated, compressed, deduplicated storage namespace.
 */

import { pocketManager, PocketDimension } from "../pocket-dimension/index.js";
import { db } from "../lib/db.js";
import { userStorage, userStorageFiles } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../logger.js";
import { createHash, randomBytes } from "crypto";

const DEFAULT_QUOTA_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

export class UserPocketDimensionService {
  private static instance: UserPocketDimensionService;
  private activePockets = new Map<string, PocketDimension>();

  private constructor() {}

  static getInstance(): UserPocketDimensionService {
    if (!UserPocketDimensionService.instance) {
      UserPocketDimensionService.instance = new UserPocketDimensionService();
    }
    return UserPocketDimensionService.instance;
  }

  /** Initialize storage space for a new user/instance. */
  async initializeUserStorage(
    userId: string,
    label: string,
  ): Promise<typeof userStorage.$inferSelect> {
    const storagePrefix = this.generateStoragePrefix(userId);
    const encryptionKey = this.generateEncryptionKey(userId);

    const pocket = await pocketManager.openPocket(`user-${userId}`, {
      encryptionKey,
      compressionLevel: 9,
      enableDeduplication: true,
      enableVersioning: true,
      chunkSize: 32 * 1024 * 1024,
    });

    await pocket.write(
      ".pocket-init",
      JSON.stringify({
        createdAt: new Date().toISOString(),
        userId,
        label,
        version: "1.0.0",
      }),
    );

    for (const folder of ["files", "data", "models", "exports", "temp"]) {
      await pocket.write(`${folder}/.keep`, "");
    }

    const [storage] = await db
      .insert(userStorage)
      .values({
        userId,
        storagePrefix,
        totalBytes: 0,
        fileCount: 0,
        quotaBytes: DEFAULT_QUOTA_BYTES,
        isActive: true,
        lastAccessedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();

    this.activePockets.set(userId, pocket);
    logger.info(
      `[PocketDimension] Created storage space for ${label} (${userId})`,
    );
    return storage;
  }

  /** Get or open a user's pocket dimension. */
  async getUserPocket(userId: string): Promise<PocketDimension | null> {
    if (this.activePockets.has(userId)) return this.activePockets.get(userId)!;

    const [storage] = await db
      .select()
      .from(userStorage)
      .where(eq(userStorage.userId, userId));

    if (!storage?.isActive) return null;

    try {
      const pocket = await pocketManager.openPocket(`user-${userId}`);
      this.activePockets.set(userId, pocket);
      await db
        .update(userStorage)
        .set({ lastAccessedAt: new Date() })
        .where(eq(userStorage.userId, userId));
      return pocket;
    } catch (err) {
      logger.error(
        `[PocketDimension] Failed to open pocket for ${userId}:`,
        err,
      );
      return null;
    }
  }

  /** Store a file in a user's pocket dimension. */
  async storeFile(
    userId: string,
    fileName: string,
    data: Buffer,
    options?: {
      folder?: string;
      mimeType?: string;
      isPublic?: boolean;
      metadata?: Record<string, unknown>;
    },
  ): Promise<{ fileKey: string; sizeBytes: number; compressedSize: number }> {
    const pocket = await this.getUserPocket(userId);
    if (!pocket) throw new Error(`No active storage for user ${userId}`);

    const folder = options?.folder ?? "files";
    const fileKey = `${folder}/${createHash("sha256")
      .update(fileName + Date.now())
      .digest("hex")
      .slice(0, 12)}-${fileName}`;

    await pocket.write(fileKey, data);

    const [storage] = await db
      .select()
      .from(userStorage)
      .where(eq(userStorage.userId, userId));
    if (storage) {
      await db
        .insert(userStorageFiles)
        .values({
          userId,
          storageId: storage.id,
          fileName,
          fileKey,
          mimeType: options?.mimeType,
          sizeBytes: data.length,
          compressedSize: Math.round(data.length * 0.4), // estimate
          contentHash: createHash("sha256").update(data).digest("hex"),
          folder,
          isPublic: options?.isPublic ?? false,
          metadata: options?.metadata ?? {},
        })
        .onConflictDoNothing();

      await db
        .update(userStorage)
        .set({
          totalBytes: storage.totalBytes + data.length,
          fileCount: storage.fileCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(userStorage.userId, userId));
    }

    return {
      fileKey,
      sizeBytes: data.length,
      compressedSize: Math.round(data.length * 0.4),
    };
  }

  /** Read a file from a user's pocket dimension. */
  async readFile(userId: string, fileKey: string): Promise<Buffer | null> {
    const pocket = await this.getUserPocket(userId);
    if (!pocket) return null;
    try {
      const data = await pocket.read(fileKey);
      return data ? (Buffer.isBuffer(data) ? data : Buffer.from(data)) : null;
    } catch {
      return null;
    }
  }

  /** Delete a file from a user's pocket dimension. */
  async deleteFile(userId: string, fileKey: string): Promise<boolean> {
    const pocket = await this.getUserPocket(userId);
    if (!pocket) return false;

    await pocket.delete(fileKey);
    await db
      .delete(userStorageFiles)
      .where(eq(userStorageFiles.fileKey, fileKey));

    const [storage] = await db
      .select()
      .from(userStorage)
      .where(eq(userStorage.userId, userId));
    if (storage) {
      await db
        .update(userStorage)
        .set({
          fileCount: Math.max(0, storage.fileCount - 1),
          updatedAt: new Date(),
        })
        .where(eq(userStorage.userId, userId));
    }
    return true;
  }

  /** List files stored by a user. */
  async listFiles(
    userId: string,
  ): Promise<(typeof userStorageFiles.$inferSelect)[]> {
    return db
      .select()
      .from(userStorageFiles)
      .where(eq(userStorageFiles.userId, userId));
  }

  /** Get storage stats for a user. */
  async getStorageStats(
    userId: string,
  ): Promise<typeof userStorage.$inferSelect | null> {
    const [storage] = await db
      .select()
      .from(userStorage)
      .where(eq(userStorage.userId, userId));
    return storage ?? null;
  }

  /** Store fine-tune delta weights for a user. */
  async saveFinetuneData(userId: string, deltaBytes: Buffer): Promise<void> {
    const pocket = await this.getUserPocket(userId);
    if (!pocket) return;
    await pocket.write("models/fine-tune-delta.bin", deltaBytes);
    logger.info(
      `[PocketDimension] Saved fine-tune delta (${deltaBytes.length} B) for ${userId}`,
    );
  }

  async getFinetuneData(userId: string): Promise<Buffer | null> {
    const pocket = await this.getUserPocket(userId);
    if (!pocket) return null;
    try {
      const data = await pocket.read("models/fine-tune-delta.bin");
      return data ? (Buffer.isBuffer(data) ? data : Buffer.from(data)) : null;
    } catch {
      return null;
    }
  }

  async closeUserPocket(userId: string): Promise<void> {
    if (this.activePockets.has(userId)) {
      await pocketManager.closePocket(`user-${userId}`);
      this.activePockets.delete(userId);
    }
  }

  private generateStoragePrefix(userId: string): string {
    return `pd-${createHash("sha256").update(userId).digest("hex").slice(0, 12)}`;
  }

  private generateEncryptionKey(userId: string): string {
    const salt = randomBytes(32).toString("hex");
    const secret =
      process.env.SESSION_SECRET ?? randomBytes(32).toString("hex");
    return createHash("sha512")
      .update(`${secret}:${salt}:${userId}:${Date.now()}`)
      .digest("hex")
      .slice(0, 64);
  }
}

export const userPocketService = UserPocketDimensionService.getInstance();
