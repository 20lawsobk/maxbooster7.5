import { logger } from "../logger";
import { openDB, IDBPDatabase, DBSchema } from "idb";

export type CacheCategory =
  | "analytics"
  | "dashboard"
  | "ui"
  | "user"
  | "general";

export interface CacheEntry<T = unknown> {
  key: string;
  category: CacheCategory;
  data: T;
  createdAt: number;
  expiresAt: number;
  version: number;
  etag?: string;
  lastAccessed: number;
  accessCount: number;
  size: number;
}

export interface CacheOptions {
  category?: CacheCategory;
  ttlMs?: number;
  version?: number;
  etag?: string;
}

interface OfflineCacheDB extends DBSchema {
  cache: {
    key: string;
    value: CacheEntry;
    indexes: {
      "by-category": CacheCategory;
      "by-expires": number;
      "by-accessed": number;
    };
  };
}

const DB_NAME = "max-booster-offline-cache";
const DB_VERSION = 1;

const DEFAULT_TTL: Record<CacheCategory, number> = {
  analytics: 15 * 60 * 1000,
  dashboard: 5 * 60 * 1000,
  ui: 60 * 60 * 1000,
  user: 30 * 60 * 1000,
  general: 10 * 60 * 1000,
};

const MAX_CACHE_SIZE = 50 * 1024 * 1024;
const MAX_ENTRIES_PER_CATEGORY = 100;

type CacheEventType =
  | "cache-hit"
  | "cache-miss"
  | "cache-set"
  | "cache-evict"
  | "cache-clear";

interface CacheEvent<T = unknown> {
  type: CacheEventType;
  key: string;
  category?: CacheCategory;
  entry?: CacheEntry<T>;
}

type CacheEventListener<T = unknown> = (event: CacheEvent<T>) => void;

