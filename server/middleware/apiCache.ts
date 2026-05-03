import { Request, Response, NextFunction } from 'express';
import { distributedCache } from '../infrastructure/distributedCache.js';
import { logger } from '../logger.js';

/**
 * Quickly decode the JWT payload to extract a user ID for cache-key purposes.
 * This does NOT verify the signature — that is still done by requireAuth.
 * We just need a stable, per-user discriminator for the cache key.
 */
function extractUserIdFromRequest(req: Request): string {
  const user = (req as Record<string, unknown>).user;
  if (user && typeof user === 'object' && 'id' in user) return String((user as { id: unknown }).id);

  const sess = req.session as Record<string, unknown> | undefined;
  const sessionUid = sess?.userId ?? (sess?.passport as Record<string, unknown> | undefined)?.user;
  if (sessionUid) return String(sessionUid);

  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try {
      const parts = auth.slice(7).split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (payload?.userId) return String(payload.userId);
        if (payload?.sub)    return String(payload.sub);
      }
    } catch { /* ignore malformed tokens */ }
  }

  const cookieHeader = req.headers.cookie || '';
  const tokenCookieMatch = cookieHeader.match(/(?:^|;\s*)(?:token|access_token|jwt)=([^;]+)/);
  if (tokenCookieMatch) {
    try {
      const parts = tokenCookieMatch[1].split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (payload?.userId) return String(payload.userId);
        if (payload?.sub)    return String(payload.sub);
      }
    } catch { /* ignore */ }
  }

  return 'anon';
}

