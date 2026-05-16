/**
 * Distributed API Response Cache — PDIM-backed with active cross-pod invalidation.
 *
 * Architecture:
 *   L1  in-process Map  4 s TTL   hot-path, zero-latency reads
 *   L2  PDIM            configurable TTL   shared across all pods
 *
 * Cross-pod invalidation (replaces Redis pub/sub — PDIM stubs PUBLISH/SUBSCRIBE
 * as no-ops; see pdimClient.ts lines 1080-1084 for the documented constraint):
 *
 *   Instead of a pub/sub push, every pod runs a 100 ms polling loop.
 *   Semantics are equivalent: other pods evict their L1 within ~150 ms of an
 *   invalidation event (100 ms poll interval + one PDIM round-trip ≈ 50 ms).
 *
 *   ── Write path (invalidateForUser) ──────────────────────────────────────
 *     1. l1DelPrefix("u:{uid}:") — immediate on this pod (synchronous).
 *     2. HSET apicache:inv:users {uid} {timestamp} — shared invalidation log.
 *     3. INCR apicache:inv:seq                     — wakes pollers efficiently.
 *     4. SET  apicache:bust:u:{uid} {timestamp}    — defense-in-depth flag.
 *
 *   ── Write path (invalidatePattern) ──────────────────────────────────────
 *     1. Apply regex to L1 — immediate on this pod (synchronous).
 *     2. LPUSH apicache:inv:patterns "{pattern}:{timestamp}" — event log.
 *     3. INCR apicache:inv:seq                               — wakes pollers.
 *
 *   ── Poller tick (every 100 ms per pod) ──────────────────────────────────
 *     1. GET apicache:inv:seq — 1 PDIM call. Unchanged → skip (quiet-path).
 *     2. HGETALL apicache:inv:users — fetch all user invalidation events.
 *     3. LRANGE  apicache:inv:patterns 0 99 — fetch recent pattern events.
 *     4. For each new user event: l1DelPrefix("u:{uid}:") immediately.
 *     5. For each new pattern event: apply regex to L1 immediately.
 *
 *   ── get() bust-key check (defense-in-depth) ─────────────────────────────
 *     Reads apicache:bust:u:{uid} from PDIM (L1-cached 500 ms).
 *     Treats the entry as a miss if entry.timestamp < bustAt.
 *     Covers gaps between poll ticks (PDIM blips, process startup, etc.).
 *
 *   Max cross-pod L1 staleness after ANY invalidation:
 *     ~150 ms   (before this change: unbounded — no cross-pod signal existed)
 */

import { Request, Response, NextFunction } from 'express';
import { distributedCache } from '../infrastructure/distributedCache.js';
import { getRedisClient } from '../lib/redisClient.js';
import { isPdimConfigured } from '../lib/pdimClient.js';
import { logger } from '../logger.js';

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

// ── User-ID extraction ────────────────────────────────────────────────────────
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
  const tokenMatch = cookieHeader.match(/(?:^|;\s*)(?:token|access_token|jwt)=([^;]+)/);
  if (tokenMatch) {
    try {
      const parts = tokenMatch[1].split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (payload?.userId) return String(payload.userId);
        if (payload?.sub)    return String(payload.sub);
      }
    } catch { /* ignore */ }
  }

  return 'anon';
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
const PDIM_ENTRY_PFX     = 'apicache:e:';
const PDIM_INV_USERS     = 'apicache:inv:users';     // Hash: field=userId, value=timestamp
const PDIM_INV_PATTERNS  = 'apicache:inv:patterns';  // List: "{pattern}:{timestamp}" events
const PDIM_INV_SEQ       = 'apicache:inv:seq';       // Counter: incremented on any invalidation
const PDIM_BUST_PFX      = 'apicache:bust:u:';       // Per-user defense-in-depth flag
const PDIM_INV_TTL_S     = 300;   // 5 min TTL on invalidation data structures
const BUST_PDIM_TTL_S    = 120;
const PDIM_PATTERNS_KEEP = 100;   // LTRIM: keep only last N pattern events

