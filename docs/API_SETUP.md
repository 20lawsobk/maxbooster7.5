# API Setup — How It Was Built & How to Rebuild It

This document is a complete technical record of how the entire API layer was designed and wired together. It covers the actual implementation in full detail, explains every decision and constraint, and then provides a clean step-by-step guide for doing it again from scratch.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Server Bootstrap Sequence](#2-server-bootstrap-sequence)
3. [The Complete Middleware Stack (in order)](#3-the-complete-middleware-stack-in-order)
4. [Session Store — L1 → PDIM → PostgreSQL](#4-session-store--l1--pdim--postgresql)
5. [Authentication Guards](#5-authentication-guards)
6. [CSRF Protection — Double-Submit Cookie](#6-csrf-protection--double-submit-cookie)
7. [Rate Limiting — Three-Layer Defence](#7-rate-limiting--three-layer-defence)
8. [Route Registration System](#8-route-registration-system)
9. [Core Auth Endpoints (in routes.ts)](#9-core-auth-endpoints-in-routests)
10. [MaxCore Proxy](#10-maxcore-proxy)
11. [Static File Serving](#11-static-file-serving)
12. [Error Handling](#12-error-handling)
13. [Environment Variables Reference](#13-environment-variables-reference)
14. [How to Rebuild From Scratch](#14-how-to-rebuild-from-scratch)

---

## 1. Architecture Overview

```
Browser / Mobile App
        │
        ▼
  Cloudflare CDN          ← TLS termination, WAF, HSTS, static edge cache
        │
        ▼
  Replit Reverse Proxy    ← mTLS, load balancing, Autoscale
        │
        ▼
  Express (Node.js)       ← All API logic (server/index.ts + server/routes.ts)
        │
        ├── /api/*             Native Node routes  (90+ route files)
        │
        ├── /api/generate/*    ─────────────────────────────────────────────┐
        ├── /api/platform/*    MaxCore Proxy                                 │
        ├── /api/analyze/*     (server/routes/maxcoreProxy.ts)               ▼
        ├── /api/audio-job/*   Forwards to AI_SERVER_URL (Python AI server)
        └── /api/video-job/*   Bearer-only auth, media URL rewriting
                               IDOR guard, 120 s timeout, binary streaming
```

The key architectural rule: **the frontend never talks to MaxCore directly**. All AI calls go through the Node proxy, which hides the key, enforces identity binding, and rewrites relative media URLs.

---

## 2. Server Bootstrap Sequence

`server/index.ts` is the entry point. Its startup is deliberately split into two phases:

### Phase 1 — Synchronous setup (< 50 ms, before `listen()`)

These run synchronously so that `listen()` happens as fast as possible:

```ts
// Order matters — each depends on the previous
import "./config/index.js";          // unified env config (must be first)
import "./lib/pdimEnvFix.js";         // reconcile stale PDIM_* tokens (before any PDIM read)
import "./lib/consoleErrorFilter.js"; // suppress Redis noise on stdout
import "./instrument.js";             // Sentry / OpenTelemetry (must be before any throw)
import { env } from "./config/env.js"; // typed Zod-validated env

// Express instance
const app = express();

// Middleware registered before listen():
app.use(securityMiddleware);      // Helmet CSP + Permissions-Policy + global rate limit
setupStartupEndpoints(app);       // /health, /ready, /api/boot-status
startupProbes.runAllProbes();     // async — /ready transitions to "ready" once DB/Redis/TF up
app.use(brotliMiddleware());       // Brotli encoding (quality-4)
app.use(compression({ level: 6, threshold: 256 }));
app.use(cookieParser());

// Fast-path health check — BEFORE session middleware so it's always instant
app.use((req, res, next) => {
  if (req.path === '/api/health') return res.json({ status: 'ok', timestamp: ... });
  next();
});

// Early listen — deployment health checks pass immediately
httpServer.listen({ port: env.PORT, host: '0.0.0.0', reusePort: true });
```

### Phase 2 — Async init (inside an IIFE, runs after listen)

All heavyweight setup runs in a single `async IIFE`. Independent imports are parallelised with `Promise.all`:

```ts
const [
  { registerRoutes },
  { serveStatic, serveStaticFiles },
  { default: session },
  { verifyReadReplica },
  { createSessionStore, getSessionConfig },
  { ensureStripeProductsAndPrices },
  { originValidation },
  { distributedCache },
  prometheusModule,
] = await Promise.all([...nine imports in parallel...]);
```

Then in order:
1. `serveStaticFiles(app)` — static assets **before** session (so assets skip PDIM)
2. Optional modules load in background (monitoring, realtime, workers)
3. Session store created: `createSessionStore()` → PDIM ping → `PdimSessionStore`
4. `app.use(session(sessionConfig))`
5. `app.use(originValidation)`
6. `app.use(generateCsrfToken)` + `app.use(csrfProtectionWithExemptions)`
7. Four `/api` middleware modules loaded in parallel: demo-write guard, scalable rate limiter, admission control, API cache
8. Prometheus router registered
9. `registerRoutes(httpServer, app)` — the main route tree
10. 404 guard, global error handler, SPA fallback

---

## 3. The Complete Middleware Stack (in order)

Every request travels through this exact stack. Order is load-order in `server/index.ts`.

| # | Middleware | File | What it does |
|---|-----------|------|-------------|
| 1 | `securityMiddleware` | `middleware/security.ts` | Helmet (CSP, HSTS, noSniff, referrer), `Permissions-Policy` header, `express-rate-limit` global 2000 req/15min cap |
| 2 | Startup endpoints | `startup-probes.ts` | `/health`, `/ready`, `/api/boot-status` |
| 3 | Brotli | `middleware/brotliCompression.ts` | `Accept-Encoding: br` → compressed response |
| 4 | gzip | `compression` package | Level 6, threshold 256 B |
| 5 | `cookieParser()` | express | Parses cookies into `req.cookies` |
| 6 | Health fast-path | inline | `GET /api/health` short-circuits immediately |
| 7 | `cloudflareMiddleware` | `middleware/cloudflare.ts` | Validates `CF-Connecting-IP` against Cloudflare IP ranges; sets `req.realClientIp`; adds `no-store` on `/api/*` |
| 8 | `applyMandatoryMiddleware` | `safety/index.ts` | Production-critical safety layer; `process.exit(1)` if it fails |
| 9 | `sanitizationMiddleware` | `safety/index.ts` | XSS-sanitises req.body |
| 10 | TikTok / `security.txt` | inline routes | Serve verification files and `.well-known/security.txt` |
| 11 | `express.json({ limit: '1mb' })` | express | Global JSON body parse; raw body saved for Stripe webhook HMAC |
| 12 | `express.urlencoded` | express | Form-encoded body parse |
| 13 | `express.static(client/public)` | express | PWA assets: `sw.js`, `manifest.json` — **no session cost** |
| 14 | `/generated-content` static | express | Serve generated audio (WAV/MP3) |
| 15 | `/uploads/images` static | express | Uploaded images with 30-day cache |
| 16 | `/uploads/videos` static | express | Uploaded videos with `Accept-Ranges` |
| 17 | `/uploads/audio` static | express | Uploaded audio with `Accept-Ranges` |
| 18 | Request logger | inline | `method path statusCode durationMs` per API request |
| 19 | Boot SPA fallback | inline | During ~10s boot window: serves `dist/index.html` for non-API GETs |
| 20 | Early-boot stubs | inline | `/api/auth/me` → `{authenticated:false,bootPhase:true}` until routes ready |
| 21 | **Session store** | `middleware/sessionConfig.ts` | `express-session` with PDIM (Redis) store + PG fallback + L1 in-process cache |
| 22 | `originValidation` | `middleware/requestValidation.ts` | Origin header check; SameSite=Lax double-fence |
| 23 | `generateCsrfToken` | `middleware/csrf.ts` | Issues `csrf-token` cookie on first request |
| 24 | `csrfProtectionWithExemptions` | `middleware/csrf.ts` | Validates `x-csrf-token` header on mutating requests |
| 25 | `serveStaticFiles` | `static.ts` | Pre-session serving of `dist/public/assets/` (hashed JS/CSS) |
| 26 | `blockDemoWrite` | `auth.ts` | Blocks write operations for the demo account |
| 27 | `globalScalableRateLimiter` | `middleware/scalableRateLimiter.ts` | Per-IP + per-user sliding-window, Redis-backed |
| 28 | `admissionControl` | `middleware/admissionControl.ts` | Load shed at 90% utilisation (`MAX_CONCURRENT_REQUESTS`, default 5000) |
| 29 | `invalidateCacheOnMutation` | `middleware/apiCache.ts` | Clears per-user GET cache on any POST/PUT/PATCH/DELETE |
| 30 | Route-specific cache | inline map | Selected GET endpoints cached with TTL + `stale-while-revalidate` |
| 31 | Prometheus router | `routes/prometheus.ts` | `/metrics` endpoint for Prometheus scraping |
| 32 | Prometheus instrumentation | inline | `httpRequestDuration` histogram + `httpRequestTotal` counter |
| 33 | `multiTenantRouter` | `middleware/multiTenantRouter.ts` | Routes requests to correct storefront by `Host` header vs `storefront_hosts` table |
| 34 | **`registerRoutes`** | `routes.ts` | All 90+ application route files |
| 35 | API 404 guard | inline | `req.originalUrl.startsWith('/api/')` → JSON 404 |
| 36 | Global error handler | `middleware/errorHandler.ts` | Normalises errors, sanitises PDIM/500 messages in prod |
| 37 | SPA fallback | `static.ts` | `serveStatic` — catch-all for non-API GETs, serves `dist/index.html` |

**Critical ordering rules:**
- Static assets (13–17, 25) must be before session middleware (21) — assets must never pay the PDIM session lookup cost
- `generateCsrfToken` (23) must be before `csrfProtectionWithExemptions` (24)
- `admissionControl` (28) must be before `registerRoutes` (34)
- The API 404 guard (35) must be after all route files but before the SPA fallback (37)

---

## 4. Session Store — L1 → PDIM → PostgreSQL

The session store is a three-tier hierarchy defined in `server/middleware/sessionConfig.ts`.

### Storage tiers

```
Request
  │
  ▼
[L1] In-process Map (SessionL1Cache)
  • Up to 5,000 entries × ~2 KB = ~10 MB max
  • TTL: 5 min (normal), 5 s (error null, so PDIM recovers fast)
  • Immediately invalidated on set()/destroy()
  │ Miss ↓
  ▼
[L2] PDIM (Redis via connect-redis)
  • Session ID → JSON blob, prefix "sess:"
  • TTL: 24 h
  • 2 s fetch timeout → falls through to PG
  │ Miss or timeout ↓
  ▼
[L3] PostgreSQL (pg_sessions table)
  • sid TEXT PK, sess TEXT, expire BIGINT
  • Auto-created on startup if absent
  • TTL: 24 h, purged hourly
  • Used when PDIM is down or cold-starting
```

### Session revocation

Cross-pod revocation propagates within 5 seconds:

```ts
// On security events (password change, account suspension):
await revokeUserSessions(userId);
// → writes session:revoke:{uid} = '1' to PDIM (TTL 310 s)
// → warms L1 immediately on this pod (TTL 200 ms — fast re-check while revoked)
// → other pods' L1 expires within 5 s (REVOKE_L1_TTL_ACTIVE_MS) → PDIM check → reject
```

### Cookie configuration

```ts
{
  name: 'sessionId',
  secret: env.SESSION_SECRET,   // min 32 chars, required in production
  resave: false,
  saveUninitialized: false,
  rolling: true,                // refreshes TTL on every request
  cookie: {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,  // 24 hours
    path: '/',
  },
  genid: () => crypto.randomBytes(32).toString('hex'),
}
```

### ioredis adapter

`connect-redis` v9 expects the node-redis v5 API. Since the project uses ioredis (via PDIM), a thin adapter is built inline that maps:
- `set(key, val, { expiration: { type: 'EX', value: ttl } })` → `ioredis.set(key, val, 'EX', ttl)`
- `del([key1, key2])` → `ioredis.del(...keys)`
- `scanIterator({ MATCH, COUNT })` → `ioredis.scan` loop as an async generator

---

## 5. Authentication Guards

Four middleware functions in `server/middleware/auth.ts`:

### `requireAuthOnly`
Used on: MaxCore proxy routes, content generation endpoints

```ts
export const requireAuthOnly = async (req, res, next) => {
  await resolveJwtUser(req);   // JWT fallback if no Passport session
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Authentication required' });
  next();
};
```

Does **not** check subscription status. Used where the frontend's route guard already enforces subscription.

### `requireAuth`
Used on: most protected API endpoints

Identical to `requireAuthOnly` plus:
1. Demo account bypass (always allowed through)
2. Admin bypass (always allowed through)
3. Trial expiry check: `user.trialEndsAt < now` → 403 `{ trialExpired: true }`
4. Subscription expiry check: `user.subscriptionEndsAt < now && tier !== 'lifetime'` → 403 `{ subscriptionExpired: true }`

### `requireAdmin`
Used on: all `/api/admin/*` routes

```ts
export const requireAdmin = (req, res, next) => {
  if (!req.isAuthenticated()) return res.status(401)...
  if (req.user.role === 'admin') return next();
  res.status(403).json({ error: 'Admin access required' });
};
```

### `require2FA`
Used on: account deletion, payment method changes, admin escalations

```ts
export const require2FA = (req, res, next) => {
  if (req.user.twoFactorEnabled && !req.session.twoFactorVerified)
    return res.status(403).json({ error: '...', requiresTwoFactor: true });
  next();
};
```

### JWT fallback (`resolveJwtUser`)

Called by both `requireAuthOnly` and `requireAuth` before checking the session:

```ts
async function resolveJwtUser(req) {
  if (req.isAuthenticated?.()) return;  // session auth takes precedence
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return;
  const token = authHeader.substring(7);
  const decoded = await jwtAuthService.verifyAccessToken(token);
  if (decoded) {
    const user = await storage.getUser(decoded.userId);
    if (user) {
      req.user = user;
      req.isAuthenticated = () => true;
    }
  }
}
```

This allows mobile apps and the Beat Loop automation (which runs without a browser session) to authenticate via `Authorization: Bearer <jwt>`.

### User attachment middleware (`attachUser`)

Registered globally in `registerRoutes` before all other route middleware:

```ts
async function attachUser(req, res, next) {
  if (req.session?.userId) {
    const cached = _userCacheGet(req.session.userId);   // 30 s per-process L1 cache
    if (cached) {
      req.user = cached;
    } else {
      const user = await storage.getUser(req.session.userId);
      if (user) { req.user = user; _userCacheSet(user); }
    }
  }
  req.isAuthenticated = function() { return !!this.user; };
  next();
}
```

The per-process user cache (`_userCache`, max 2000 entries, 30 s TTL) eliminates repeated Neon round-trips for the same user across sequential API calls.

---

## 6. CSRF Protection — Double-Submit Cookie

Implementation: `server/middleware/csrf.ts`  
Pattern: **double-submit cookie** (not synchronizer token, no server state needed)

### How it works

1. `generateCsrfToken` runs on every request (idempotent):
   - If `csrf-token` cookie absent → `randomBytes(32).toString('hex')` → set cookie
   - Cookie flags: `httpOnly: false` (must be readable by JS), `secure: isProduction`, `sameSite: 'strict'`, `maxAge: 24h`

2. `csrfProtectionWithExemptions` runs on every mutating request (POST/PUT/PATCH/DELETE):
   - Read cookie value: `req.cookies['csrf-token']`
   - Read header value: `req.headers['x-csrf-token']` (or `req.body._csrf` fallback)
   - Compare with `timingSafeEqual` (prevents timing attacks)
   - Mismatch → 403

### CSRF-exempt paths

These paths skip CSRF validation entirely:

```
/api/webhooks/          — Stripe/platform webhooks use HMAC instead
/api/stripe/webhook     — Stripe raw body HMAC
/api/auth/login         — no session yet, SameSite=Lax protects
/api/auth/register      — same
/api/auth/demo          — same
/api/auth/forgot-password
/api/auth/reset-password
/api/auth/verify
/api/auth/token/refresh
/api/auth/google        — OAuth redirect (no cookie on cross-origin redirect)
/api/csrf-token         — token issuance endpoint itself
/api/errors             — client-side error reporting
/api/sendgrid/webhook
/api/metrics/web-vitals
/api/dns/query
/api/dev/               — dev-only endpoints (never in production)
/health /ready /status
/api/ai-service/        — internal server-to-server (BOOSTERSTATE_SECRET bearer)
/api/training/internal/ — same
```

### Secondary escape hatch

Internal server-to-server calls that carry the `BOOSTERSTATE_SECRET` bearer token bypass CSRF because they can never provide a browser cookie:

```ts
const provided = req.headers.authorization?.slice(7);
if (provided === process.env.BOOSTERSTATE_SECRET) return next();
```

### How to get a CSRF token from curl

```bash
# 1. Get the cookie
curl -c cookies.txt https://your-app.com/api/csrf-token

# 2. The cookie value IS the token — read it and pass it as the header
TOKEN=$(grep csrf-token cookies.txt | awk '{print $NF}')
curl -b cookies.txt -H "x-csrf-token: $TOKEN" -X POST https://your-app.com/api/...
```

Note: `/api/auth/csrf` does **not** exist. The token endpoint is `/api/csrf-token`.

---

## 7. Rate Limiting — Three-Layer Defence

### Layer 1 — `express-rate-limit` global IP cap (middleware/security.ts)

```ts
rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: isDev ? 100_000 : 2000, // 2000 req/15min in production
  standardHeaders: true,
  skip: (req) => isPrivateIP(req.ip),  // loopback, RFC-1918
})
```

Runs before session middleware. Blunt first-line defence against HTTP floods.

### Layer 2 — Sliding-window Redis (middleware/rateLimiter.ts)

ZSET-based sliding window via PDIM. Calculates count via `ZCOUNT` (not `INCR`) so boundary-burst attacks are closed.

| Limiter | Key pattern | Window | Max | Who |
|---------|-------------|--------|-----|-----|
| `globalIPRateLimiter` | `global:ip:{ip}` | 1 min | 300 (env `RATE_LIMIT_GLOBAL_IP`) | Any IP |
| `globalUserRateLimiter` | `global:user:{uid}` | 1 min | 2000 (env `RATE_LIMIT_GLOBAL_USER`) | Authenticated user |
| `loginRateLimiter` | `auth:login:{ip}` | 15 min | 10 | Login endpoint |
| `registerRateLimiter` | `auth:register:{ip}` | 60 min | 10 | Register endpoint |
| `forgotPasswordRateLimiter` | `auth:forgot-password:{ip}` | 60 min | 5 | Forgot-password endpoint |
| `twoFactorRateLimiter` | `auth:2fa:{uid}:{ip}` | 5 min | 15 | 2FA verify endpoint |
| `billingRateLimiter` | `billing:user:{uid}` | 60 min | 60 (env `RATE_LIMIT_BILLING`) | Billing endpoints |
| `uploadRateLimiter` | `uploads:user:{uid}` | 60 min | 50 (env `RATE_LIMIT_UPLOADS`) | File uploads |
| `aiRateLimiter` | `ai:user:{uid}` | 60 min | 100 (env `RATE_LIMIT_AI`) | AI generation endpoints |
| `payoutsRateLimiter` | `payouts:user:{uid}` | 60 min | 10 (env `RATE_LIMIT_PAYOUTS`) | Payout endpoints |
| `kycRateLimiter` | `kyc:user:{uid}` | 60 min | 5 (env `RATE_LIMIT_KYC`) | KYC document upload |

**Redis degraded mode**: If PDIM is unavailable or times out (400 ms hard timeout), falls through to an in-process `InMemoryDegradedRateLimiter` at 25% of normal limits (max 10,000 keys, prune every 60 s).

All rate-limit limiters set standard headers:
```
X-RateLimit-Limit: <max>
X-RateLimit-Remaining: <remaining>
X-RateLimit-Reset: <unix-seconds>
Retry-After: <seconds>   (on 429 only)
```

Rate limiting is **skipped entirely in development** (`NODE_ENV !== 'production'`) for all Layer 2 limiters. Auth limiters also skip private IPs (`127.0.0.1`, `::1`, `10.82.*`, `10.*`).

### Layer 3 — Admission control (middleware/admissionControl.ts)

Load-shedding at 90% of `MAX_CONCURRENT_REQUESTS` (default 5000). Returns 503 with `Retry-After: 5` when the server is overloaded. Mounted on `/api` after the rate limiter.

### `criticalEndpointLimiter`

Tighter sliding-window limit applied to the most expensive/attack-attractive route groups:

```ts
app.use('/api/ai',                criticalEndpointLimiter);
app.use('/api/career-coach',      criticalEndpointLimiter);
app.use('/api/billing',           criticalEndpointLimiter);
app.use('/api/admin',             criticalEndpointLimiter);
app.use('/api/studio/generation', criticalEndpointLimiter);
```

---

## 8. Route Registration System

### `registerRoutes` (server/routes.ts)

`registerRoutes(httpServer, app)` is the central function. It:

1. Registers `requestIdMiddleware` → every request gets a UUID in `AsyncLocalStorage` (auto-included in all pino log lines)
2. Registers `attachUser` globally
3. Registers per-user API response caching (30 s TTL, ETag, `stale-while-revalidate`)
4. Registers `criticalEndpointLimiter` on expensive route groups
5. Registers the CSRF token endpoint
6. Registers all core auth endpoints inline (login, register, logout, etc.)
7. Dynamically loads all sub-routers

### Dynamic sub-router loading (`safeLoadRoute`)

Every route file is loaded via a try/catch dynamic `import()`. This prevents a single broken route module from crashing the entire server:

```ts
async function safeLoadRoute(name, importFn) {
  try {
    const mod = await importFn();
    if (mod.default && typeof mod.default === 'function') {
      if (mod.default.stack !== undefined) return { type: 'router', value: mod.default };
      return { type: 'function', value: mod.default };  // setup function
    }
    if (typeof mod.setupReliabilityEndpoints === 'function')
      return { type: 'function', value: mod.setupReliabilityEndpoints };
    return { type: 'skip', value: null };
  } catch (error) {
    const isCritical = ['auth','billing','stripeWebhook','admin','security','storage'].includes(name);
    logger.error({ err: error }, `[routes] LOAD FAILURE '${name}'`);
    return null;
  }
}
```

Critical routes (`auth`, `billing`, `admin`, `security`, `storage`) log louder on failure but do not crash the process — all route loading is best-effort.

### Route module contract

A route file must default-export either:
- An Express `Router` instance (has a `.stack` array): mounted with `app.use('/prefix', router)`
- A setup function `(app) => void`: called as `fn(app)` to register routes directly

### Route file list (90+ files in server/routes/)

All routes are under the `/api/` prefix. Selected important groups:

| File | Prefix / Coverage |
|------|------------------|
| `auth.ts` | `/api/auth/*` — social OAuth, 2FA, email verify, password reset |
| `admin.ts` / `admin/` | `/api/admin/*` — user management, system config, beat loop controls |
| `billing.ts` | `/api/billing/*` — Stripe subscriptions, checkout, portal |
| `storage.ts` | `/api/storage/*` — file storage, uploads |
| `socialMedia.ts` | `/api/social/*` — posts, scheduling, analytics |
| `socialOAuth.ts` | `/api/social/oauth/*` — platform OAuth flows |
| `studio.ts` | `/api/studio/*` — DAW project management |
| `studioGeneration.ts` | `/api/studio/generation/*` — MaxCore-gated generation |
| `marketplace.ts` | `/api/marketplace/*` — beat store, listings |
| `distribution.ts` | `/api/distribution/*` — DistroKid-like distribution |
| `analytics.ts` + `analytics-internal.ts` | `/api/analytics/*` |
| `ai.ts` | `/api/ai/*` — AI assistant, local helpers |
| `autopilot.ts` / `advertisingAutopilot.ts` | `/api/autopilot/*`, `/api/advertising/*` |
| `beatMoneyLoop` (in admin/) | `/api/admin/beat-loop/*` |
| `maxcoreProxy.ts` | Mounted last at root — all MaxCore paths |
| `webhooks/` | `/api/webhooks/*` — Stripe, SendGrid, TikTok, etc. |
| `prometheus.ts` | `/metrics` — Prometheus scrape endpoint |

---

## 9. Core Auth Endpoints (in routes.ts)

These are registered directly in `routes.ts` rather than in a sub-router, because they handle session operations that need access to route-level session helpers.

| Method | Path | Rate limit | Auth required | What it does |
|--------|------|-----------|--------------|-------------|
| `GET` | `/api/csrf-token` | — | None | Issues/returns CSRF token |
| `GET` | `/api/auth/me` | — | None | Returns current user or `null` |
| `POST` | `/api/auth/register` | `registerRateLimiter` | None | Create account, session, welcome email |
| `POST` | `/api/auth/login` | `loginRateLimiter` | None | bcrypt verify, 2FA, session regenerate, JWT issue |
| `POST` | `/api/auth/logout` | — | None | Destroy session, revoke JWT tokens |
| `POST` | `/api/auth/heartbeat` | — | Session | Touch session to reset rolling TTL |
| `POST` | `/api/auth/refresh-token` | — | Session | Re-issue JWT access token |
| `GET` | `/api/auth/onboarding-status` | — | Session | Onboarding step |
| `POST` | `/api/auth/update-onboarding` | — | Session | Advance onboarding step |
| `GET` | `/api/auth/profile` | — | Session | Safe user object (no password/secrets) |
| `PUT` | `/api/auth/profile` | — | Session | Update profile fields |
| `POST` | `/api/auth/change-password` | — | `requireAuth` | bcrypt change, session revocation |
| `POST` | `/api/auth/forgot-password` | `forgotPasswordRateLimiter` | None | Email reset link |
| `POST` | `/api/auth/reset-password` | — | None | Token-gated password reset |
| `POST` | `/api/auth/verify-email` | — | None | Email verification token |
| `POST` | `/api/auth/setup-2fa` | — | `requireAuth` | Generate TOTP secret + QR code |
| `POST` | `/api/auth/verify-2fa` | `twoFactorRateLimiter` | `requireAuth` | Verify TOTP code, mark session verified |
| `POST` | `/api/auth/disable-2fa` | — | `requireAuth` | Remove TOTP secret |

### Login implementation highlights

```ts
// Timing-safe: always run bcrypt.compare even when user not found
const DUMMY_HASH = '$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234';
const candidateHash = user?.password ?? DUMMY_HASH;
const isValid = await bcrypt.compare(password, candidateHash);

// Session fixation prevention
await sessionRegenerate(req);   // new session ID on login
req.session.userId = user.id;
await sessionSave(req);

// JWT issued alongside session (PDIM fallback)
const { accessToken } = await jwtAuthService.issueTokens(user.id, user.role);
return res.json({ ...safeUser, sessionToken: accessToken });
```

Both session and JWT are issued on login. Clients that support cookies use the session cookie; mobile apps or scripts use the JWT bearer token. `requireAuth`/`requireAuthOnly` check both.

---

## 10. MaxCore Proxy

File: `server/routes/maxcoreProxy.ts`  
Purpose: Exposes the external Python AI server through the Node API layer.

### Why it exists

- Hides `AI_SERVER_KEY` from the browser (never sent to client)
- Prevents CORS issues (same-origin from browser's perspective)
- Enforces user identity binding (IDOR prevention)
- Rewrites relative media URLs from MaxCore (`/uploads/…`) to absolute `AI_SERVER_URL` URLs
- Streams binary media without buffering
- Enforces a 120 s timeout with clean 504 error

### Route registration

The proxy registers fixed path lists for POST, GET, and DELETE, each behind `requireAuthOnly`:

```ts
for (const p of POST_PATHS) router.post(p, requireAuthOnly, proxyToMaxCore);
for (const p of GET_PATHS)  router.get(p,  requireAuthOnly, proxyToMaxCore);
for (const p of DELETE_PATHS) router.delete(p, requireAuthOnly, proxyToMaxCore);
```

The router is mounted at root (no prefix) so paths like `/api/generate/content` are matched at their full `/api/…` path.

### Proxied paths

**POST:**
```
/api/content/generate         /api/generate/content
/api/generate/text            /api/generate/image
/api/generate/audio           /api/generate-video
/api/generate/video           /api/video/generate-ai
/api/platform/video/generate  /api/platform/social/generate
/api/platform/social/autopilot /api/platform/daw/generate
/api/platform/distribution/plan
/api/platform/ads/generate    /api/platform/ads/autopilot
/api/platform/ads/audience    /api/platform/ads/optimize
/api/platform/ads/record
/api/content/score            /api/analyze
/api/analyze/sentiment        /api/analyze/audio
/api/audio/analyze            /api/safety/screen
/api/infer/viral-score        /api/predict/engagement
/api/storage/artist/:profileId
/api/storage/artist/:profileId/releases
/api/training/start-from-storage  (admin key also required)
/api/platform/model/reload        (admin key also required)
```

**GET:**
```
/api/platform/video/generate
/api/platform/ads/performance/:userId
/api/video-jobs               /api/video-job/:jobId
/api/video-job/:jobId/preview/:sceneIdx
/api/video-job/:jobId/download /api/video-job/:jobId/file
/api/video-job/:jobId/video
/api/audio-job/:jobId
/api/storage/artist/:profileId
/api/platform/model/info
```

**DELETE:** `/api/video-job/:jobId`

### Auth header rule (critical — do not change)

MaxCore **401s immediately** if either `X-API-Key` or `X-Admin-Key` is present on a normal generation endpoint. Use **Bearer only**:

```ts
headers['Authorization'] = `Bearer ${AI_SERVER_KEY}`;
// Only admin-path operations additionally get:
if (isAdminPath && MAXCORE_ADMIN_KEY) headers['X-Admin-Key'] = MAXCORE_ADMIN_KEY;
```

The two admin-only paths that accept `X-Admin-Key` are:
- `/api/training/start-from-storage`
- `/api/platform/model/reload`

### IDOR guard

Before forwarding, the proxy checks that the authenticated user can only address their own `userId` / `profileId`:

```ts
const paramId = req.params.userId || req.params.profileId;
if (paramId && authUser?.role !== 'admin' && paramId !== authUser?.id) {
  return res.status(403).json({ error: 'Forbidden', message: 'Cannot access another user\'s resources' });
}
```

### User identity injection

The proxy overwrites `user_id` and `userId` in the request body unconditionally with the authenticated user's ID:

```ts
src.user_id  = authUser.id;  // overwrites any caller-supplied value
src.userId   = authUser.id;
```

This prevents privilege escalation via crafted request bodies.

### Media URL rewriting

MaxCore returns relative paths like `"/uploads/audio_x.mp3"` in JSON responses. The proxy rewrites them to absolute URLs:

```ts
// Matches keys like url, href, audio_url, video_path, thumbnail_url, etc.
const MEDIA_URL_KEYS = /(^|_)(url|href)$|_(url|path)$/i;
const RELATIVE_MEDIA = /^\/(uploads|media|static|files|outputs)\//i;
// Recursively walks the response tree and prepends AI_SERVER_URL
```

### Binary streaming

For `image/*`, `video/*`, `audio/*`, `application/octet-stream` responses, the body is piped directly without buffering:

```ts
if (isBinary(contentType)) {
  res.status(upstream.status);
  Readable.fromWeb(upstream.body).pipe(res);
  return;
}
```

### Timeout and error responses

```
Timeout (AbortSignal.timeout(120_000)) → 504 Gateway Timeout
Network error / MaxCore crash         → 502 Bad Gateway
MaxCore not configured (no AI_SERVER_URL) → 503 Service Unavailable
```

---

## 11. Static File Serving

Three separate `express.static` registrations at different points to optimise different access patterns:

| When | What | Why |
|------|------|-----|
| Before session (early sync setup) | `client/public/` | PWA manifest, `sw.js`, robots.txt — always fast, never PDIM cost |
| Inside async init, before session | `dist/public/assets/` via `serveStaticFiles` | Pre-built hashed JS/CSS for the ~10 s boot window |
| Before all `/api` routes | `/generated-content`, `/uploads/images`, `/uploads/videos`, `/uploads/audio` | User-generated media with correct MIME types and `Accept-Ranges` |

The SPA catch-all (`serveStatic`) is registered **last** — after all API routes — and serves `dist/index.html` for all non-API GETs. It handles Open Graph meta injection and multi-tenant subdomain routing.

### Service worker cache headers

`sw.js` gets special treatment to prevent stale service worker bugs:

```ts
if (filePath.endsWith('sw.js')) {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
}
```

---

## 12. Error Handling

### `globalErrorHandler` (middleware/errorHandler.ts)

Four-argument Express error handler registered last in the middleware stack. Normalises all error types:

| Error type | Status | Code |
|-----------|--------|------|
| `AppError` | `err.statusCode` | `err.code` |
| `ZodError` | 400 | `VALIDATION_ERROR` |
| `ValidationError` | 400 | `VALIDATION_ERROR` |
| `CastError` | 400 | `INVALID_FORMAT` |
| PG `23505` (unique violation) | 409 | `DUPLICATE_RESOURCE` |
| PG `23503` (FK violation) | 400 | `INVALID_REFERENCE` |
| `MulterError LIMIT_FILE_SIZE` | 400 | `FILE_TOO_LARGE` |
| `PaymentError` | 402 | `PAYMENT_FAILED` |
| Any PDIM error message | 500 | Sanitised — client sees generic message |
| Any 500 in production | 500 | `"Internal server error"` (no stack leak) |

Response shape:

```json
{
  "success": false,
  "error": {
    "message": "...",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "timestamp": "2026-07-29T...",
    "requestId": "abc123",
    "details": { "stack": "..." }  // development only
  }
}
```

Every error is written to the audit log with `userId`, `ip`, `method`, `url`, `statusCode`, `risk` level.

### `AppError` class

```ts
throw new AppError('Resource not found', 404, true, 'NOT_FOUND', { id: userId });
//                  message              code  operational  code    context
```

`isOperational: true` = expected business-logic error, no page should crash  
`isOperational: false` = programming error, triggers graceful shutdown in production

### Graceful shutdown

`SIGTERM` / `SIGINT` → `server.close()` → wait for in-flight requests → `process.exit(0)`  
`uncaughtException` / `unhandledRejection` (non-PDIM) → graceful shutdown with 10 s force-exit

---

## 13. Environment Variables Reference

All validated at startup by `server/config/env.ts` (Zod schema). Required variables crash the process with a clear message if missing.

| Variable | Required | Description |
|----------|----------|-------------|
| `SESSION_SECRET` | **Yes** (≥32 chars) | Signs session cookies. Rotating this logs out all users. |
| `NEON_DATABASE_URL` | **Yes** (one of) | Primary Neon PostgreSQL connection string |
| `DATABASE_URL` | **Yes** (one of) | Alias; Neon is preferred |
| `NODE_ENV` | No (default `development`) | `production` enables secure cookies, HTTPS redirects, stricter error messages |
| `PORT` | No (default `5000`) | Server listen port |
| `AI_SERVER_URL` | For AI features | Base URL of the MaxCore Python server (no trailing slash) |
| `AI_SERVER_KEY` | For AI features | Bearer token for MaxCore generation endpoints |
| `MAXCORE_ADMIN_KEY` | For admin AI ops | Additional header for model/reload and training routes |
| `REDIS_URL` | For PDIM | ioredis connection string |
| `POCKET_DIMENSION_KEY` | For PDIM | Auth key for the Pocket Dimension storage VM |
| `STRIPE_SECRET_KEY` | For billing | `sk_live_…` or `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | For billing | `whsec_…` from Stripe dashboard |
| `STRIPE_PRICE_ID_PRO_MONTHLY` | For billing | Stripe price IDs |
| `STRIPE_PRICE_ID_PRO_ANNUAL` | For billing | " |
| `STRIPE_PRICE_ID_ELITE_MONTHLY` | For billing | " |
| `STRIPE_PRICE_ID_ELITE_ANNUAL` | For billing | " |
| `SENDGRID_API_KEY` | For email | SendGrid API key |
| `SENDGRID_FROM_EMAIL` | For email | Verified sender address |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | For Google OAuth | |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` | For YouTube OAuth | |
| `SENTRY_DSN` | For monitoring | Sentry error tracking DSN |
| `APP_URL` | For CSP | Used in `connectSrc` in Helmet CSP policy |
| `BASE_URL` / `BASE_DOMAIN` | For callbacks | Used in OAuth redirect URIs and email links |
| `BOOSTERSTATE_SECRET` | For internal S2S | Bypasses CSRF for server-to-server API calls |
| `MAX_CONCURRENT_REQUESTS` | Performance | Admission control ceiling (default 5000) |
| `RATE_LIMIT_GLOBAL_IP` | Performance | Override Layer 2 per-IP limit (default 300/min) |
| `RATE_LIMIT_GLOBAL_USER` | Performance | Override Layer 2 per-user limit (default 2000/min) |
| `RATE_LIMIT_AI` | Performance | AI endpoint limit (default 100/hour) |
| `RATE_LIMIT_BILLING` | Performance | Billing endpoint limit (default 60/min) |
| `CLUSTER_WORKER_ID` | Cluster mode | Set by `server/cluster.ts`; `"0"` = background worker |

---

## 14. How to Rebuild From Scratch

This section is a clean guide for recreating this API layer in a new Express/Node project.

### Step 1 — Core dependencies

```bash
npm install express express-session connect-redis ioredis cookie-parser \
  compression helmet express-rate-limit \
  bcrypt jsonwebtoken otplib qrcode \
  drizzle-orm @neondatabase/serverless \
  zod pino pino-pretty \
  stripe @sendgrid/mail \
  multer \
  typescript tsx
```

### Step 2 — Environment validation

Create `server/config/env.ts` with a Zod schema. Validate eagerly at startup, throw on missing required vars, warn on optional vars. Export a single typed `env` object. Never read `process.env` directly anywhere else.

```ts
import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development','production','test']).default('development'),
  PORT: z.coerce.number().default(5000),
  SESSION_SECRET: z.string().min(32),
  DATABASE_URL: z.string().url().optional(),
  // ... add everything your app needs
});
export const env = schema.parse(process.env);
```

### Step 3 — Express app bootstrap

```ts
// server/index.ts
const app = express();
const httpServer = createServer(app);

// 1. Security headers first
app.use(helmet({ contentSecurityPolicy: { ... } }));
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', '...');
  next();
});

// 2. Fast health check BEFORE session (deployment checks must always pass)
app.use((req, res, next) => {
  if (req.path === '/api/health') return res.json({ status: 'ok' });
  next();
});

// 3. Start listening BEFORE async init (health checks pass immediately)
httpServer.listen(env.PORT, '0.0.0.0', () => console.log(`Listening on ${env.PORT}`));

// 4. All the rest in an async IIFE
(async () => {
  // Compression
  app.use(brotliMiddleware());
  app.use(compression({ level: 6, threshold: 256 }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Static assets BEFORE session
  app.use(express.static('client/public', { maxAge: 0 }));

  // Session
  const store = await createSessionStore();  // see Step 4
  app.use(session(getSessionConfig(store)));

  // CSRF
  app.use(generateCsrfToken);
  app.use(csrfProtectionWithExemptions);

  // API middleware
  app.use('/api', globalRateLimiter);
  app.use('/api', admissionControl);

  // Routes
  await registerRoutes(httpServer, app);

  // Error handler (must be last, 4-arg signature)
  app.use(globalErrorHandler);

  // SPA fallback (must be after error handler in this setup, or before depending on your SPA)
  app.get('*', (req, res) => res.sendFile(path.resolve('dist/index.html')));
})();
```

### Step 4 — Session store with Redis + PG fallback

```ts
// server/middleware/sessionConfig.ts
export async function createSessionStore(): Promise<session.Store> {
  await ensurePgSessionTable();  // CREATE TABLE IF NOT EXISTS pg_sessions ...

  try {
    const redis = new Redis(env.REDIS_URL);
    await redis.ping();
    const redisStore = new RedisStore({ client: wrapIoredis(redis), prefix: 'sess:', ttl: 86400 });
    return new PdimSessionStore(redisStore);  // L1 + Redis + PG fallback
  } catch {
    console.warn('Redis unavailable — using PostgreSQL-only session store');
    return new PgOnlySessionStore();  // L1 + PG only
  }
}
```

Key decisions:
- Wrap ioredis to match connect-redis v9's node-redis API expectations
- Add L1 in-process cache (5 min TTL, max 5000 entries) on top
- `touch()` and `set()` must call `cb()` immediately — do not wait for Redis (blocks HTTP responses)
- PG fallback table: `pg_sessions (sid TEXT PK, sess TEXT, expire BIGINT)`

### Step 5 — CSRF double-submit cookie

```ts
// Middleware 1: Issue token if absent
app.use((req, res, next) => {
  if (!req.cookies['csrf-token']) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('csrf-token', token, { httpOnly: false, secure: isProd, sameSite: 'strict', maxAge: 86400000 });
  }
  next();
});

// Middleware 2: Validate on mutating requests
app.use((req, res, next) => {
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  if (isExemptPath(req.path)) return next();
  const cookie = req.cookies['csrf-token'];
  const header = req.headers['x-csrf-token'] as string;
  if (!cookie || !header || !timingSafeEqual(Buffer.from(cookie), Buffer.from(header)))
    return res.status(403).json({ error: 'CSRF validation failed' });
  next();
});
```

Frontend must read the `csrf-token` cookie and send its value as the `X-CSRF-Token` header on every POST/PUT/PATCH/DELETE. Do not mark this cookie `HttpOnly` — JS must be able to read it.

### Step 6 — Auth middleware

```ts
// requireAuth: session OR JWT Bearer
export const requireAuth = async (req, res, next) => {
  // 1. Check JWT Bearer header (mobile / API clients)
  if (!req.isAuthenticated?.()) {
    const token = req.headers.authorization?.slice(7);
    if (token) {
      const { userId } = jwt.verify(token, env.JWT_SECRET);
      req.user = await db.users.findById(userId);
      req.isAuthenticated = () => true;
    }
  }
  // 2. Reject unauthenticated
  if (!req.isAuthenticated?.()) return res.status(401).json({ error: 'Authentication required' });
  // 3. Check subscription status
  if (isSubscriptionExpired(req.user)) return res.status(403).json({ subscriptionExpired: true });
  next();
};
```

Issue both a session cookie and a JWT access token on login. Session is the primary; JWT is the fallback for when the session store is unavailable.

### Step 7 — MaxCore proxy

```ts
// server/routes/maxcoreProxy.ts
router.post(AI_PATHS, requireAuthOnly, async (req, res) => {
  const target = `${process.env.AI_SERVER_URL}${req.originalUrl}`;

  // IDOR guard
  const paramId = req.params.userId || req.params.profileId;
  if (paramId && req.user.role !== 'admin' && paramId !== req.user.id)
    return res.status(403).json({ error: 'Forbidden' });

  // Inject identity — overwrite any caller-supplied user_id
  const body = { ...req.body, user_id: req.user.id, userId: req.user.id };

  const upstream = await fetch(target, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${process.env.AI_SERVER_KEY}`,  // Bearer ONLY
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  // Stream binary, parse and rewrite JSON
  const ct = upstream.headers.get('content-type');
  if (isBinary(ct)) {
    res.status(upstream.status);
    Readable.fromWeb(upstream.body).pipe(res);
  } else {
    const json = await upstream.json();
    res.status(upstream.status).json(absolutizeMediaUrls(json, process.env.AI_SERVER_URL));
  }
});
```

Critical rules:
1. **Bearer only** — `X-API-Key` causes an immediate 401 from MaxCore
2. **Always overwrite** `user_id` and `userId` from the authenticated session
3. **Stream binary** — never buffer images/audio/video in memory
4. **Absolutize media URLs** — MaxCore returns relative paths; prepend `AI_SERVER_URL`
5. **120 s timeout** — generation is slow; 504 on timeout, 502 on network error

### Step 8 — Rate limiting

Layer 1 (express-rate-limit, before session):
```ts
app.use(rateLimit({ windowMs: 900_000, max: 2000, standardHeaders: true }));
```

Layer 2 (Redis sliding-window, after session):
```ts
// For each rate-limited endpoint, build a middleware like:
export const loginRateLimiter = makeRateLimiter({
  keyFn: (req) => `auth:login:${req.ip}`,
  windowMs: 900_000,
  max: 10,
  // Falls back to in-memory at 25% limit when Redis is unavailable
});
```

Layer 3 (admission control):
```ts
let concurrentRequests = 0;
const MAX = parseInt(process.env.MAX_CONCURRENT_REQUESTS ?? '5000');
app.use('/api', (req, res, next) => {
  if (concurrentRequests >= MAX * 0.9) return res.status(503).set('Retry-After', '5').json({ error: 'Server busy' });
  concurrentRequests++;
  res.on('finish', () => concurrentRequests--);
  next();
});
```

### Step 9 — Route file pattern

Each route file should follow this pattern:

```ts
// server/routes/myFeature.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/my-feature', requireAuth, async (req, res) => {
  try {
    const data = await storage.getMyFeature(req.user.id);
    res.json(data);
  } catch (err) {
    next(err);  // propagates to globalErrorHandler
  }
});

export default router;
```

Register in `routes.ts`:
```ts
const mod = await safeLoadRoute('myFeature', () => import('./routes/myFeature.js'));
if (mod?.type === 'router') app.use('/api/my-feature', mod.value as Router);
```

### Step 10 — Error handler

```ts
// server/middleware/errorHandler.ts
export function globalErrorHandler(err, req, res, _next) {
  let status = err.statusCode ?? err.status ?? 500;
  let message = err.message;

  // Never leak internals in production
  if (status >= 500 && isProduction) message = 'Internal server error';

  // Normalise known error types
  if (err.name === 'ZodError') { status = 400; message = err.issues[0]?.message; }
  if (err.code === '23505') { status = 409; message = 'Resource already exists'; }

  if (!res.headersSent) {
    res.status(status).json({ success: false, error: { message, statusCode: status, timestamp: new Date().toISOString() } });
  }
}
```

Register **last** before the SPA fallback.

---

## Common Gotchas (Learned the Hard Way)

| Gotcha | What happens | Fix |
|--------|-------------|-----|
| `X-API-Key` header on MaxCore | Instant 401 on all generation calls | Use Bearer only; never add `X-API-Key` to MaxCore requests |
| Static assets registered after session | Assets block for hundreds of ms during PDIM congestion | Register `express.static` before `app.use(session(...))` |
| `touch()` awaits Redis | Every rolling-session request blocks on PDIM round-trip | Call `cb()` immediately; PDIM write is fire-and-forget |
| CSRF cookie as `httpOnly: true` | Frontend JS can't read the cookie → every POST 403s | Cookie must be `httpOnly: false` |
| Two separate Helmet calls | Second call overrides the first (weaker policy wins) | One `securityMiddleware` call only |
| Route 404 falls through to SPA | Missing API endpoints return `text/html` | Register `app.use('/api/', jsonNotFoundGuard)` after all routes |
| Session regeneration on login missing | Session fixation attack possible | Always call `session.regenerate()` before setting `session.userId` |
| MaxCore relative `/uploads/` URLs in JSON | Browser resolves against your domain → 404 or SPA HTML | `absolutizeMediaUrls()` in proxy response handler |
| `PDIM circuit OPEN` errors swallowed as 500 | Client sees "Internal server error" instead of 503 | Check `instanceof AIUnavailableError` before `res.status(500)` catch-all |
| Rate limiter in dev mode stalls login | Dev has no Redis; all limiters use degraded 25%-limit mode | All Layer 2 limiters skip when `NODE_ENV !== 'production'` |