// ── ETag ──────────────────────────────────────────────────────────────────────
function generateETag(body: unknown): string {
  let hash = 0;
  const str = typeof body === 'string' ? body : JSON.stringify(body);
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return `"${Math.abs(hash).toString(36)}"`;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface CacheEntry {
  body: unknown;
  headers: Record<string, string>;
  statusCode: number;
  timestamp: number;
  etag: string;
}

interface CacheOptions {
  ttlSeconds?: number;
  varyByUser?: boolean;
  varyByQuery?: boolean;
}

// ── PDIM key namespaces ───────────────────────────────────────────────────────
const PDIM_ENTRY_PFX = 'apicache:e:';
const PDIM_BUST_PFX  = 'apicache:bust:u:';

// ── Tuning constants ──────────────────────────────────────────────────────────
const L1_ENTRY_TTL_MS = 4_000;   // hot-path in-process entry TTL
const L1_BUST_TTL_MS  = 5_000;   // in-process bust-timestamp cache TTL
                                  // = max cross-pod propagation lag after invalidation
const L1_MAX          = 5_000;   // max L1 entries before FIFO eviction
const BUST_PDIM_TTL_S = 120;     // PDIM bust-key TTL (seconds)

/**
 * APIResponseCache — two-tier, horizontally-safe response cache.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  L1 (in-process Map)   │ 4s TTL │ zero-latency hot-path reads          │
 * │  L2 (PDIM)             │ configurable TTL │ shared across all pods      │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │  Cross-pod invalidation via bust-timestamp                              │
 * │    invalidateForUser(uid):                                               │
 * │      1. Clear L1 entries immediately (synchronous, this pod)            │
 * │      2. PDIM: SET apicache:bust:u:{uid} = Date.now()                   │
 * │    get(key, uid):                                                        │
 * │      1. L1 hit → check bust L1 (5s cache of PDIM bust key) → serve     │
 * │      2. L2 (PDIM) hit → check bust → warm L1 → serve                   │
 * │      3. Miss                                                             │
 * │  Max cross-pod staleness after invalidation: L1_BUST_TTL_MS = 5 s      │
 * │  Before this change: unbounded (no cross-pod signal existed at all)     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
class APIResponseCache {
  // ── L1 entry store ────────────────────────────────────────────────────────
  private l1 = new Map<string, { entry: CacheEntry; expiresAt: number }>();

  // ── L1 bust-timestamp store ───────────────────────────────────────────────
  // Caches the PDIM bust timestamp so we don't make a PDIM call per request.
  // TTL = L1_BUST_TTL_MS (5s) — max propagation lag to other pods.
  private bustL1 = new Map<string, { bustAt: number; expiresAt: number }>();

  private hitCount  = 0;
  private missCount = 0;

  // ── L1 entry helpers ─────────────────────────────────────────────────────
  private l1Get(key: string): CacheEntry | undefined {
    const hit = this.l1.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expiresAt) { this.l1.delete(key); return undefined; }
    return hit.entry;
  }

  private l1Set(key: string, entry: CacheEntry): void {
    if (this.l1.size >= L1_MAX) {
      const oldest = this.l1.keys().next().value;
      if (oldest !== undefined) this.l1.delete(oldest);
    }
    this.l1.set(key, { entry, expiresAt: Date.now() + L1_ENTRY_TTL_MS });
  }

  private l1Del(key: string): void { this.l1.delete(key); }

  private l1DelPrefix(prefix: string): void {
    for (const k of this.l1.keys()) {
      if (k.startsWith(prefix)) this.l1.delete(k);
    }
  }

  // ── Bust-timestamp L1 helpers ────────────────────────────────────────────
  private bustL1Get(userId: string): number | undefined {
    const hit = this.bustL1.get(userId);
    if (!hit) return undefined;
    if (Date.now() > hit.expiresAt) { this.bustL1.delete(userId); return undefined; }
    return hit.bustAt;
  }

  private bustL1Set(userId: string, bustAt: number): void {
    this.bustL1.set(userId, { bustAt, expiresAt: Date.now() + L1_BUST_TTL_MS });
  }

  // ── Bust-timestamp PDIM fetch (L1 → PDIM) ────────────────────────────────
  private async getBustAt(userId: string): Promise<number> {
    const l1 = this.bustL1Get(userId);
    if (l1 !== undefined) return l1;

    if (!distributedCache.isConnected()) return 0;

    try {
      const val = await distributedCache.get<number>(`${PDIM_BUST_PFX}${userId}`);
      const bustAt = typeof val === 'number' ? val : 0;
      this.bustL1Set(userId, bustAt);
      return bustAt;
    } catch {
      return 0;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Retrieve a cached entry. Returns undefined on miss or stale-due-to-bust.
   * @param key     Full cache key (e.g. `u:${userId}:${path}:${query}`)
   * @param userId  Optional — enables bust-key validation for this user
   */
  async get(key: string, userId?: string): Promise<CacheEntry | undefined> {
    // ── L1 hit ──────────────────────────────────────────────────────────────
    const l1hit = this.l1Get(key);
    if (l1hit) {
      if (userId) {
        const bustAt = await this.getBustAt(userId);
        if (bustAt && l1hit.timestamp < bustAt) {
          // Entry was cached before the last invalidation signal — discard it.
          this.l1Del(key);
          this.missCount++;
          return undefined;
        }
      }
      this.hitCount++;
      return l1hit;
    }

    // ── L2 (PDIM) ────────────────────────────────────────────────────────────
    if (distributedCache.isConnected()) {
      try {
        const pdimEntry = await distributedCache.get<CacheEntry>(`${PDIM_ENTRY_PFX}${key}`);
        if (pdimEntry) {
          if (userId) {
            const bustAt = await this.getBustAt(userId);
            if (bustAt && pdimEntry.timestamp < bustAt) {
              // Stale — remove from PDIM too (fire-and-forget)
              distributedCache.delete(`${PDIM_ENTRY_PFX}${key}`).catch(() => {});
              this.missCount++;
              return undefined;
            }
          }
          // Valid L2 hit — warm L1
          this.l1Set(key, pdimEntry);
          this.hitCount++;
          return pdimEntry;
        }
      } catch {
        // PDIM temporarily unreachable — fall through to miss
      }
    }

    this.missCount++;
    return undefined;
  }

  /** Store a cache entry in L1 and (fire-and-forget) PDIM. */
  set(key: string, entry: CacheEntry, ttlSeconds: number): void {
    this.l1Set(key, entry);
    if (distributedCache.isConnected()) {
      distributedCache
        .set(`${PDIM_ENTRY_PFX}${key}`, entry, ttlSeconds)
        .catch((err) =>
          logger.warn({ err }, '[APICache] PDIM write failed — entry lives in L1 only'),
        );
    }
  }

  /**
   * Invalidate all cached entries for a user across ALL pods.
   *
   * This pod: L1 cleared immediately (synchronous).
   * Other pods: bust-timestamp written to PDIM. They will see the bust key
   *   within L1_BUST_TTL_MS (5 s) and treat matching entries as cache misses.
   */
  invalidateForUser(userId: string): void {
    // 1. Clear this pod's L1 immediately
    this.l1DelPrefix(`u:${userId}:`);
    this.bustL1.delete(userId);

    if (!distributedCache.isConnected()) return;

    // 2. Write bust timestamp to PDIM — other pods will pick it up within 5 s
    const bustAt = Date.now();
    this.bustL1Set(userId, bustAt); // warm this pod's own bust L1 immediately
    distributedCache
      .set(`${PDIM_BUST_PFX}${userId}`, bustAt, BUST_PDIM_TTL_S)
      .catch((err) =>
        logger.warn({ err }, '[APICache] PDIM bust-key write failed — cross-pod invalidation degraded'),
      );
  }

  /**
   * Invalidate cached entries matching a regex pattern (path-based shared caches).
   *
   * This clears L1 on the current pod immediately. Other pods' L1 entries for
   * the same keys expire naturally within L1_ENTRY_TTL_MS (4 s). PDIM entries
   * are left to expire on their own TTL (usually 30 s) — for path-based shared
   * caches this is acceptable because they are only invalidated on mutations,
   * and the mutation has already caused the data to change in the DB.
   */
  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const k of this.l1.keys())    { if (regex.test(k)) this.l1.delete(k); }
    for (const k of this.bustL1.keys()) { if (regex.test(k)) this.bustL1.delete(k); }
  }

  clear(): void {
    this.l1.clear();
    this.bustL1.clear();
  }

  getStats() {
    const total = this.hitCount + this.missCount;
    return {
      size:    this.l1.size,
      hits:    this.hitCount,
      misses:  this.missCount,
      hitRate: total > 0 ? (this.hitCount / total * 100).toFixed(1) + '%' : '0%',
      backend: distributedCache.isConnected() ? 'pdim' : 'memory',
    };
  }
}

