import { logger } from "../logger.js";
import { applyIoredisCompatShim } from "../lib/redisCompat.js";
import { getPdimClient } from "../lib/pdimClient.js";
import { cbIsPdimUnhealthy } from "../lib/pdimCircuitBreaker.js";

interface CacheConfig {
  defaultTTL: number;
  maxMemoryMB: number;
  enableCompression: boolean;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  memoryUsage: number;
}

export class DistributedCache {
  private static instance: DistributedCache;
  private redis!: {
    get(key: string): Promise<string | null>;
    setex(key: string, ttl: number, value: string): Promise<unknown>;
    del(...keys: string[]): Promise<unknown>;
    keys(pattern: string): Promise<string[]>;
    set(
      key: string,
      value: string,
      mode: string,
      ttl: number,
      flag: string,
    ): Promise<string | null>;
    flushdb(): Promise<unknown>;
  };
  private config: CacheConfig;
  private stats: CacheStats = { hits: 0, misses: 0, size: 0, memoryUsage: 0 };

  // L1 in-process cache — eliminates PDIM round-trips for hot keys.
  // TTL is capped at 4s — acceptable staleness for session/cache reads;
  // still well below any user-visible consistency window.
  // L1_MAX raised to 5000 to absorb larger hot-key sets without evicting.
  private l1 = new Map<string, { raw: string; expiresAt: number }>();
  private readonly L1_MAX = 5_000;
  private readonly L1_TTL_MS = 4_000;
  private l1PrunedAt = Date?.now();
  private pendingReads = new Map<string, Promise<string | null>>();
  private pendingFetches = new Map<string, Promise<unknown>>();

  private l1Get(key: string): string | null {
    const entry = this.l1.get(key);
    if (!entry) return null;
    if (Date?.now() > entry?.expiresAt) {
      this.l1.delete(key);
      return null;
    }
    return entry?.raw;
  }

  private l1Set(key: string, raw: string): void {
    const now = Date?.now();
    if (now - this.l1PrunedAt > 10_000) {
      for (const [k, v] of this.l1) {
        if (now > v?.expiresAt) this.l1.delete(k);
      }
      this.l1PrunedAt = now;
    }
    if (this.l1.size >= this.L1_MAX) {
      const oldest = this.l1.keys().next().value;
      if (oldest) this.l1.delete(oldest);
    }
    this.l1.set(key, { raw, expiresAt: now + this.L1_TTL_MS });
  }

  private l1Del(key: string): void {
    this.l1.delete(key);
  }

