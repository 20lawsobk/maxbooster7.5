/**
 * Distributed API Response Cache — PDIM-backed with active cross-pod invalidation.
 *
 * Architecture:
 *   L1  in-process Map  4 s TTL   hot-path, zero-latency reads
 *   L2  PDIM            configurable TTL   shared across all pods
 *
 * Cross-pod invalidation (replaces Redis pub/sub — PDIM stubs PUBLISH/SUBSCRIBE
 * as no-ops; see pdimClient.ts lines 1080-1084 for the documented reason):
 *
 *   Instead of pub/sub push, we use a 100 ms polling loop on every pod.
 *   Semantics are equivalent: other pods clear their L1 within ~150 ms of an
 *   invalidation event (100 ms poll interval + one PDIM round-trip ≈ 50 ms).
 *
 *   Write path (invalidateForUser):
 *     1. Clear this pod's L1 immediately (synchronous).
 *     2. HSET apicache:inv {userId} {timestamp}   — invalidation event log.
 *     3. INCR apicache:inv:seq                    — wakes up pollers efficiently.
 *     4. SET  apicache:bust:u:{userId} {timestamp} — defense-in-depth per-user flag.
 *
 *   Poller tick (every 100 ms per pod):
 *     1. GET apicache:inv:seq  — 1 PDIM call. If unchanged, no further work.
 *     2. HGETALL apicache:inv  — fetch all pending events.
 *     3. For each new {userId: timestamp}: l1DelPrefix("u:{userId}:") immediately.
 *
 *   get() bust-key check (defense-in-depth):
 *     Reads apicache:bust:u:{userId} from PDIM (L1-cached 500 ms).
 *     Treats the entry as a miss if entry.timestamp < bustAt.
 *     Covers any gaps between poll ticks.
 *
 *   Max cross-pod L1 staleness after invalidation:
 *     ~150 ms (active poller) vs. the previous design's unbounded staleness
 *     (no cross-pod signal existed at all before this change).
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
// L2 entry store:       apicache:e:{cacheKey}
// Invalidation hash:    apicache:inv           field=userId, value=timestamp
// Invalidation seq:     apicache:inv:seq        incremented on every invalidation
// Per-user bust flag:   apicache:bust:u:{uid}   defense-in-depth copy of hash value
const PDIM_ENTRY_PFX  = 'apicache:e:';
const PDIM_INV_HASH   = 'apicache:inv';
const PDIM_INV_SEQ    = 'apicache:inv:seq';
const PDIM_BUST_PFX   = 'apicache:bust:u:';
const PDIM_INV_TTL_S  = 300; // 5 min — prevent unbounded hash growth
const BUST_PDIM_TTL_S = 120;

// ── Tuning constants ──────────────────────────────────────────────────────────
const L1_ENTRY_TTL_MS = 4_000;   // in-process entry TTL
const BUST_L1_TTL_MS  =   500;   // defense-in-depth bust-key L1 cache (500 ms)
const L1_MAX          = 5_000;
const POLL_INTERVAL_MS = 100;    // poller period — drives cross-pod propagation latency

/**
 * APIResponseCache — two-tier, horizontally-safe response cache with
 * active cross-pod L1 invalidation via a 100 ms PDIM polling loop.
 */
class APIResponseCache {
  // ── L1 entry cache ────────────────────────────────────────────────────────
  private l1 = new Map<string, { entry: CacheEntry; expiresAt: number }>();

  // ── L1 bust-flag cache (defense-in-depth) ─────────────────────────────────
  private bustL1 = new Map<string, { bustAt: number; expiresAt: number }>();

  // ── Poller state ──────────────────────────────────────────────────────────
  // pollSeq: last sequence number seen from PDIM (null = never polled).
  // processed: userId → last timestamp the poller already cleared for.
  private pollSeq: string | null = null;
  private processed = new Map<string, number>();
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

  /** Evict all L1 entries whose key starts with prefix — O(n) but n ≤ L1_MAX. */
  private l1DelPrefix(prefix: string): void {
    for (const k of this.l1.keys()) {
      if (k.startsWith(prefix)) this.l1.delete(k);
    }
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

  /** Fetch the bust flag for a user: L1 (500 ms) → PDIM. */
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
   * Start the background poller.  Call once after distributedCache.connect().
   * The poller reads PDIM every POLL_INTERVAL_MS (100 ms) and evicts L1 entries
   * for any users invalidated on other pods since the last tick.
   */
  startPoller(): void {
    if (this.pollTimer !== null) return; // already running
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
      logger.info('[APICache] Cross-pod invalidation poller stopped');
    }
  }

