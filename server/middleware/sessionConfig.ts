import session from 'express-session';
import { RedisStore } from 'connect-redis';
import connectPgSimple from 'connect-pg-simple';
import crypto from 'crypto';
import { getRedisClient } from '../lib/redisClient.js';
import { logger } from '../logger.js';

const PgSessionStore = connectPgSimple(session);

/**
 * In-process session cache — eliminates repeated PDIM/Postgres lookups when
 * PDIM is rate-limited or slow.  Each session is fetched from the backing
 * store at most once per L1_TTL_MS window.  set()/destroy() immediately
 * invalidate the cache entry so auth state changes (login, logout) take
 * effect instantly — there is no risk of a user staying logged in after
 * logout due to this cache.
 *
 * Sizing: 5 000 entries × ~2 KB average session ≈ 10 MB max — negligible.
 */
const L1_TTL_MS   = 30_000;  // how long a cached session is valid
const L1_MAX_SIZE = 5_000;   // max entries (LRU eviction on oldest-first key)

interface L1Entry { data: session.SessionData | null; expiresAt: number; }

class SessionL1Cache {
  private readonly map = new Map<string, L1Entry>();

  get(sid: string): session.SessionData | null | undefined {
    const entry = this.map.get(sid);
    if (!entry) return undefined;          // cache miss
    if (Date.now() > entry.expiresAt) {
      this.map.delete(sid);
      return undefined;                    // expired
    }
    return entry.data;                     // cache hit (may be null = no session)
  }

  set(sid: string, data: session.SessionData | null): void {
    if (this.map.size >= L1_MAX_SIZE) {
      // evict the oldest entry (Map insertion order)
      const oldest = this.map.keys().next().value;
      if (oldest) this.map.delete(oldest);
    }
    this.map.set(sid, { data, expiresAt: Date.now() + L1_TTL_MS });
  }

  invalidate(sid: string): void {
    this.map.delete(sid);
  }

  get size(): number { return this.map.size; }
}

/**
 * FallbackSessionStore
 *
 * Wraps a primary (Redis/PDIM) and secondary (PG) session store.
 * All operations are tried on the primary first. If the primary throws
 * or returns an error, the operation is transparently retried on the
 * secondary. This means sessions keep working even when PDIM is down.
 *
 * L1 in-process cache (SessionL1Cache) sits in front of both stores:
 * - get()     → returns from L1 if fresh; otherwise fetches from primary/PG
 *               and populates L1 for subsequent requests in the TTL window.
 * - set()     → writes through to primary/PG AND updates L1 immediately.
 * - destroy() → invalidates L1 immediately AND propagates to both stores.
 * - touch()   → refreshes L1 TTL; does NOT skip the underlying touch().
 *
 * VM-reserved deployment: PDIM is always-on, but may have brief hiccups
 * during restarts. PG catches all edge cases automatically.
 */
class FallbackSessionStore extends session.Store {
  private primaryDown = false;
  private lastPrimaryCheck = 0;
  private readonly PRIMARY_RETRY_MS = 30_000; // re-probe primary every 30 s
  private readonly l1 = new SessionL1Cache();

  constructor(
    private readonly primary: session.Store,
    private readonly secondary: session.Store,
  ) {
    super();
  }

  private canTryPrimary(): boolean {
    if (!this.primaryDown) return true;
    if (Date.now() - this.lastPrimaryCheck >= this.PRIMARY_RETRY_MS) {
      this.primaryDown = false; // allow a probe attempt
      this.lastPrimaryCheck = Date.now();
    }
    return !this.primaryDown;
  }

  private markPrimaryDown(err: unknown) {
    if (!this.primaryDown) {
      logger.warn('[SessionStore] Primary (Redis/PDIM) failed — falling back to PostgreSQL:', (err as any)?.message ?? err);
      this.primaryDown = true;
      this.lastPrimaryCheck = Date.now();
    }
  }

  private markPrimaryUp() {
    if (this.primaryDown) {
      logger.info('[SessionStore] Primary (Redis/PDIM) recovered — resuming Redis sessions');
      this.primaryDown = false;
    }
  }

  get(sid: string, cb: (err: any, session?: session.SessionData | null) => void): void {
    // L1 hit — no PDIM/PG round-trip needed
    const cached = this.l1.get(sid);
    if (cached !== undefined) return cb(null, cached);

    const onResult = (data: session.SessionData | null) => {
      this.l1.set(sid, data);
      cb(null, data);
    };

    if (!this.canTryPrimary()) {
      return this.secondary.get(sid, (err, data) => {
        if (err) return cb(err);
        onResult(data ?? null);
      });
    }
    this.primary.get(sid, (err, data) => {
      if (err) {
        this.markPrimaryDown(err);
        return this.secondary.get(sid, (err2, data2) => {
          if (err2) return cb(err2);
          onResult(data2 ?? null);
        });
      }
      this.markPrimaryUp();
      onResult(data ?? null);
    });
  }

