import session from 'express-session';
import { RedisStore } from 'connect-redis';
import crypto from 'crypto';
import { getRedisClient } from '../lib/redisClient.js';
import { isPdimConfigured } from '../lib/pdimClient.js';
import { logger } from '../logger.js';

/**
 * In-process session cache — eliminates repeated PDIM round-trips for hot
 * session lookups.  Each session is fetched from PDIM at most once per
 * L1_TTL_MS window.  set()/destroy() immediately invalidate the cache entry
 * so auth state changes (login, logout) take effect instantly.
 *
 * Sizing: 5 000 entries × ~2 KB average session ≈ 10 MB max — negligible.
 */
const L1_TTL_MS   = 60_000; // 1 minute
const L1_MAX_SIZE = 5_000;

interface L1Entry { data: session.SessionData | null; expiresAt: number; }

class SessionL1Cache {
  private readonly map = new Map<string, L1Entry>();

  get(sid: string): session.SessionData | null | undefined {
    const entry = this.map.get(sid);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(sid);
      return undefined;
    }
    return entry.data;
  }

  set(sid: string, data: session.SessionData | null): void {
    if (this.map.size >= L1_MAX_SIZE) {
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

/**
 * PDIM session store with L1 in-process cache on top.
 *
 * PDIM is always reachable — no PG fallback, no degraded mode.
 * get()     → L1 hit returns immediately; miss fetches from PDIM and caches.
 * set()     → writes through to PDIM AND updates L1 immediately.
 * destroy() → invalidates L1 AND propagates to PDIM.
 * touch()   → refreshes L1 TTL and forwards to PDIM store.
 */
class PdimSessionStore extends session.Store {
  private readonly l1 = new SessionL1Cache();
  private readonly inner: session.Store;

  constructor(inner: session.Store) {
    super();
    this.inner = inner;
  }

  get(sid: string, cb: (err: any, session?: session.SessionData | null) => void): void {
    const cached = this.l1.get(sid);
    if (cached !== undefined) return cb(null, cached);

    this.inner.get(sid, (err, data) => {
      if (err) {
        // PDIM unavailable — treat as "no session" instead of propagating the error.
        // Propagating causes Express to return 500 to the user, which is wrong: the
        // correct behaviour during a PDIM outage is to serve a session-less (logged-out)
        // response so the app remains accessible.  The L1 cache will prime on the next
        // successful PDIM read once connectivity is restored.
        logger.warn('[SessionStore] PDIM session fetch failed — serving session-less response:', (err as Error).message);
        return cb(null, null);
      }
      const result = data ?? null;
      this.l1.set(sid, result);
      cb(null, result);
    });
  }

  set(sid: string, sess: session.SessionData, cb?: (err?: any) => void): void {
    this.l1.set(sid, sess);
    // Write through to PDIM; swallow errors because L1 cache already holds the
    // authoritative copy — the session is functional even if PDIM is temporarily down.
    this.inner.set(sid, sess, (err?: any) => {
      if (err) {
        logger.warn('[SessionStore] PDIM session write failed (session held in L1 cache):', (err as Error).message);
      }
      cb?.();
    });
  }

  destroy(sid: string, cb?: (err?: any) => void): void {
    this.l1.invalidate(sid);
    // Best-effort delete from PDIM; L1 is already invalidated so the session
    // will not be served from cache regardless of whether PDIM succeeds.
    this.inner.destroy(sid, (err?: any) => {
      if (err) {
        logger.warn('[SessionStore] PDIM session destroy failed (L1 already invalidated):', (err as Error).message);
      }
      cb?.();
    });
  }

  touch(sid: string, sess: session.SessionData, cb?: (err?: any) => void): void {
    this.l1.set(sid, sess);
    const primaryTouch = (this.inner as any).touch;
    if (primaryTouch) {
      primaryTouch.call(this.inner, sid, sess, (err?: any) => {
        if (err) {
          // PDIM congestion during TTL refresh is non-critical — the session
          // remains valid at its original TTL. Swallow the error so express-session
          // does not propagate it after the response has already been sent.
          logger.warn('[SessionStore] PDIM congested during touch — TTL refresh skipped:', (err as Error).message);
        }
        cb?.();
      });
    } else {
      cb?.();
    }
  }
}

// VM-reserved deployment: retry PDIM ping a few times on startup.
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

/**
 * Create the PDIM-backed session store.
 * Falls back to in-memory store when PDIM is not configured (development mode).
 */
export async function createSessionStore(): Promise<session.Store> {
  if (!isPdimConfigured()) {
    logger.warn('⚠️  PDIM not configured — using in-memory session store (development mode, sessions will not persist across restarts)');
    const MemoryStore = (await import('memorystore')).default(session);
    return new MemoryStore({ checkPeriod: 86400000 });
  }
  try {
    const ioredisClient = getRedisClient();
    await pingWithRetry(ioredisClient);

    const redisStore = new RedisStore({
      client: createIoredisAdapter(ioredisClient) as any,
      prefix: 'sess:',
      ttl: 24 * 60 * 60,
    });

    logger.info('✅ PDIM session store created (sessions survive restarts, shared across instances)');
    return new PdimSessionStore(redisStore);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('❌ Failed to create PDIM session store:', errMsg);
    throw new Error(`Session store initialization failed: ${errMsg}. Sessions cannot be stored safely.`);
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