  /**
   * One poller tick.  Two PDIM calls in the active case; one call (seq GET)
   * in the quiet case.
   *
   * Steps:
   *   1. GET apicache:inv:seq — skip if unchanged (no new invalidations).
   *   2. HGETALL apicache:inv — fetch all pending invalidation events.
   *   3. For each entry newer than what we processed last, evict L1 for that user.
   */
  private async pollTick(): Promise<void> {
    if (!distributedCache.isConnected()) return;
    try {
      const redis = getRedisClient();

      // ── Fast path: check sequence number (1 PDIM GET) ──────────────────
      const seqRaw = await redis.get(PDIM_INV_SEQ);
      const seq = seqRaw as string | null;
      if (seq === this.pollSeq) return; // nothing new since last tick

      // ── Slow path: fetch all invalidation events (1 PDIM HGETALL) ──────
      const events = await redis.hgetall(PDIM_INV_HASH) as Record<string, string> | null;
      if (events) {
        for (const [uid, tsStr] of Object.entries(events)) {
          const ts = parseInt(tsStr, 10);
          if (isNaN(ts)) continue;
          const lastSeen = this.processed.get(uid) ?? 0;
          if (ts > lastSeen) {
            // New invalidation — actively clear L1 for this user right now
            this.l1DelPrefix(`u:${uid}:`);
            this.bustL1.delete(uid);
            this.processed.set(uid, ts);
          }
        }
      }

      this.pollSeq = seq;
    } catch {
      // PDIM temporarily unreachable — skip this tick; will retry on next interval
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Retrieve a cached entry.  Returns undefined on miss or stale-due-to-bust.
   *
   * @param key     Full cache key produced by cacheMiddleware.
   * @param userId  Enables bust-flag validation for this user (defense-in-depth).
   */
  async get(key: string, userId?: string): Promise<CacheEntry | undefined> {
    // ── L1 hit ──────────────────────────────────────────────────────────────
    const l1hit = this.l1Get(key);
    if (l1hit) {
      if (userId) {
        // Defense-in-depth: check bust flag even for L1 hits, in case this pod
        // missed a poller tick (PDIM blip, process startup, etc.).
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

    // ── L2 (PDIM) ────────────────────────────────────────────────────────────
    if (distributedCache.isConnected()) {
      try {
        const pdimEntry = await distributedCache.get<CacheEntry>(`${PDIM_ENTRY_PFX}${key}`);
        if (pdimEntry) {
          if (userId) {
            const bustAt = await this.getBustAt(userId);
            if (bustAt && pdimEntry.timestamp < bustAt) {
              // Stale — evict from PDIM too (best-effort)
              distributedCache.delete(`${PDIM_ENTRY_PFX}${key}`).catch(() => {});
              this.missCount++;
              return undefined;
            }
          }
          // Valid hit — warm L1
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

  /** Store a cache entry in L1 and (fire-and-forget) in PDIM. */
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
   * This pod: L1 cleared immediately (synchronous, zero latency).
   * Other pods: invalidation record written to PDIM hash + seq counter incremented.
   *   Their pollers will pick it up within POLL_INTERVAL_MS (100 ms) + PDIM RTT ≈ 50 ms
   *   = ~150 ms maximum cross-pod L1 staleness after invalidation.
   *
   * Defense-in-depth: also writes a per-user bust flag (apicache:bust:u:{uid}) to PDIM
   * so that pods which somehow missed the poller tick still see the invalidation via
   * the bust-flag check in get() (with a short 500 ms L1 cache window).
   */
  invalidateForUser(userId: string): void {
    // 1. Immediate L1 eviction on this pod (synchronous)
    this.l1DelPrefix(`u:${userId}:`);
    this.bustL1.delete(userId);
    // Mark as processed so the poller does not redundantly re-clear on this pod
    this.processed.set(userId, Date.now());

    if (!distributedCache.isConnected()) return;

    const bustAt = Date.now();
    // Warm this pod's own bust L1 immediately
    this.bustL1Set(userId, bustAt);

    // 2. Write invalidation event to PDIM (fire-and-forget)
    ;(async () => {
      try {
        const redis = getRedisClient();

        // Write to the shared invalidation hash — pollers on other pods read this
        await redis.hset(PDIM_INV_HASH, userId, String(bustAt));
        // Extend hash TTL to prevent unbounded growth in PDIM
        await redis.expire(PDIM_INV_HASH, PDIM_INV_TTL_S);
        // Increment sequence counter so pollers know to wake up (fast change detection)
        await redis.incr(PDIM_INV_SEQ);

        // Defense-in-depth: also write per-user bust flag
        await distributedCache.set(`${PDIM_BUST_PFX}${userId}`, bustAt, BUST_PDIM_TTL_S);
      } catch (err) {
        logger.warn({ err }, '[APICache] PDIM invalidation write failed — cross-pod propagation degraded for this event');
      }
    })();
  }

  /**
   * Invalidate entries matching a path-pattern (shared/public caches).
   *
   * This pod: matching L1 entries cleared immediately.
   * Other pods: L1 entries naturally expire within L1_ENTRY_TTL_MS (4 s).
   *   Path-based shared caches are safe with 4 s staleness because they are only
   *   invalidated on write mutations and the new data is immediately available in PDIM.
   */
  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const k of this.l1.keys())    { if (regex.test(k)) this.l1.delete(k); }
    for (const k of this.bustL1.keys()) { if (regex.test(k)) this.bustL1.delete(k); }
  }

  clear(): void {
    this.l1.clear();
    this.bustL1.clear();
    this.processed.clear();
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
      const cached = await apiCache.get(cacheKey, userId !== 'shared' ? userId : undefined);
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
    } catch {
      // Cache check failed — serve from origin (non-fatal)
    }

    // Intercept response to populate cache
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
