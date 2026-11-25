// @ts-nocheck
import * as Y from "yjs";
import { storage } from "../storage";
import crypto from "crypto";
import {
  getRedisClient,
  createRedisClient,
} from "../lib/redisConnectionFactory.js";
import { isPdimConfigured } from "../lib/pdimClient.js";
import { logger } from "../logger.js";

// Yjs document structure:
// {
//   tracks: Y.Array of track objects
//   timeline: Y.Map with markers, automation
//   mixer: Y.Map with bus settings, volumes
//   metadata: Y.Map with project info
// }

function generateHash(data: Uint8Array): string {
  return crypto?.createHash("sha256").update(data).digest("hex");
}

export const REMOTE_YJS_UPDATE_ORIGIN = Symbol.for(
  "maxbooster.yjs.remote-pubsub",
);

export class YjsCollaborationService {
  private saveTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly SAVE_DEBOUNCE_MS = 2000; // Save snapshots every 2 seconds max
  private readonly REDIS_DOC_PREFIX = "yjs:doc:";
  private readonly REDIS_TTL = 3600; // 1 hour cache TTL

  private subClient: Record<string, unknown> | null = null;
  private readonly YJS_PUBSUB_ENABLED = isPdimConfigured();
  private pubSubInitPromise: Promise<void> = Promise.resolve();
  private pubSubCallbacks: Map<string, Set<(update: Uint8Array) => void>> =
    new Map();
  private projectSubscriptions: Map<string, Promise<void>> = new Map();
  private subscribedProjects: Set<string> = new Set();

  constructor() {
    if (this.YJS_PUBSUB_ENABLED) {
      this.pubSubInitPromise = this.initPubSub();
      void this.pubSubInitPromise.catch((err) =>
        logger.warn({ err }, "Failed to init YJS PubSub:"),
      );
    }
  }

  private async initPubSub() {
    const subscriber = await createRedisClient();
    if (
      !subscriber ||
      typeof (subscriber as any).on !== "function" ||
      typeof (subscriber as any).subscribe !== "function"
    ) {
      throw new Error("PDIM Pub/Sub subscriber is unavailable");
    }

    this.subClient = subscriber as Record<string, unknown>;
    (this.subClient as any).on(
      "message",
      (channel: string, message: string) => {
        if (!channel?.startsWith("yjs:updates:")) return;
        const projectId = channel.slice("yjs:updates:".length);
        if (!projectId) return;

        const callbacks = this.pubSubCallbacks.get(projectId);
        if (!callbacks?.size) return;

        try {
          const update = new Uint8Array(Buffer.from(message, "base64"));
          for (const callback of callbacks) {
            try {
              callback(update);
            } catch (error) {
              logger.warn(
                { err: error, projectId },
                "Failed to apply cross-instance Yjs update:",
              );
            }
          }
        } catch (error) {
          logger.warn(
            { err: error, projectId },
            "Failed to decode cross-instance Yjs update:",
          );
        }
      },
    );
  }

  async subscribeToProjectUpdates(
    projectId: string,
    callback: (update: Uint8Array) => void,
  ) {
    if (!this.YJS_PUBSUB_ENABLED) {
      throw new Error("PDIM is required for cross-instance collaboration");
    }

    await this.pubSubInitPromise;
    if (!this.subClient) {
      throw new Error("PDIM Pub/Sub is not ready for collaboration");
    }

    let callbacks = this.pubSubCallbacks.get(projectId);
    if (!callbacks) {
      callbacks = new Set();
      this.pubSubCallbacks.set(projectId, callbacks);
    }
    callbacks.add(callback);

    if (this.subscribedProjects.has(projectId)) return;

    let subscription = this.projectSubscriptions.get(projectId);
    if (!subscription) {
      const channel = `yjs:updates:${projectId}`;
      subscription = Promise.resolve()
        .then(() => (this.subClient as any).subscribe(channel))
        .then(() => {
          this.subscribedProjects.add(projectId);
          logger.info(`Subscribed to YJS updates for project: ${projectId}`);
        });
      this.projectSubscriptions.set(projectId, subscription);
    }

    try {
      await subscription;
    } catch (error) {
      callbacks.delete(callback);
      if (callbacks.size === 0) this.pubSubCallbacks.delete(projectId);
      logger.warn(
        { err: error, projectId },
        "Failed to subscribe to cross-instance Yjs updates:",
      );
      throw error;
    } finally {
      if (this.projectSubscriptions.get(projectId) === subscription) {
        this.projectSubscriptions.delete(projectId);
      }
    }
  }