export const apiCache = new APIResponseCache();

// ── Middleware ────────────────────────────────────────────────────────────────

export function cacheMiddleware(options: CacheOptions = {}) {
  const { ttlSeconds = 30, varyByUser = true, varyByQuery = true } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.method !== 'GET') { next(); return; }

    const userId   = varyByUser  ? extractUserIdFromRequest(req) : 'shared';
    const queryStr = varyByQuery ? JSON.stringify(req.query)     : '';
    const cacheKey = `u:${userId}:${req.path}:${queryStr}`;

    try {
      const cached = await apiCache.get(cacheKey, userId !== 'shared' ? userId : undefined);
      if (cached) {
        const age = Date.now() - cached.timestamp;
        if (age < ttlSeconds * 1000) {
          const clientETag = req.headers['if-none-match'];
          if (clientETag && clientETag === cached.etag) {
            res.status(304).end();
            return;
          }

          res.setHeader('X-Cache',     'HIT');
          res.setHeader('X-Cache-Age', Math.round(age / 1000).toString());
          res.setHeader('ETag',        cached.etag);
          res.setHeader('Cache-Control', `private, max-age=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 2}`);

          for (const [k, v] of Object.entries(cached.headers)) {
            if (k.toLowerCase() !== 'transfer-encoding') res.setHeader(k, v);
          }

          res.status(cached.statusCode).json(cached.body);
          return;
        }
      }
    } catch {
      // Cache check failure is non-fatal — serve from origin
    }

    // ── Intercept response to populate cache ──────────────────────────────
    const originalJson = res.json.bind(res);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (res as any).json = function (body: unknown) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const etag = generateETag(body);
        apiCache.set(
          cacheKey,
          {
            body,
            headers:    { 'Content-Type': 'application/json' },
            statusCode: res.statusCode,
            timestamp:  Date.now(),
            etag,
          } as CacheEntry,
          ttlSeconds,
        );
        res.setHeader('X-Cache',       'MISS');
        res.setHeader('ETag',          etag);
        res.setHeader('Cache-Control', `private, max-age=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 2}`);
      }
      return originalJson(body);
    };

    next();
  };
}

export function invalidateCacheOnMutation() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const userId = extractUserIdFromRequest(req);
      if (userId && userId !== 'anon') {
        apiCache.invalidateForUser(userId);
      }
      const basePath = req.path.split('/').slice(0, 4).join('/');
      apiCache.invalidatePattern(basePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    }
    next();
  };
}
