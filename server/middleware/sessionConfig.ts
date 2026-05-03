import session from 'express-session';
import { RedisStore } from 'connect-redis';
import crypto from 'crypto';
import { getRedisClient } from '../lib/redisClient.js';
import { isPdimConfigured } from '../lib/pdimClient.js';
import { logger } from '../logger.js';
import { env } from '../config/env.js';

/**
 * In-process session cache — eliminates repeated PDIM round-trips for hot
 * session lookups.  Each session is fetched from PDIM at most once per
 * L1_TTL_MS window.  set()/destroy() immediately invalidate the cache entry
 * so auth state changes (login, logout) take effect instantly.
 *
 * Sizing: 5 000 entries × ~2 KB average session ≈ 10 MB max — negligible.
 */
const L1_TTL_MS       = 60_000; // 1 minute — normal session TTL
const L1_ERR_TTL_MS   = 5_000;  // 5 seconds — short TTL when caching a PDIM error null,
                                 // so we stop hammering PDIM while it's down but recover
                                 // within 5 s once it comes back.
const L1_MAX_SIZE     = 5_000;

// Rate-limit the WARN log to once per 30 s — PDIM can be down for minutes and
// logging on every request creates thousands of lines of useless noise.
let _lastFetchWarnAt  = 0;
const WARN_THROTTLE_MS = 30_000;

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

  set(sid: string, data: session.SessionData | null, ttlMs = L1_TTL_MS): void {
    if (this.map.size >= L1_MAX_SIZE) {
      const oldest = this.map.keys().next().value;
      if (oldest) this.map.delete(oldest);
    }
    this.map.set(sid, { data, expiresAt: Date.now() + ttlMs });
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
function createIoredisAdapter(ioredisClient: { get: (...a: unknown[]) => Promise<unknown>; set: (...a: unknown[]) => Promise<unknown>; del: (...a: unknown[]) => Promise<unknown>; expire: (...a: unknown[]) => Promise<unknown> }) {
  return {
    get(key: string): Promise<string | null> {
      return ioredisClient.get(key) as Promise<string | null>;
    },

    set(
      key: string,
      val: string,
      opts?: { expiration?: { type?: string; value?: number } }
    ): Promise<unknown> {
      const ttl = opts?.expiration?.value;
      if (ttl && ttl > 0) {
        return ioredisClient.set(key, val, 'EX', ttl);
      }
      return ioredisClient.set(key, val);
    },

    expire(key: string, ttl: number): Promise<unknown> {
      return ioredisClient.expire(key, ttl);
    },

    del(keys: string | string[]): Promise<unknown> {
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
        ) as [string, string[]];
        cursor = nextCursor;
        if (keys.length > 0) {
          yield keys;
        }
      } while (cursor !== '0');
    },
  };
}

// ── Session revocation ────────────────────────────────────────────────────────
// Propagation timeline for revokeUserSessions(uid):
//   Pod A calls revokeUserSessions(uid)
//   → writes `session:revoke:{uid}` = '1' to PDIM (all pods share this)
//   → warms this pod's L1 with revoked=true immediately
//
//   Pod B (other pod):
//   → _revokeL1 for this uid is missing or stores revoked=false with a 10 s TTL
//   → next request for this user: L1 TTL (≤10 s) expires, re-checks PDIM
//   → sees revocation flag → returns null session → user forced to re-login
//
// Asymmetric TTL design (key insight):
//   revoked=false  10 s L1  — most users are never revoked; 10 s avoids per-request
//                              PDIM calls while keeping the window short enough that
//                              a newly revoked user is rejected within 10 s (not 60 s).
//   revoked=true   200 ms L1 — once a user IS revoked, we keep re-checking PDIM quickly
//                              so the "still-seeing-revocation" check stays fresh and
//                              the flag is not inadvertently "healed" by a stale L1 read.
//
// Max cross-pod propagation lag: 10 s (L1 TTL for non-revoked entries).
// Before this change: unbounded (L1 session cache was 60 s; revocation wrote to PDIM/DB
// but other pods' L1 caches were never cleared).

const REVOKE_L1_TTL_ACTIVE_MS  =  5_000; // 5 s — normal users; ≤5 s cross-pod propagation
const REVOKE_L1_TTL_REVOKED_MS =    200; // 200 ms — just-revoked user; fast re-check
const REVOKE_PDIM_TTL_S        =     70; // slightly longer than L1_TTL_MS (60 s)