// ── Tuning constants ──────────────────────────────────────────────────────────
const L1_ENTRY_TTL_MS  = 4_000;   // in-process entry TTL
const BUST_L1_TTL_MS   =   500;   // defense-in-depth bust-key L1 (500 ms safety net)
const L1_MAX           = 5_000;
const POLL_INTERVAL_MS =   100;   // ~150 ms max cross-pod propagation lag

/**
 * APIResponseCache — two-tier, horizontally-safe response cache with
 * active cross-pod L1 invalidation via a 100 ms PDIM polling loop.
 *
 * Both invalidateForUser() and invalidatePattern() propagate to all pods.
 */
export class APIResponseCache {
  // ── L1 entry cache ────────────────────────────────────────────────────────
  private l1 = new Map<string, { entry: CacheEntry; expiresAt: number }>();

  // ── L1 bust-flag cache (defense-in-depth) ─────────────────────────────────
  private bustL1 = new Map<string, { bustAt: number; expiresAt: number }>();

  // ── Poller state ──────────────────────────────────────────────────────────
  private pollSeq: string | null = null;
  private processedUsers    = new Map<string, number>(); // userId → last ts cleared for
  private lastPatternCleared = 0;                         // newest pattern ts processed
  private pollTimer: ReturnType<typeof setInterval> | null = null;

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

  private l1ApplyRegex(regex: RegExp): void {
    for (const k of this.l1.keys())    { if (regex.test(k)) this.l1.delete(k); }
    for (const k of this.bustL1.keys()) { if (regex.test(k)) this.bustL1.delete(k); }
  }

  // ── Bust-flag L1 helpers ─────────────────────────────────────────────────
  private bustL1Get(userId: string): number | undefined {
    const hit = this.bustL1.get(userId);
    if (!hit) return undefined;
    if (Date.now() > hit.expiresAt) { this.bustL1.delete(userId); return undefined; }
    return hit.bustAt;
  }

  private bustL1Set(userId: string, bustAt: number): void {
    this.bustL1.set(userId, { bustAt, expiresAt: Date.now() + BUST_L1_TTL_MS });
  }

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

  // ── Active invalidation poller ────────────────────────────────────────────
  /**
   * Start the cross-pod invalidation poller.
   * Call once after distributedCache.connect() — handled in server/index.ts.
   */
  startPoller(): void {
    if (this.pollTimer !== null) return;
    if (!isPdimConfigured()) {
      logger.info('[APICache] PDIM not configured — cross-pod invalidation poller skipped (single-instance mode)');
      return;
    }
    this.pollTimer = setInterval(() => void this.pollTick(), POLL_INTERVAL_MS);
    logger.info(`[APICache] Cross-pod invalidation poller started (${POLL_INTERVAL_MS} ms interval, ~${POLL_INTERVAL_MS + 50} ms max propagation lag)`);
  }

