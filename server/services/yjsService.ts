import * as Y from 'yjs';
import { storage } from '../storage';
import crypto from 'crypto';
import { config } from '../config/defaults.js';
import { getRedisClient, createRedisClient } from '../lib/redisConnectionFactory.js';
import { logger } from '../logger.js';

// Yjs document structure:
// {
//   tracks: Y.Array of track objects
//   timeline: Y.Map with markers, automation
//   mixer: Y.Map with bus settings, volumes
//   metadata: Y.Map with project info
// }

function generateHash(data: Uint8Array): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export class YjsCollaborationService {
  private saveTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly SAVE_DEBOUNCE_MS = 2000; // Save snapshots every 2 seconds max
  private readonly REDIS_DOC_PREFIX = 'yjs:doc:';
  private readonly REDIS_TTL = 3600; // 1 hour cache TTL
  
  private subClient: any = null;
  private readonly YJS_PUBSUB_ENABLED = !!config.redis.url;
  private pubSubCallbacks: Map<string, Set<(update: Uint8Array) => void>> = new Map();

  constructor() {
    if (this.YJS_PUBSUB_ENABLED) {
      this.initPubSub().catch(err => logger.error('Failed to init YJS PubSub:', err));
    }
  }

  private async initPubSub() {
    try {
      this.subClient = await createRedisClient();
      if (this.subClient && typeof this.subClient.on === 'function') {
        this.subClient.on('message', (channel: string, message: string) => {
          if (channel.startsWith('yjs:updates:')) {
            const projectId = channel.split(':').pop();
            if (projectId) {
              const callbacks = this.pubSubCallbacks.get(projectId);
              if (callbacks) {
                const update = new Uint8Array(Buffer.from(message, 'base64'));
                callbacks.forEach(cb => cb(update));
              }
            }
          }
        });
      }
    } catch (error) {
      logger.error('YJS PubSub init error:', error);
    }
  }

  async subscribeToProjectUpdates(projectId: string, callback: (update: Uint8Array) => void) {
    if (!this.YJS_PUBSUB_ENABLED || !this.subClient) return;

    if (!this.pubSubCallbacks.has(projectId)) {
      this.pubSubCallbacks.set(projectId, new Set());
      const channel = `yjs:updates:${projectId}`;
      try {
        await this.subClient.subscribe(channel);
        logger.info(`Subscribed to YJS updates for project: ${projectId}`);
      } catch (error) {
        logger.error(`Failed to subscribe to ${channel}:`, error);
      }
    }
    this.pubSubCallbacks.get(projectId)?.add(callback);
  }

  // Load Yjs document for project
  async loadDocument(projectId: string): Promise<Y.Doc> {
    // Try to load from Redis cache first (shared across all server instances)
    const redisKey = `${this.REDIS_DOC_PREFIX}${projectId}`;
    let cachedState: string | null = null;

    try {
      const redis = await getRedisClient();
      if (redis) {
        cachedState = await redis.get(redisKey);
      }
    } catch (error: unknown) {
      // Gracefully degrade to database if Redis unavailable
    }

    const doc = new Y.Doc();

    // CRITICAL: Initialize document schema BEFORE applying updates
    // This ensures all required collections exist for clients
    doc.getArray('tracks'); // Y.Array for track objects
    doc.getMap('timeline'); // Y.Map for markers, automation
    doc.getMap('mixer'); // Y.Map for bus settings, volumes
    doc.getMap('metadata'); // Y.Map for project info

    if (cachedState) {
      // Load from Redis cache (fast path)
      try {
        const buffer = Buffer.from(cachedState, 'base64');
        Y.applyUpdate(doc, new Uint8Array(buffer));
      } catch (error: unknown) {
        logger.error('Failed to load from Redis cache:', projectId, error);
        // Fall through to database load
      }
    }

    if (!cachedState) {
      // Load from database (slow path)
      const snapshot = await storage.getLatestCollabSnapshot(projectId);
      if (snapshot && snapshot.documentState) {
        try {
          // Convert base64 string back to Uint8Array
          const buffer = Buffer.from(snapshot.documentState, 'base64');
          Y.applyUpdate(doc, new Uint8Array(buffer));

          // Cache in Redis for future requests
          try {
            const redis = await getRedisClient();
            if (redis) {
              await redis.setEx(redisKey, this.REDIS_TTL, snapshot.documentState);
            }
          } catch (error: unknown) {
            // Redis cache update failed, but document is loaded from DB
          }
        } catch (error: unknown) {
          logger.error('Failed to load snapshot for project:', projectId, error);
        }
      }
    }

    // Auto-save on changes (debounced)
    doc.on('update', async (update: Uint8Array) => {
      // PUBLISH the update to other nodes
      if (this.YJS_PUBSUB_ENABLED) {
        try {
          const redis = await getRedisClient();
          if (redis) {
            const base64Update = Buffer.from(update).toString('base64');
            await redis.publish(`yjs:updates:${projectId}`, base64Update);
          }
        } catch (error) {
          logger.warn('Failed to publish YJS update:', error);
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
          const fullDocumentState = Y.encodeStateAsUpdate(doc);

          // Convert Uint8Array to base64 string for storage
          const base64State = Buffer.from(fullDocumentState).toString('base64');

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
              await redis.setEx(redisKey, this.REDIS_TTL, base64State);
            }
          } catch (error: unknown) {
            // Redis cache update failed, but snapshot saved to DB
          }

          // Clean up old snapshots (keep last 10)
          await storage.deleteOldCollabSnapshots(projectId, 10);
        } catch (error: unknown) {
          logger.error('Failed to save collab snapshot:', error);
        }
      }, this.SAVE_DEBOUNCE_MS);

      this.saveTimers.set(projectId, timer);
    });

    return doc;
  }

  // Force save document immediately (used before unload)
  async forceSave(projectId: string, doc: Y.Doc): Promise<void> {
    try {
      const fullDocumentState = Y.encodeStateAsUpdate(doc);
      const base64State = Buffer.from(fullDocumentState).toString('base64');
      const redisKey = `${this.REDIS_DOC_PREFIX}${projectId}`;

      await storage.saveCollabSnapshot({
        projectId,
        documentState: base64State,
        snapshotHash: generateHash(fullDocumentState),
      });

      try {
        const redis = await getRedisClient();
        if (redis) {
          await redis.setEx(redisKey, this.REDIS_TTL, base64State);
        }
      } catch (error: unknown) {
        logger.warn('Redis cache update failed during force save:', projectId);
      }
    } catch (error: unknown) {
      logger.error('Failed to force save document:', projectId, error);
      throw error;
    }
  }

  // Clean up document (clear timers and optionally clear Redis cache)
  async unloadDocument(projectId: string, doc?: Y.Doc, clearCache: boolean = false) {
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
        logger.error('Failed to force save during unload:', projectId, error);
      }
    }

    // Unsubscribe from pub/sub
    if (this.YJS_PUBSUB_ENABLED && this.subClient) {
      try {
        await this.subClient.unsubscribe(`yjs:updates:${projectId}`);
        this.pubSubCallbacks.delete(projectId);
      } catch (error) {
        logger.warn(`Failed to unsubscribe from yjs:updates:${projectId}:`, error);
      }
    }

    // Optionally clear Redis cache (useful when project is deleted)
    if (clearCache) {
      try {
        const redisKey = `${this.REDIS_DOC_PREFIX}${projectId}`;
        const redis = await getRedisClient();
        if (redis) {
          await redis.del(redisKey);
        }
      } catch (error: unknown) {
        logger.warn('Redis cache clear failed:', projectId);
      }
    }
  }

  // Invalidate Redis cache for a project (forces reload from database)
  async invalidateCache(projectId: string) {
    try {
      const redisKey = `${this.REDIS_DOC_PREFIX}${projectId}`;
      const redis = await getRedisClient();
      if (redis) {
        await redis.del(redisKey);
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
        const exists = await redis.exists(redisKey);
        return exists === 1;
      }
    } catch (error: unknown) {
      // Redis unavailable, assume not cached
    }
    return false;
  }
}

export const yjsService = new YjsCollaborationService();