// In-process revocation-flag cache: key = userId; value = { revoked, expiresAt }
// This is module-scoped (not class-scoped) so the exported revokeUserSessions()
// can also warm it immediately without an instance reference.
const _revokeL1 = new Map<string, { revoked: boolean; expiresAt: number }>();

function _revokeL1Get(userId: string): boolean | undefined {
  const entry = _revokeL1.get(userId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { _revokeL1.delete(userId); return undefined; }
  return entry.revoked;
}

function _revokeL1Set(userId: string, revoked: boolean): void {
  // Asymmetric TTL: re-check PDIM rapidly while revoked (200 ms), lazily when active (10 s).
  const ttlMs = revoked ? REVOKE_L1_TTL_REVOKED_MS : REVOKE_L1_TTL_ACTIVE_MS;
  _revokeL1.set(userId, { revoked, expiresAt: Date.now() + ttlMs });
}

/**
 * Check if this user's sessions have been revoked.
 *
 * L1-cached asymmetrically:
 *   revoked=false → 10 s  (efficient; non-revoked users are the common case)
 *   revoked=true  → 200 ms (fast re-check; keeps rejection fresh while the flag is live)
 *
 * This means cross-pod propagation after revokeUserSessions() is at most 10 s
 * (the L1 TTL for the "not yet revoked" state on other pods).
 */
async function isRevoked(userId: string): Promise<boolean> {
  const l1 = _revokeL1Get(userId);
  if (l1 !== undefined) return l1;

  if (!isPdimConfigured()) return false;

  try {
    const redis = getRedisClient();
    const val = await redis.get(`session:revoke:${userId}`);
    const revoked = val !== null && val !== undefined;
    _revokeL1Set(userId, revoked); // uses asymmetric TTL internally
    return revoked;
  } catch {
    return false; // on PDIM error, do not block the request
  }
}

/**
 * Extract the user ID from session data for revocation checks.
 */
function extractUserIdFromSession(data: session.SessionData | null): string | undefined {
  if (!data) return undefined;
  const d = data as Record<string, unknown>;
  const passportUser = (d.passport as Record<string, unknown> | undefined)?.user;
  const uid = d.userId ?? passportUser;
  return uid ? String(uid) : undefined;
}

/**
 * Write a cross-pod session revocation flag to PDIM.
 *
 * Call this after any security-critical user state change:
 *   - Password change
 *   - Account suspension / locking
 *   - Role downgrade
 *
 * All pods will reject sessions for this user within REVOKE_L1_TTL_ACTIVE_MS (10 s)
 * regardless of their in-process L1 session cache state.  Already-revoked pods
 * re-check PDIM every 200 ms (REVOKE_L1_TTL_REVOKED_MS) to stay current.
 */
export async function revokeUserSessions(userId: string): Promise<void> {
  // Warm this pod's L1 immediately
  _revokeL1Set(userId, true);

  if (!isPdimConfigured()) return;

  try {
    const redis = getRedisClient();
    await redis.set(`session:revoke:${userId}`, '1', 'EX', REVOKE_PDIM_TTL_S);
    logger.info(`[SessionRevoke] Revocation flag set for user ${userId} (TTL=${REVOKE_PDIM_TTL_S}s, max cross-pod lag=${REVOKE_L1_TTL_ACTIVE_MS / 1000}s)`);
  } catch (err: unknown) {
    logger.warn({ err }, `[SessionRevoke] Failed to write revocation flag for user ${userId} — other pods may still serve old sessions for up to 60 s`);
  }
}

/**
 * PDIM session store with L1 in-process cache on top.
 *
 * PDIM is always reachable — no PG fallback, no degraded mode.
 * get()     → L1 hit returns immediately (after revocation check); miss fetches from PDIM and caches.
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

  get(sid: string, cb: (err: unknown, session?: session.SessionData | null) => void): void {
    const cached = this.l1.get(sid);
    if (cached !== undefined) {
      const userId = extractUserIdFromSession(cached);
      if (userId) {
        // Async revocation check — does not block; uses L1 for the check itself (5 s TTL)
        isRevoked(userId).then(revoked => {
          if (revoked) {
            this.l1.invalidate(sid);
            // Best-effort PDIM destroy so the revoked session is cleaned up
            this.inner.destroy(sid, () => {});
            return cb(null, null);
          }
          return cb(null, cached);
        }).catch(() => cb(null, cached)); // on error, serve cached (don't block)
        return;
      }
      return cb(null, cached);
    }

    this.inner.get(sid, (err, data) => {
      if (err) {
        // PDIM unavailable — treat as "no session" instead of propagating the error.
        // Propagating causes Express to return 500 to the user, which is wrong: the
        // correct behaviour during a PDIM outage is to serve a session-less (logged-out)
        // response so the app remains accessible.
        //
        // Cache null with a SHORT TTL (L1_ERR_TTL_MS = 5 s) so:
        //   1. We don't hammer PDIM with a fresh HTTP call on every request while it's down.
        //   2. We automatically retry (and recover) within 5 s once PDIM comes back up.
        //
        // Rate-limit the WARN to once per 30 s — PDIM can be down for minutes and
        // logging on every request produces thousands of lines of useless noise.
        this.l1.set(sid, null, L1_ERR_TTL_MS);
        const now = Date.now();
        if (now - _lastFetchWarnAt >= WARN_THROTTLE_MS) {
          _lastFetchWarnAt = now;
          logger.warn('[SessionStore] PDIM session fetch failed — serving session-less response', {
            err: err instanceof Error ? err.message : String(err),
          });
        }
        return cb(null, null);
      }

      const result = data ?? null;
      const userId = extractUserIdFromSession(result);
      if (userId) {
        isRevoked(userId).then(revoked => {
          if (revoked) {
            this.inner.destroy(sid, () => {});
            return cb(null, null);
          }
          this.l1.set(sid, result);
          cb(null, result);
        }).catch(() => {
          this.l1.set(sid, result);
          cb(null, result);
        });
        return;
      }

      this.l1.set(sid, result);
      cb(null, result);
    });
  }

  set(sid: string, sess: session.SessionData, cb?: (err?: unknown) => void): void {
    this.l1.set(sid, sess);
    // Write through to PDIM; swallow errors because L1 cache already holds the
    // authoritative copy — the session is functional even if PDIM is temporarily down.
    this.inner.set(sid, sess, (err?: unknown) => {
      if (err) {
        logger.warn('[SessionStore] PDIM session write failed (session held in L1 cache)', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
      cb?.();
    });
  }

  destroy(sid: string, cb?: (err?: unknown) => void): void {
    this.l1.invalidate(sid);
    // Best-effort delete from PDIM; L1 is already invalidated so the session
    // will not be served from cache regardless of whether PDIM succeeds.
    this.inner.destroy(sid, (err?: unknown) => {
      if (err) {
        logger.warn('[SessionStore] PDIM session destroy failed (L1 already invalidated)', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
      cb?.();
    });
  }

  touch(sid: string, sess: session.SessionData, cb?: (err?: unknown) => void): void {
    this.l1.set(sid, sess);
    const primaryTouch = (this.inner as Record<string, unknown>).touch;
    if (primaryTouch) {
      (primaryTouch as Function).call(this.inner, sid, sess, (err?: unknown) => {
        if (err) {
          // PDIM congestion during TTL refresh is non-critical — the session
          // remains valid at its original TTL. Swallow the error so express-session
          // does not propagate it after the response has already been sent.
          logger.warn('[SessionStore] PDIM congested during touch — TTL refresh skipped', {
            err: err instanceof Error ? err.message : String(err),
          });
        }
        cb?.();
      });
    } else {
      cb?.();
    }
  }
}

// VM-reserved deployment: retry PDIM ping a few times on startup.
async function pingWithRetry(client: { ping: () => Promise<string> }, maxAttempts = 8, delayMs = 2_000): Promise<void> {
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
      client: createIoredisAdapter(ioredisClient) as Record<string, unknown>,
      prefix: 'sess:',
      ttl: 24 * 60 * 60,
    });

    logger.info('✅ PDIM session store created (sessions survive restarts, shared across instances)');
    return new PdimSessionStore(redisStore);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.warn('❌ Failed to create PDIM session store:', errMsg);
    throw new Error(`Session store initialization failed: ${errMsg}. Sessions cannot be stored safely.`);
  }
}

export function getSessionConfig(store: session.Store) {
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.REPLIT_DEPLOYMENT;
  // Session cookies are only marked Secure when running under TLS in production.
  // REPLIT_DEPLOYMENT=1 can be set even for dev servers running on plain HTTP
  // (e.g. localhost:5000 accessed by the test suite), so we gate the Secure
  // flag on NODE_ENV=production to allow session cookies over HTTP in dev.
  const useSecureCookies = process.env.NODE_ENV === 'production';
  const sessionSecret = env.SESSION_SECRET;

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
      secure: useSecureCookies,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax' as const,
      path: '/',
    },
    genid: () => crypto.randomBytes(32).toString('hex'),
  };
}