  set(sid: string, sess: session.SessionData, cb?: (err?: any) => void): void {
    // Write-through: update L1 immediately so subsequent get()s see the new data
    this.l1.set(sid, sess);

    if (!this.canTryPrimary()) {
      return this.secondary.set(sid, sess, cb);
    }
    this.primary.set(sid, sess, (err) => {
      if (err) {
        this.markPrimaryDown(err);
        return this.secondary.set(sid, sess, cb);
      }
      this.markPrimaryUp();
      cb?.();
    });
  }

  destroy(sid: string, cb?: (err?: any) => void): void {
    // Invalidate L1 immediately — logout must take effect at once
    this.l1.invalidate(sid);

    const done = (err?: any) => cb?.(err);
    if (!this.canTryPrimary()) {
      return this.secondary.destroy(sid, done);
    }
    this.primary.destroy(sid, (err) => {
      if (err) this.markPrimaryDown(err);
      else this.markPrimaryUp();
      // Always attempt secondary cleanup too (belt-and-suspenders)
      this.secondary.destroy(sid, done);
    });
  }

  touch(sid: string, sess: session.SessionData, cb?: (err?: any) => void): void {
    // Refresh L1 TTL on touch so active users don't keep re-fetching
    this.l1.set(sid, sess);

    if (!this.canTryPrimary()) {
      return (this.secondary as any).touch?.(sid, sess, cb) ?? cb?.();
    }
    (this.primary as any).touch?.(sid, sess, (err?: any) => {
      if (err) this.markPrimaryDown(err);
      else this.markPrimaryUp();
      cb?.();
    }) ?? cb?.();
  }
}

/**
 * Adapter that wraps an ioredis client to satisfy the connect-redis v9 interface,
 * which expects node-redis v5 API calls:
 *   set(key, val, { expiration: { type: "EX", value: ttl } })
 *   del([key1, key2])
 *   scanIterator({ MATCH: pattern, COUNT: count })
 *
 * ioredis uses:
 *   set(key, val, 'EX', ttl)
 *   del(key1, key2)   ← spread, not array
 *   scan / no scanIterator
 */
function createIoredisAdapter(ioredisClient: any) {
  return {
    get(key: string): Promise<string | null> {
      return ioredisClient.get(key);
    },

    set(
      key: string,
      val: string,
      opts?: { expiration?: { type?: string; value?: number } }
    ): Promise<any> {
      const ttl = opts?.expiration?.value;
      if (ttl && ttl > 0) {
        return ioredisClient.set(key, val, 'EX', ttl);
      }
      return ioredisClient.set(key, val);
    },

    expire(key: string, ttl: number): Promise<any> {
      return ioredisClient.expire(key, ttl);
    },

    del(keys: string | string[]): Promise<any> {
      if (Array.isArray(keys)) {
        if (keys.length === 0) return Promise.resolve(0);
        return ioredisClient.del(...keys);
      }
      return ioredisClient.del(keys);
    },

    async *scanIterator(
      opts: { MATCH?: string; COUNT?: number } = {}
    ): AsyncGenerator<string[]> {
      const pattern = opts.MATCH || '*';
      const count = opts.COUNT || 100;
      let cursor = '0';
      do {
        const [nextCursor, keys] = await ioredisClient.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          count
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          yield keys;
        }
      } while (cursor !== '0');
    },
  };
}