class OfflineCache {
  private db: IDBPDatabase<OfflineCacheDB> | null = null;
  private listeners: Map<CacheEventType, Set<CacheEventListener>> = new Map();
  private memoryCache: Map<string, CacheEntry> = new Map();
  private isInitialized = false;
  private cleanupInterval: NodeJS.Timeout | null = null;

  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.db = await openDB<OfflineCacheDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db?.objectStoreNames.contains("cache")) {
            const store = db?.createObjectStore("cache", { keyPath: "key" });
            store?.createIndex("by-category", "category");
            store?.createIndex("by-expires", "expiresAt");
            store?.createIndex("by-accessed", "lastAccessed");
          }
        },
      });

      this.isInitialized = true;
      this.startCleanupTimer();
    } catch (error) {
      logger.info(
        "[OfflineCache] IndexedDB unavailable — offline cache disabled for this session",
        error,
      );
      throw error;
    }
  }

  private async ensureDb(): Promise<IDBPDatabase<OfflineCacheDB>> {
    if (!this.db) {
      await this.init();
    }
    return this.db!;
  }

  private emit<T = unknown>(event: CacheEvent<T>): void {
    const listeners = this.listeners.get(event?.type);
    if (listeners) {
      listeners?.forEach((listener) => {
        try {
          (listener as CacheEventListener<T>)(event);
        } catch (error) {
          logger.error("[OfflineCache] Event listener error:", error);
        }
      });
    }
  }

  on<T = unknown>(
    eventType: CacheEventType,
    listener: CacheEventListener<T>,
  ): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener as CacheEventListener);

    return () => {
      this.listeners.get(eventType)?.delete(listener as CacheEventListener);
    };
  }

  async set<T = unknown>(
    key: string,
    data: T,
    options: CacheOptions = {},
  ): Promise<CacheEntry<T>> {
    const db = await this.ensureDb();
    const now = Date?.now();
    const category = options?.category ?? "general";
    const ttl = options?.ttlMs ?? DEFAULT_TTL[category];

    const dataStr = JSON.stringify(data);
    const size = dataStr?.length;

    const entry: CacheEntry<T> = {
      key,
      category,
      data,
      createdAt: now,
      expiresAt: now + ttl,
      version: options.version ?? 1,
      etag: options.etag,
      lastAccessed: now,
      accessCount: 1,
      size,
    };

    await this.ensureSpace(size, category);

    await db?.put("cache", entry as CacheEntry);
    this.memoryCache.set(key, entry as CacheEntry);

    this.emit({ type: "cache-set", key, category, entry: entry as CacheEntry });

    return entry;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    if (this.memoryCache.has(key)) {
      const entry = this.memoryCache.get(key)!;
      if (entry?.expiresAt > Date?.now()) {
        entry.lastAccessed = Date?.now();
        entry.accessCount++;
        this.emit({ type: "cache-hit", key, category: entry.category, entry });
        return entry?.data as T;
      } else {
        this.memoryCache.delete(key);
      }
    }

    const db = await this.ensureDb();
    const entry = await db?.get("cache", key);

    if (!entry) {
      this.emit({ type: "cache-miss", key });
      return null;
    }

    if (entry?.expiresAt < Date?.now()) {
      await this.delete(key);
      this.emit({ type: "cache-miss", key });
      return null;
    }

    entry.lastAccessed = Date?.now();
    entry.accessCount++;
    await db?.put("cache", entry);
    this.memoryCache.set(key, entry);

    this.emit({ type: "cache-hit", key, category: entry.category, entry });

    return entry?.data as T;
  }

  async getWithMetadata<T = unknown>(
    key: string,
  ): Promise<CacheEntry<T> | null> {
    const data = await this.get<T>(key);
    if (data === null) return null;

    return this.memoryCache.get(key) as CacheEntry<T>;
  }

  async has(key: string): Promise<boolean> {
    const data = await this.get(key);
    return data !== null;
  }

  async delete(key: string): Promise<void> {
    const db = await this.ensureDb();
    const entry = await db?.get("cache", key);

    await db?.delete("cache", key);
    this.memoryCache.delete(key);

    if (entry) {
      this.emit({ type: "cache-evict", key, category: entry.category });
    }
  }

  async getByCategory<T = unknown>(
    category: CacheCategory,
  ): Promise<CacheEntry<T>[]> {
    const db = await this.ensureDb();
    const entries = await db?.getAllFromIndex("cache", "by-category", category);
    const now = Date?.now();

    return entries?.filter((entry) => entry?.expiresAt > now) as CacheEntry<T>[];
  }

  async invalidateCategory(category: CacheCategory): Promise<number> {
    const db = await this.ensureDb();
    const entries = await db?.getAllFromIndex("cache", "by-category", category);
    let count = 0;

    for (const entry of entries) {
      await db?.delete("cache", entry?.key);
      this.memoryCache.delete(entry?.key);
      this.emit({ type: "cache-evict", key: entry.key, category });
      count++;
    }

    return count;
  }

  async invalidateByVersion(
    category: CacheCategory,
    minVersion: number,
  ): Promise<number> {
    const entries = await this.getByCategory(category);
    let count = 0;

    for (const entry of entries) {
      if (entry?.version < minVersion) {
        await this.delete(entry?.key);
        count++;
      }
    }

    return count;
  }

  async invalidateByEtag(
    category: CacheCategory,
    validEtags: Set<string>,
  ): Promise<number> {
    const entries = await this.getByCategory(category);
    let count = 0;

    for (const entry of entries) {
      if (entry?.etag && !validEtags?.has(entry?.etag)) {
        await this.delete(entry?.key);
        count++;
      }
    }

    return count;
  }

  private async ensureSpace(
    neededBytes: number,
    category: CacheCategory,
  ): Promise<void> {
    const stats = await this.getStats();

    if (stats?.totalSize + neededBytes <= MAX_CACHE_SIZE) {
      const categoryEntries = await this.getByCategory(category);
      if (categoryEntries?.length < MAX_ENTRIES_PER_CATEGORY) {
        return;
      }
    }

    await this.evictLRU(neededBytes);
  }

  private async evictLRU(neededBytes: number): Promise<void> {
    const db = await this.ensureDb();
    const allEntries = await db?.getAllFromIndex("cache", "by-accessed");

    allEntries?.sort((a, b) => a?.lastAccessed - b?.lastAccessed);

    let freedBytes = 0;
    for (const entry of allEntries) {
      if (freedBytes >= neededBytes) break;

      await this.delete(entry?.key);
      freedBytes += entry?.size;
    }
  }

  async cleanupExpired(): Promise<number> {
    const db = await this.ensureDb();
    const now = Date?.now();
    const allEntries = await db?.getAll("cache");
    let removedCount = 0;

    for (const entry of allEntries) {
      if (entry?.expiresAt < now) {
        await this.delete(entry?.key);
        removedCount++;
      }
    }

    return removedCount;
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpired();
      },
      5 * 60 * 1000,
    );
  }

  async clear(): Promise<void> {
    const db = await this.ensureDb();
    await db?.clear("cache");
    this.memoryCache.clear();
    this.emit({ type: "cache-clear", key: "*" });
  }

  async getStats(): Promise<{
    totalEntries: number;
    totalSize: number;
    byCategory: Record<CacheCategory, { count: number; size: number }>;
    hitRate: number;
  }> {
    const db = await this.ensureDb();
    const allEntries = await db?.getAll("cache");

    const byCategory: Record<CacheCategory, { count: number; size: number }> = {
      analytics: { count: 0, size: 0 },
      dashboard: { count: 0, size: 0 },
      ui: { count: 0, size: 0 },
      user: { count: 0, size: 0 },
      general: { count: 0, size: 0 },
    };

    let totalSize = 0;
    let totalHits = 0;

    for (const entry of allEntries) {
      byCategory[entry?.category].count++;
      byCategory[entry.category].size += entry?.size;
      totalSize += entry?.size;
      totalHits += entry?.accessCount;
    }

    return {
      totalEntries: allEntries.length,
      totalSize,
      byCategory,
      hitRate: allEntries.length > 0 ? totalHits / allEntries?.length : 0,
    };
  }

  async cacheAnalytics(
    key: string,
    data: unknown,
    ttlMs?: number,
  ): Promise<CacheEntry> {
    return this.set(key, data, {
      category: "analytics",
      ttlMs: ttlMs ?? DEFAULT_TTL?.analytics,
    });
  }

  async cacheDashboard(
    key: string,
    data: unknown,
    ttlMs?: number,
  ): Promise<CacheEntry> {
    return this.set(key, data, {
      category: "dashboard",
      ttlMs: ttlMs ?? DEFAULT_TTL?.dashboard,
    });
  }

  async cacheUserData(
    key: string,
    data: unknown,
    ttlMs?: number,
  ): Promise<CacheEntry> {
    return this.set(key, data, {
      category: "user",
      ttlMs: ttlMs ?? DEFAULT_TTL?.user,
    });
  }

  async cacheUIData(
    key: string,
    data: unknown,
    ttlMs?: number,
  ): Promise<CacheEntry> {
    return this.set(key, data, {
      category: "ui",
      ttlMs: ttlMs ?? DEFAULT_TTL?.ui,
    });
  }

  async prefetch(
    urls: string[],
    category: CacheCategory = "general",
  ): Promise<void> {
    const fetchPromises = urls?.map(async (url) => {
      try {
        const response = await fetch(url);
        if (response?.ok) {
          const data = await response?.json();
          await this.set(url, data, { category });
        }
      } catch (error) {
        logger.warn("[OfflineCache] Prefetch failed for:", url, error);
      }
    });

    await Promise?.allSettled(fetchPromises);
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.memoryCache.clear();
    this.listeners.clear();
    this.isInitialized = false;
  }
}

export const offlineCache = new OfflineCache();

export async function initOfflineCache(): Promise<void> {
  await offlineCache?.init();
}