  // Load Yjs document for project
  async loadDocument(projectId: string): Promise<Y.Doc> {
    // Try to load from Redis cache first (shared across all server instances)
    const redisKey = `${this.REDIS_DOC_PREFIX}${projectId}`;
    let cachedState: string | null = null;

    try {
      const redis = await getRedisClient();
      if (redis) {
        cachedState = await (redis as any)?.get(redisKey);
      }
    } catch (error: unknown) {
      // Redis is a cache; the database below is the authoritative source, so
      // falling through is correct. Still log — a chronically failing cache
      // read should be visible, not invisible just because it isn't fatal.
      logger.warn("Redis cache read failed, falling back to database:", projectId, error);
    }

    const doc = new Y.Doc();

    // CRITICAL: Initialize document schema BEFORE applying updates
    // This ensures all required collections exist for clients
    doc?.getArray("tracks"); // Y.Array for track objects
    doc?.getMap("timeline"); // Y.Map for markers, automation
    doc?.getMap("mixer"); // Y.Map for bus settings, volumes
    doc?.getMap("metadata"); // Y.Map for project info

    if (cachedState) {
      // Load from Redis cache (fast path)
      try {
        const buffer = Buffer?.from(cachedState, "base64");
        Y?.applyUpdate(doc, new Uint8Array(buffer));
      } catch (error: unknown) {
        logger.warn("Failed to load from Redis cache:", projectId, error);
        // Fall through to database load
      }
    }

    if (!cachedState) {
      // Load from database (slow path)
      const snapshot = await storage.getLatestCollabSnapshot(projectId);
      if (snapshot && snapshot?.documentState) {
        try {
          // Convert base64 string back to Uint8Array
          const buffer = Buffer?.from(snapshot?.documentState, "base64");
          Y?.applyUpdate(doc, new Uint8Array(buffer));

          // Cache in Redis for future requests
          try {
            const redis = await getRedisClient();
            if (redis) {
              await (redis as any)?.setEx(
                redisKey,
                this.REDIS_TTL,
                snapshot?.documentState,
              );
            }
          } catch (error: unknown) {
            // The document itself loaded fine from DB — this only means the
            // next request will also miss cache. Log it; silent, repeated
            // cache-write failures are exactly the kind of thing an operator
            // needs to see to notice Redis is unhealthy.
            logger.warn("Redis cache write-back failed for project:", projectId, error);
          }
        } catch (error: unknown) {
          logger.warn("Failed to load snapshot for project:", projectId, error);
        }
      }
    }

    // Auto-save on changes (debounced)
    doc?.on("update", async (update: Uint8Array, origin: unknown) => {
      // PUBLISH the update to other nodes
      if (
        this.YJS_PUBSUB_ENABLED &&
        origin !== REMOTE_YJS_UPDATE_ORIGIN
      ) {
        try {
          await this.pubSubInitPromise;
          const redis = await getRedisClient();
          if (redis) {
            const base64Update = Buffer?.from(update).toString("base64");
            await (redis as any)?.publish(`yjs:updates:${projectId}`, base64Update);
          }
        } catch (error) {
          logger.warn({ err: error }, "Failed to publish YJS update:");
        }
      }

      // Clear existing timer
      const existingTimer = this.saveTimers.get(projectId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set new timer to save after debounce period
      const timer = setTimeout(async () => {
        try {
          // CRITICAL: Encode FULL document state, not just the incremental update
          const fullDocumentState = Y?.encodeStateAsUpdate(doc);

          // Convert Uint8Array to base64 string for storage
          const base64State = Buffer?.from(fullDocumentState).toString("base64");

          // Save to database (persistent)
          await storage.saveCollabSnapshot({
            projectId,
            documentState: base64State,
            snapshotHash: generateHash(fullDocumentState),
          });

          // Update Redis cache (shared across instances)
          try {
            const redis = await getRedisClient();
            if (redis) {
              await (redis as any)?.setEx(redisKey, this.REDIS_TTL, base64State);
            }
          } catch (error: unknown) {
            // Redis cache update failed, but snapshot saved to DB
          }

          // Clean up old snapshots (keep last 10)
          await storage.deleteOldCollabSnapshots(projectId, 10);
        } catch (error: unknown) {
          logger.warn({ err: error }, "Failed to save collab snapshot:");
        }
      }, this.SAVE_DEBOUNCE_MS);

      this.saveTimers.set(projectId, timer);
    });

    return doc;
  }

  // Force save document immediately (used before unload)
  async forceSave(projectId: string, doc: Y.Doc): Promise<void> {
    try {
      const fullDocumentState = Y?.encodeStateAsUpdate(doc);
      const base64State = Buffer?.from(fullDocumentState).toString("base64");
      const redisKey = `${this.REDIS_DOC_PREFIX}${projectId}`;

      await storage.saveCollabSnapshot({
        projectId,
        documentState: base64State,
        snapshotHash: generateHash(fullDocumentState),
      });

      try {
        const redis = await getRedisClient();
        if (redis) {
          await (redis as any)?.setEx(redisKey, this.REDIS_TTL, base64State);
        }
      } catch (error: unknown) {
        logger.warn({ value: projectId }, "Redis cache update failed during force save:");
      }
    } catch (error: unknown) {
      logger.warn("Failed to force save document:", projectId, error);
      throw error;
    }
  }

  // Clean up document (clear timers and optionally clear Redis cache)
  async unloadDocument(
    projectId: string,
    doc?: Y.Doc,
    clearCache: boolean = false,
  ) {
    // Clear pending save timer first
    const timer = this.saveTimers.get(projectId);
    if (timer) {
      clearTimeout(timer);
      this.saveTimers.delete(projectId);
    }

    // Force save before unload to ensure no data loss
    if (doc) {
      try {
        await this.forceSave(projectId, doc);
      } catch (error: unknown) {
        logger.warn("Failed to force save during unload:", projectId, error);
      }
    }

    // Unsubscribe only after any in-flight subscribe has settled.
    const subscription = this.projectSubscriptions.get(projectId);
    if (subscription) await subscription.catch(() => undefined);

    if (this.YJS_PUBSUB_ENABLED && this.subClient) {
      try {
        const callbacks = this.pubSubCallbacks.get(projectId);
        this.pubSubCallbacks.delete(projectId);
        if (callbacks || this.subscribedProjects.has(projectId)) {
          await (this.subClient as any).unsubscribe(
            `yjs:updates:${projectId}`,
          );
        }
        this.subscribedProjects.delete(projectId);
        this.projectSubscriptions.delete(projectId);
      } catch (error) {
        logger.warn(
          { err: error },
          `Failed to unsubscribe from yjs:updates:${projectId}:`,
        );
      }
    }

    // Optionally clear Redis cache (useful when project is deleted)
    if (clearCache) {
      try {
        const redisKey = `${this.REDIS_DOC_PREFIX}${projectId}`;
        const redis = await getRedisClient();
        if (redis) {
          await (redis as any)?.del(redisKey);
        }
      } catch (error: unknown) {
        logger.warn({ value: projectId }, "Redis cache clear failed:");
      }
    }
  }

  // Invalidate Redis cache for a project (forces reload from database)
  async invalidateCache(projectId: string) {
    try {
      const redisKey = `${this.REDIS_DOC_PREFIX}${projectId}`;
      const redis = await getRedisClient();
      if (redis) {
        await (redis as any)?.del(redisKey);
      }
    } catch (error: unknown) {
      // Redis cache clear failed, not critical
    }
  }

  // Check if document exists in Redis cache
  async isCached(projectId: string): Promise<boolean> {
    try {
      const redisKey = `${this.REDIS_DOC_PREFIX}${projectId}`;
      const redis = await getRedisClient();
      if (redis) {
        const exists = await (redis as any)?.exists(redisKey);
        return exists === 1;
      }
    } catch (error: unknown) {
      // Redis unavailable, assume not cached
    }
    return false;
  }
}

export const yjsService = new YjsCollaborationService();