// VM-reserved deployment: retry PDIM ping a few times on startup.
// The VM might be briefly unresponsive right as our server starts.
async function pingWithRetry(client: any, maxAttempts = 8, delayMs = 2_000): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.ping();
      return;
    } catch (err) {
      lastErr = err;
      const isLast = attempt === maxAttempts;
      logger.warn(`[SessionStore] PDIM ping attempt ${attempt}/${maxAttempts} failed${isLast ? ' — giving up' : ` — retrying in ${delayMs / 1000}s`}`);
      if (!isLast) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

export async function createSessionStore(): Promise<session.Store> {
  try {
    const ioredisClient = getRedisClient();
    await pingWithRetry(ioredisClient);

    const store = new RedisStore({
      client: createIoredisAdapter(ioredisClient) as any,
      prefix: 'sess:',
      ttl: 24 * 60 * 60,
    });

    logger.info('✅ Redis session store created (sessions survive restarts, shared across instances)');
    return store;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('❌ Failed to create Redis session store:', errMsg);
    throw new Error(`Session store initialization failed: ${errMsg}. Sessions cannot be stored safely.`);
  }
}

/**
 * Create a PostgreSQL-backed session store using the app's existing DB connection.
 * Shared across all cluster workers — unlike MemoryStore which is per-process.
 * Falls back gracefully if the table can't be created.
 */
export async function createPgSessionStore(): Promise<session.Store> {
  try {
    const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('No database connection string available');
    }

    const store = new PgSessionStore({
      conString: connectionString,
      createTableIfMissing: true,
      tableName: 'session',
      ttl: 24 * 60 * 60, // 24 hours in seconds
      pruneSessionInterval: 60 * 60, // Prune expired sessions every hour
    });

    // Verify the store is working
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('PG session store ping timed out')), 5000);
      (store as any).pool?.query('SELECT 1', (err: any) => {
        clearTimeout(timeout);
        if (err) reject(err);
        else resolve();
      });
      // If pool isn't exposed, just resolve — createTableIfMissing handles setup
      if (!(store as any).pool) {
        clearTimeout(timeout);
        resolve();
      }
    });

    logger.info('✅ PostgreSQL session store ready (shared across all workers)');
    return store;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('❌ PostgreSQL session store failed:', errMsg);
    throw new Error(`PostgreSQL session store failed: ${errMsg}`);
  }
}

/**
 * createFallbackSessionStore
 *
 * Always initializes PostgreSQL as the guaranteed fallback.
 * Then attempts to initialize Redis/PDIM as the primary.
 *
 * If PDIM is up → returns a FallbackSessionStore(Redis, PG) that
 *   transparently uses Redis for all operations but falls back to PG
 *   automatically on any error (and retries Redis every 30 s).
 *
 * If PDIM is down → returns the PG store directly so logins work
 *   immediately; the FallbackSessionStore will switch back to Redis
 *   once PDIM recovers (on the next 30 s probe cycle).
 */
export async function createFallbackSessionStore(): Promise<session.Store> {
  // PG must succeed — it's the guaranteed safety net
  let pgStore: session.Store;
  try {
    pgStore = await createPgSessionStore();
  } catch (pgErr) {
    logger.error('[SessionStore] CRITICAL: PostgreSQL session store failed to initialize:', pgErr);
    throw pgErr;
  }

  // Try Redis/PDIM — fail gracefully if it's not available
  let redisStore: session.Store | null = null;
  try {
    const ioredisClient = getRedisClient();
    // Fast check only — if PDIM is VM-reserved it'll answer immediately;
    // if autoscale/down it'll 503 immediately. Either way we don't block.
    await Promise.race([
      ioredisClient.ping(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('PDIM ping timeout')), 3000)),
    ]);

    redisStore = new RedisStore({
      client: createIoredisAdapter(ioredisClient) as any,
      prefix: 'sess:',
      ttl: 24 * 60 * 60,
    });
    logger.info('✅ Redis/PDIM session store created — using FallbackSessionStore (Redis → PG)');
  } catch (redisErr) {
    const msg = redisErr instanceof Error ? redisErr.message : String(redisErr);
    logger.warn(`[SessionStore] Redis/PDIM unavailable at startup (${msg}) — starting with PG only; will auto-recover when PDIM comes back`);
  }

  if (redisStore) {
    return new FallbackSessionStore(redisStore, pgStore);
  }
  // Start PG-only but wrap in FallbackSessionStore so PDIM auto-reconnect
  // works once the server detects it. We pass a lazy-init "pending" Redis
  // store that will fail gracefully (markPrimaryDown keeps routing to PG).
  try {
    const ioredisClient = getRedisClient();
    const lazyRedisStore = new RedisStore({
      client: createIoredisAdapter(ioredisClient) as any,
      prefix: 'sess:',
      ttl: 24 * 60 * 60,
    });
    return new FallbackSessionStore(lazyRedisStore, pgStore);
  } catch {
    return pgStore;
  }
}

export function getSessionConfig(store: session.Store) {
  const isProduction = process.env.NODE_ENV === 'production';
  const sessionSecret = process.env.SESSION_SECRET;

  if (isProduction) {
    if (!sessionSecret) throw new Error('SESSION_SECRET environment variable is required in production');
    if (sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  } else if (!sessionSecret) {
    logger.warn('⚠️  SESSION_SECRET not set. Using random default for development only.');
  }

  const finalSecret = sessionSecret || crypto.randomBytes(32).toString('hex');

  return {
    store,
    secret: finalSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    name: 'sessionId',
    proxy: isProduction,
    cookie: {
      secure: isProduction,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax' as const,
      path: '/',
    },
    genid: () => crypto.randomBytes(32).toString('hex'),
  };
}