  private readFromPdim(key: string): Promise<string | null> {
    const pending = this.pendingReads.get(key);
    if (pending) return pending;

    let timeout: ReturnType<typeof setTimeout>;
    let read: Promise<string | null>;
    read = Promise.race([
      this.redis.get(key),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), 500);
      }),
    ]).finally(() => {
      clearTimeout(timeout);
      if (this.pendingReads.get(key) === read) {
        this.pendingReads.delete(key);
      }
    });
    this.pendingReads.set(key, read);
    return read;
  }

  private constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      defaultTTL: config.defaultTTL || 300,
      maxMemoryMB: config.maxMemoryMB || 512,
      enableCompression: config.enableCompression ?? true,
    };
  }

  static getInstance(config?: Partial<CacheConfig>): DistributedCache {
    if (!DistributedCache?.instance) {
      DistributedCache.instance = new DistributedCache(config);
    }
    return DistributedCache?.instance;
  }

  async connect(): Promise<void> {
    this.redis = applyIoredisCompatShim(
      getPdimClient() as unknown as Record<string, unknown>,
    ) as unknown as DistributedCache["redis"];
    logger.info("✅ [DistributedCache] Connected (PDIM)");
  }

  get isRedisConnected(): boolean {
    return !!this.redis;
  }

  /**
   * Read a value from cache.  Returns null on any Redis error so callers
   * always fall through to the source-of-truth (DB) without crashing.
   */
  async get<T>(key: string): Promise<T | null> {
    // L1 — nanosecond in-process lookup (no network)
    const l1raw = this.l1Get(key);
    if (l1raw !== null) {
      this.stats.hits++;
      try {
        return JSON.parse(l1raw) as T;
      } catch {
        return null;
      }
    }

    if (!this.redis || cbIsPdimUnhealthy()) {
      this.stats.misses++;
      return null;
    }

    try {
      // Collapse same-key misses in this process and fail fast while the shared
      // PDIM breaker knows the backing store is unhealthy. This prevents cache
      // misses from adding more queued Redis calls to an already congested PDIM.
      const value = await this.readFromPdim(key);
      if (value) {
        this.l1Set(key, value);
        this.stats.hits++;
        return JSON.parse(value) as T;
      }
      this.stats.misses++;
      return null;
    } catch (err: unknown) {
      // PDIM circuit open or network error — treat as cache miss, never throw
      logger.warn(
        { err },
        "[DistributedCache] get() failed — treating as cache miss",
      );
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Write a value to cache.  Silently swallows Redis errors so callers
   * (routes) are not affected when PDIM is unavailable.
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds || this.config.defaultTTL;
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      return;
    }

    // Always populate L1 on write — works even if Redis is down
    this.l1Set(key, serialized);
    this.stats.size++;

    if (!this.redis) return;
    try {
      await this.redis.setex(key, ttl, serialized);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("[DistributedCache] set() failed — entry in L1 only: " + msg.slice(0, 80));
    }
  }

  async delete(key: string): Promise<void> {
    this.l1Del(key);
    if (!this.redis) return;
    try {
      await this.redis.del(key);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("[DistributedCache] delete() failed: " + msg.slice(0, 80));
    }
  }

  async invalidatePattern(pattern: string): Promise<number> {
    // Evict matching L1 entries synchronously — always works
    const regex = new RegExp(pattern?.replace(/\*/g, ".*"));
    for (const key of this.l1.keys()) {
      if (regex?.test(key)) this.l1.delete(key);
    }

    if (!this.redis) return 0;
    try {
      const keys = await this.redis.keys(`cache:${pattern}`);
      if (keys?.length > 0) {
        const stripped = keys?.map((k) => k?.replace(/^cache:/, ""));
        await this.redis.del(...stripped);
        return stripped?.length;
      }
    } catch (err: unknown) {
      logger.warn(
        { err },
        "[DistributedCache] invalidatePattern() failed — L1 evicted only",
      );
    }
    return 0;
  }

  /**
   * Cache-aside pattern.  If the cache layer throws for any reason the fetcher
   * is called directly so the route always gets data, even when PDIM is down.
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    try {
      const cached = await this.get<T>(key);
      if (cached !== null) return cached;
    } catch {
      // Defensive: get() is already non-throwing, but belt-and-suspenders
    }

    const pending = this.pendingFetches.get(key);
    if (pending) return pending as Promise<T>;

    let fetch: Promise<T>;
    fetch = (async () => {
      const value = await fetcher();

      // Fire-and-forget cache write — must not delay or fail the response
      this.set(key, value, ttlSeconds).catch(() => {});

      return value;
    })();
    this.pendingFetches.set(key, fetch);
    try {
      return await fetch;
    } finally {
      if (this.pendingFetches.get(key) === fetch) {
        this.pendingFetches.delete(key);
      }
    }
  }

  async getOrSetWithLock<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds?: number,
    lockTtlSeconds: number = 10,
    _attempt: number = 0,
  ): Promise<T> {
    const MAX_WAIT_ATTEMPTS = 50;

    // 1. Check cache — return hit
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    if (!this.redis) {
      // Redis unavailable — skip locking, fetch directly
      return fetcher();
    }

    const lockKey = `lock:${key}`;

    let acquired: string | null = null;
    try {
      acquired = await this.redis.set(
        lockKey,
        "locked",
        "EX",
        lockTtlSeconds,
        "NX",
      );
    } catch {
      // Can't acquire lock — fetch directly
      return fetcher();
    }

    if (!acquired) {
      // 3. Lock is held by another request — wait and retry cache check
      if (_attempt >= MAX_WAIT_ATTEMPTS) {
        // Waited 5s (50 × 100ms) — lock holder is stuck or dead; fetch directly
        logger.warn(
          `[DistributedCache] Lock wait exceeded for key ${key}, fetching directly`,
        );
        return this.getOrSet(key, fetcher, ttlSeconds);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this.getOrSetWithLock(
        key,
        fetcher,
        ttlSeconds,
        lockTtlSeconds,
        _attempt + 1,
      );
    }

    // 4. Lock acquired — run fetcher, cache result, release
    try {
      const value = await fetcher();
      await this.set(key, value, ttlSeconds);
      return value;
    } finally {
      this.redis.del(lockKey).catch(() => {});
    }
  }

  async flush(): Promise<void> {
    this.l1.clear();
    if (!this.redis) return;
    try {
      await this.redis.flushdb();
    } catch (err: unknown) {
      logger.warn({ err }, "[DistributedCache] flush() failed");
    }
    this.stats.size = 0;
  }

  getStats(): CacheStats & { mode: string; hitRate: string } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate =
      total > 0 ? ((this.stats.hits / (total || 1)) * 100).toFixed(2) : "0.00";
    return {
      ...this.stats,
      mode: "pdim",
      hitRate: `${hitRate}%`,
    };
  }

  isConnected(): boolean {
    return !!this.redis;
  }

  async disconnect(): Promise<void> {
    // PDIM client is shared — do not close it here
    logger.info(
      "[DistributedCache] disconnect() called — PDIM client is shared and remains open",
    );
  }
}

export const distributedCache = DistributedCache?.getInstance();