  stopPoller(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * One poller tick.
   *
   * Quiet path (no new invalidations): 1 PDIM GET (seq check).
   * Active path: 1 PDIM GET (seq) + 1 HGETALL (user events) + 1 LRANGE (pattern events).
   */
  async pollTick(): Promise<void> {
    if (!distributedCache.isConnected()) return;
    // Skip PDIM calls while PDIM is in any warm-up phase or circuit is open —
    // the 100 ms interval would otherwise flood the exec queue during cold-start.
    const { cbIsPdimUnhealthy } = await import('../lib/pdimCircuitBreaker.js');
    if (cbIsPdimUnhealthy()) return;
    try {
      const redis = getRedisClient();

      // ── Fast path: check sequence number ──────────────────────────────────
      const seqRaw = await redis.get(PDIM_INV_SEQ);
      const seq = seqRaw as string | null;
      if (seq === this.pollSeq) return;

      // ── Process user invalidation events ──────────────────────────────────
      const userEvents = await redis.hgetall(PDIM_INV_USERS) as Record<string, string> | null;
      if (userEvents) {
        for (const [uid, tsStr] of Object.entries(userEvents)) {
          const ts = parseInt(tsStr, 10);
          if (isNaN(ts)) continue;
          const lastSeen = this.processedUsers.get(uid) ?? 0;
          if (ts > lastSeen) {
            this.l1DelPrefix(`u:${uid}:`);
            this.bustL1.delete(uid);
            this.processedUsers.set(uid, ts);
          }
        }
      }

      // ── Process pattern invalidation events ───────────────────────────────
      const patternEvents = await redis.lrange(PDIM_INV_PATTERNS, 0, PDIM_PATTERNS_KEEP - 1) as string[];
      for (const event of patternEvents) {
        // Format: "{pattern}:{timestamp}" — timestamp is the last colon-delimited segment
        const lastColon = event.lastIndexOf(':');
        if (lastColon === -1) continue;
        const pattern = event.slice(0, lastColon);
        const ts = parseInt(event.slice(lastColon + 1), 10);
        if (isNaN(ts) || ts <= this.lastPatternCleared) continue;
        try {
          this.l1ApplyRegex(new RegExp(pattern));
        } catch { /* ignore malformed regex events in PDIM */ }
        if (ts > this.lastPatternCleared) this.lastPatternCleared = ts;
      }

      this.pollSeq = seq;
    } catch {
      // PDIM temporarily unreachable — skip this tick
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async get(key: string, userId?: string): Promise<CacheEntry | undefined> {
    const l1hit = this.l1Get(key);
    if (l1hit) {
      if (userId) {
        const bustAt = await this.getBustAt(userId);
        if (bustAt && l1hit.timestamp < bustAt) {
          this.l1Del(key);
          this.missCount++;
          return undefined;
        }
      }
      this.hitCount++;
      return l1hit;
    }

    if (distributedCache.isConnected()) {
      try {
        const pdimEntry = await distributedCache.get<CacheEntry>(`${PDIM_ENTRY_PFX}${key}`);
        if (pdimEntry) {
          if (userId) {
            const bustAt = await this.getBustAt(userId);
            if (bustAt && pdimEntry.timestamp < bustAt) {
              distributedCache.delete(`${PDIM_ENTRY_PFX}${key}`).catch(() => {});
              this.missCount++;
              return undefined;
            }
          }
          this.l1Set(key, pdimEntry);
          this.hitCount++;
          return pdimEntry;
        }
      } catch { /* PDIM temporarily unreachable */ }
    }

    this.missCount++;
    return undefined;
  }

  set(key: string, entry: CacheEntry, ttlSeconds: number): void {
    this.l1Set(key, entry);
    if (distributedCache.isConnected()) {
      distributedCache
        .set(`${PDIM_ENTRY_PFX}${key}`, entry, ttlSeconds)
        .catch((err) => logger.warn({ err }, '[APICache] PDIM write failed — entry in L1 only'));
    }
  }

  /**
   * Invalidate all cached entries for a user across ALL pods.
   *
   * This pod: L1 cleared immediately.
   * Other pods: invalidation written to PDIM; pollers evict their L1 within ~150 ms.
   */
  invalidateForUser(userId: string): void {
    this.l1DelPrefix(`u:${userId}:`);
    this.bustL1.delete(userId);
    this.processedUsers.set(userId, Date.now());

    if (!distributedCache.isConnected()) return;

    const bustAt = Date.now();
    this.bustL1Set(userId, bustAt);

    ;(async () => {
      try {
        const redis = getRedisClient();
        await redis.hset(PDIM_INV_USERS, userId, String(bustAt));
        await redis.expire(PDIM_INV_USERS, PDIM_INV_TTL_S);
        await redis.incr(PDIM_INV_SEQ);
        await distributedCache.set(`${PDIM_BUST_PFX}${userId}`, bustAt, BUST_PDIM_TTL_S);
      } catch (err) {
        logger.warn({ err }, '[APICache] PDIM user-invalidation write failed — cross-pod propagation degraded');
      }
    })();
  }

  /**
   * Invalidate cached entries matching a path-pattern, across ALL pods.
   *
   * This pod: matching L1 entries cleared immediately.
   * Other pods: pattern event written to PDIM; pollers apply the regex to their L1
   *   within ~150 ms.
   */
  invalidatePattern(pattern: string): void {
    // Local L1 — immediate
    const regex = new RegExp(pattern);
    this.l1ApplyRegex(regex);
    const ts = Date.now();
    this.lastPatternCleared = Math.max(this.lastPatternCleared, ts);

    if (!distributedCache.isConnected()) return;

    // PDIM — fire-and-forget
    ;(async () => {
      try {
        const redis = getRedisClient();
        // Append pattern event — format "{pattern}:{timestamp}" (timestamps have no colons)
        await redis.lpush(PDIM_INV_PATTERNS, `${pattern}:${ts}`);
        await redis.ltrim(PDIM_INV_PATTERNS, 0, PDIM_PATTERNS_KEEP - 1);
        await redis.expire(PDIM_INV_PATTERNS, PDIM_INV_TTL_S);
        await redis.incr(PDIM_INV_SEQ); // wake pollers
      } catch (err) {
        logger.warn({ err }, '[APICache] PDIM pattern-invalidation write failed — cross-pod propagation degraded');
      }
    })();
  }

  clear(): void {
    this.l1.clear();
    this.bustL1.clear();
    this.processedUsers.clear();
    this.lastPatternCleared = 0;
  }

  getStats() {
    const total = this.hitCount + this.missCount;
    return {
      size:         this.l1.size,
      hits:         this.hitCount,
      misses:       this.missCount,
      hitRate:      total > 0 ? (this.hitCount / total * 100).toFixed(1) + '%' : '0%',
      backend:      distributedCache.isConnected() ? 'pdim' : 'memory',
      pollerActive: this.pollTimer !== null,
    };
  }

  /** Check whether a key exists in the in-process L1 cache. Used by tests only. */
  l1Has(key: string): boolean {
    const hit = this.l1.get(key);
    if (!hit) return false;
    if (Date.now() > hit.expiresAt) { this.l1.delete(key); return false; }
    return true;
  }
}

export const apiCache = new APIResponseCache();

// ── Express middleware ────────────────────────────────────────────────────────

export function cacheMiddleware(options: CacheOptions = {}) {
  const { ttlSeconds = 30, varyByUser = true, varyByQuery = true } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.method !== 'GET') { next(); return; }

    const userId   = varyByUser  ? extractUserIdFromRequest(req) : 'shared';
    const queryStr = varyByQuery ? JSON.stringify(req.query)     : '';
    const cacheKey = `u:${userId}:${req.path}:${queryStr}`;

    try {
      // Timeout guard: if PDIM is congested, the cache read can hang indefinitely.
      // After 500 ms we skip the cache and serve the route handler directly.
      const CACHE_PDIM_TIMEOUT_MS = 500;
      const cached = await Promise.race([
        apiCache.get(cacheKey, userId !== 'shared' ? userId : undefined),
        new Promise<undefined>((resolve) =>
          setTimeout(() => resolve(undefined), CACHE_PDIM_TIMEOUT_MS),
        ),
      ]);
      if (cached) {
        const age = Date.now() - cached.timestamp;
        if (age < ttlSeconds * 1000) {
          const clientETag = req.headers['if-none-match'];
          if (clientETag && clientETag === cached.etag) {
            res.status(304).end();
            return;
          }
          res.setHeader('X-Cache',       'HIT');
          res.setHeader('X-Cache-Age',   Math.round(age / 1000).toString());
          res.setHeader('ETag',          cached.etag);
          res.setHeader('Cache-Control', `private, max-age=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 2}`);
          for (const [k, v] of Object.entries(cached.headers)) {
            if (k.toLowerCase() !== 'transfer-encoding') res.setHeader(k, v);
          }
          res.status(cached.statusCode).json(cached.body);
          return;
        }
      }
    } catch { /* cache failure is non-fatal */ }

    const originalJson = res.json.bind(res);
    // Override res.json using its own type signature — no any cast needed.
    // typeof res.json resolves to Express's `(body?: any) => Response`, so the
    // override is fully type-safe without suppressing lint rules.
    const jsonOverride: typeof res.json = function cachedJson(body) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const etag = generateETag(body);
        apiCache.set(
          cacheKey,
          { body, headers: { 'Content-Type': 'application/json' }, statusCode: res.statusCode, timestamp: Date.now(), etag } as CacheEntry,
          ttlSeconds,
        );
        res.setHeader('X-Cache',       'MISS');
        res.setHeader('ETag',          etag);
        res.setHeader('Cache-Control', `private, max-age=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 2}`);
      }
      return originalJson(body);
    };
    res.json = jsonOverride;

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
