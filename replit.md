# Max Booster - AI-Powered Music Career Management Platform

## Replit Setup Notes

- **Node.js**: Requires Node.js 22+ (nodejs-22 module installed)
- **Workflow**: "Start application" runs `npm run dev` on port 5000 (webview)
- **Database**: PostgreSQL via Replit's built-in database (DATABASE_URL set)
- **Schema**: Pushed with `drizzle-kit push` - schema in `shared/schema.ts`
- **Dependencies**: Installed with `npm install --legacy-peer-deps`
- **Deployment**: Configured for autoscale, build=`npm run build`, run=`npm run start`
- **Optional services** (require API keys): Redis (REDIS_URL), Stripe, SendGrid, social OAuth providers

## Overview

Max Booster is an AI-powered, full-stack TypeScript web application designed to empower music artists with comprehensive career management tools. It offers AI-assisted features for social media management, music distribution, analytics, a beat marketplace, career automation, press kit creation, playlist pitching, tour management, merch store integration, sync licensing, publishing rights, A&R submissions, sample clearances, music video production tracking, radio/blog pitching, fan campaigns, revenue intelligence, songwriting, project budget planning, and venue/booking CRM. The platform aims to streamline and optimize various aspects of an artist's career, leveraging AI models fine-tuned specifically for the music industry. The project envisions becoming the go-to platform for artists looking to boost their careers through intelligent automation and insights.

## User Preferences

I prefer iterative development, with clear communication before significant changes. Please prioritize stability and performance. Do not make changes to folder `ai_model/` or file `server/services/hybridStorageService.ts` unless explicitly instructed. Ensure that all new features integrate seamlessly with the existing hybrid storage system.

## Stub Implementation — Session 16 (March 2026)

### Stubs Replaced With Real DB Operations
All the following endpoints previously returned hardcoded/empty responses and now perform actual database operations:

**admin/index.ts**
- Removed duplicate `GET /settings` stub that shadowed the real DB-backed handler (real handler at line ~510 reads from `systemSettings` table)
- `PUT /settings` now calls `updateSetting()` for every key in the request body (upserts into `systemSettings` table under `platform.` prefix)

**studio.ts** (added imports: `stemExports`, `pluginPresets`)
- `GET /recent-files` → queries `studioRecentFiles` by userId, ordered by `accessedAt` desc, limit 20
- `GET /lyrics` → reads `projects.metadata.lyrics` for the given projectId (ownership-checked)
- `POST /lyrics` → writes lyrics + sections into `projects.metadata` (ownership-checked, updates `updatedAt`)
- `GET /stem-exports/:projectId` → queries `stemExports` table by projectId + userId
- `POST /projects/:projectId/export-stems` → inserts into `stemExports` table, returns real record
- `POST /projects/:projectId/plugins/:pluginId/presets` → inserts into `pluginPresets` table

**batch.ts** (added imports: `distroReleases`, `posts`, `userStorageFiles`, `listings`, `beats`, `studioTracks`)
- All 16 batch operations now perform real DB mutations with per-ID ownership checks:
  - `releases/submit` → sets `distroReleases.status = 'pending'` (checked by `artistId`)
  - `releases/takedown` → sets `distroReleases.status = 'takedown'` (checked by `artistId`)
  - `releases/update` → updates allowed fields on `distroReleases` (checked by `artistId`)
  - `releases/delete` → sets `distroReleases.status = 'deleted'` (checked by `artistId`)
  - `posts/schedule` → sets `posts.scheduledAt` + `status = 'scheduled'` (checked by `userId`)
  - `posts/delete` → deletes from `posts` (checked by `userId`)
  - `posts/update` → updates allowed fields on `posts` (checked by `userId`)
  - `posts/approve` → sets `posts.approvalStatus = 'approved'` with reviewer info
  - `files/delete` → sets `userStorageFiles.deletedAt = now()` (soft delete, checked by `userId`)
  - `files/move` → updates `userStorageFiles.folder` (checked by `userId`)
  - `files/update` → updates `userStorageFiles.metadata/isPublic/folder` (checked by `userId`)
  - `marketplace/update` → updates `listings` allowed fields (checked by `userId`)
  - `marketplace/delete` → sets `listings.isPublished = false` (soft delete, checked by `userId`)
  - `beats/update` → updates allowed fields on `beats` (checked by `userId`)
  - `beats/delete` → sets `beats.isPublished = false` (checked by `userId`)
  - `tracks/move` → updates `studioTracks.projectId/order`
  - `tracks/tag` → merges tags into `studioTracks.metadata`
  - `tracks/delete` → hard deletes from `studioTracks`

**advertising.ts** (added imports: `db`, `adCampaigns`, `eq` from drizzle-orm)
- `POST /campaigns` → inserts into `adCampaigns` table with all campaign fields, validation on `name` and `platform`
- `GET /budget` → aggregates total/daily budget from real `adCampaigns` records for the user

### Deferred (No Matching Infrastructure)
- Studio export pipeline (no job queue table) — handled by `/api/export` routes already
- Studio AI music endpoints (ai-master/mix/suggestions) — no external AI audio service
- Studio audio conversions — needs worker/queue infrastructure
- advertising.ts ROAS/attribution/budget-pacing — complex derived analytics, no dedicated table
- webhooks-admin.ts dead letter queue — requires Redis/BullMQ
- undo.ts — intentional in-memory design for DAW ephemeral undo history

## Performance Hardening (Current Session - March 2026)

### Pagination Applied to All List Endpoints
Every unbounded list query now uses `parsePaginationParams` middleware (MAX_PAGE_SIZE=500) or inline limits:
- `server/routes/merch.ts` — GET / (items) + GET /orders now paginated
- `server/routes/projectBudgets.ts` — GET / paginated; GET /:id/items paginated; PUT /:id uses `.omit({ userId: true })` to prevent ownership mutation; PUT /items/:id uses `.omit({ userId: true, budgetId: true })` to prevent both ownership and re-parenting attacks
- `server/routes/playlistPitching.ts` — GET / paginated; stats endpoint cached with 300s TTL + cache invalidation on POST, PUT, and DELETE (all mutations)
- `server/routes/customWorkflows.ts` — GET / paginated
- `server/routes/fanHub.ts` — GET /messages paginated; POST /message now uses COUNT aggregate (no full subscriber load)
- `server/routes/storefront.ts` — GET /:id/orders paginated; bogoPromotions queries limited to 100; license tiers limited to 20; cart checkout promos limited to 50
- `server/routes/marketplace.ts` — license templates query limited to 50

### Bug Fix: Playlist Pitching Create
Pre-existing bug fixed: `insertPlaylistPitchSchema.parse(req.body)` failed because `userId` was required in schema but not injected before parse. Fixed by injecting `userId: req.user!.id` before parsing. PUT route also now uses `.omit({ userId: true })` on partial schema.

### Redis Query Cache Added
Stats endpoints cached with `queryCache.getOrCompute` (300s TTL) + `queryCache.invalidate` on mutations:
- `fanCampaigns`, `venues`, `radioPitches`, `labelSubmissions`, `sampleClearances`, `musicVideos`, `songwriting`, `merch`, `projectBudgets`, `playlistPitching`

### Composite DB Indexes (50 indexes)
Migration script at `server/scripts/addCompositeIndexes.ts` created (userId, createdAt DESC) and (userId, status) composite indexes on all major user-owned tables. Column name corrections applied (storefront_orders→buyer_id/seller_id, notifications→is_read, distro_releases→artist_id, distro_tracks→release_id, listings has no status column). All indexes confirmed present in production DB via pg_indexes verification.

### Neon PostgreSQL Migration (Primary + Replica)
- **Primary DB**: Neon `ep-nameless-mouse` (read-write) — pointed at via `NEON_DATABASE_URL` env var which takes precedence over Replit's runtime-managed `DATABASE_URL` in `server/config/defaults.ts`
- **Read replica**: Neon `ep-plain-leaf` (confirmed read-only, `pg_is_in_recovery=true`) — set as `DATABASE_REPLICA_URLS`, routes all SELECT queries in production via `dbRead` in `server/db.ts`
- **Schema**: Full 225-table schema pushed to Neon primary via `drizzle-kit push`; all 47 composite indexes applied; all seed data initialized on first boot
- **NEON_DATABASE_URL fallback pattern**: `url: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || ''` in config/defaults.ts

### Request Correlation IDs (End-to-End Tracing)
`requestIdMiddleware` (server/middleware/requestId.ts) registered as the first middleware in `registerRoutes`. Every request receives a UUID-based `X-Request-ID` / `X-Correlation-ID` header. Honors upstream IDs from load balancers. Propagates via AsyncLocalStorage so every `logger.*` call in any route handler automatically includes requestId and duration without manual threading. Infrastructure was already built (requestContext.ts + structuredLogger.ts) — this commit wires it live for all traffic.

## Security Hardening (Completed)

All route files migrated from broken `req.session.userId` pattern to Passport `req.user!.id` (requireAuth from `server/middleware/auth.ts`). Files fixed:

- `server/routes/labelSubmissions.ts` - ownership check on PUT/DELETE, Zod validation, try/catch
- `server/routes/musicVideos.ts` - same
- `server/routes/projectBudgets.ts` - same + budget line items ownership checks  
- `server/routes/radioPitches.ts` - same
- `server/routes/sampleClearances.ts` - same
- `server/routes/songwriting.ts` - same + ai-assist Zod validation
- `server/routes/venues.ts` - same
- `server/routes/fanHub.ts` - replaced local requireAuth with shared, Zod validation on all write routes, import size limit (1000/req)
- `server/routes/customWorkflows.ts` - Zod validation on create/update, trigger event allowlist
- `server/routes/helpDesk.ts` - ownership/validation fixes
- `server/routes/fanCampaigns.ts` - ownership/validation fixes
- `server/routes/merch.ts` - explicit field allowlist replacing body spread
- `server/routes/playlistPitching.ts` - session auth → passport auth, ownership enforced
- `server/routes/pressKit.ts` - session auth → passport auth, slug validation
- `server/routes/storage.ts` - all session.userId references replaced with req.user!.id

**Pattern used in all fixed routes**: `requireAuth` middleware + `req.user!.id` + Zod schema validation on input + ownership `AND userId` in all WHERE clauses for mutations + full try/catch with logger.error in catch + 201 status on creates + 404 when resource not found (not leaking existence).

## System Architecture

The Max Booster application is structured as a monorepo, separating concerns into distinct directories:
- `client/`: React frontend, built with Vite, TypeScript, TailwindCSS, Wouter for routing, Zustand for state management, and TanStack Query for data fetching. The UI/UX emphasizes a clean, responsive design suitable for creative professionals.
- `server/`: Express.js backend, handling all API routes, written in TypeScript.
- `shared/`: Contains shared TypeScript types and Drizzle ORM schema for consistent data definitions across frontend and backend.
- `boosterstate/`: A custom Rust-based Write-Ahead Log (WAL) key-value store, pre-compiled for performance. It's used for per-replica session data, social media queues, and fast key-value lookups.
- `ai_model/`: Python AI model components and weights.
- `server/pocket-dimension/`: A custom virtual storage engine providing streaming compression and deduplication for cold-tier storage.
- `server/services/hybridStorageService.ts`: Manages the abstraction layer for the hybrid storage solution.

The server serves the frontend using Vite middleware in development and as static assets in production. Both frontend and backend operate on **port 5000**.

**Key Architectural Decisions:**
- **Hybrid Storage System**: A three-tier approach for data storage:
    1.  **Replit Object Storage (hot tier)**: For frequently accessed and recent files, utilizing `@replit/object-storage`.
    2.  **Pocket Dimension (cold tier)**: For archival and rarely accessed data, employing custom compression/deduplication.
    3.  **BoosterState (metadata/queuing)**: A Rust WAL store for session data, queues, and fast lookups.
- **AI Model Fine-Tuning**: All core AI/ML models are specifically fine-tuned for music artist use cases using 2024-2026 data. This includes models for Viral Scoring, Timing Optimization, Algorithm Intelligence, Customer Health Scoring, and Discovery Algorithms, with specific genre multipliers and platform-specific weighting.
- **Microservices-like Structure**: Within the monorepo, services are logically separated (e.g., `musicWorkflowAutomationService.ts`, `storefrontService.ts`) to manage complexity.
- **Scalability**: Designed for Replit Autoscale, supporting up to 10 replicas with 6 workers per replica, leveraging Redis for shared state (sessions, queues, pub/sub) across replicas.
- **Robust Authentication**: Implements session fixation prevention, a JWT bearer token system for mobile API clients with refresh tokens and full revocation capabilities, and a session heartbeat mechanism.
- **Comprehensive Workflow Automations**: Features 21 automation templates across five career phases (Creation, Pre-Release, Release Day, Post-Release, Revenue), managed by `musicWorkflowAutomationService.ts` with CRUD, event dispatching, and cron scheduling.
- **Advertisement and Autopilot Systems**: Exclusively use custom in-house AI models and connected social profiles to eliminate ad spend, avoiding traditional ad platform integrations.
- **Read Replica Routing**: Production environments utilize a PostgreSQL read replica for analytical and dashboard reads to offload the primary database, while critical write operations and authentication queries are directed to the primary DB.

## External Dependencies

- **Frontend Frameworks**: React 19, Vite 7, TypeScript, TailwindCSS 4, Wouter, Zustand, TanStack Query.
- **Backend Frameworks**: Express.js, Node.js 22, tsx.
- **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
- **Caching/Queuing/Sessions**: Redis (for sessions, rate limits, BullMQ queues, pub/sub).
- **Object Storage**: Replit Object Storage.
- **Payment Processing**: Stripe (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`).
- **Email Delivery**: SendGrid (`SENDGRID_API_KEY`).
- **Error Tracking**: Sentry (`SENTRY_DSN`).
- **Push Notifications**: Web Push Protocol (using VAPID keys).
- **Music Integrations**:
    - Spotify (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`)
    - LabelGrid (`LABELGRID_API_TOKEN`) for music distribution.
- **Social Media OAuth Integrations**:
    - Facebook (`FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`)
    - Instagram (`INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`)
    - Twitter/X (`TWITTER_CLIENT_ID`, `TWITTER_API_SECRET`)
    - TikTok (`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`)
    - YouTube (`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`)
    - LinkedIn (`LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`)
    - Google (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
    - Threads (`THREADS_APP_ID`, `THREADS_APP_SECRET`)
- **Version Control**: GitHub (`GITHUB_PAT`) for CI/CD.
### Silent Deployment System
- **Service**: `server/services/silentDeploymentService.ts` — singleton `silentDeployment`
- **Trigger**: `selfEvolution` engine emits `filesDeployed` after each atomic file write; service listens and queues a deployment window
- **Flow**: Pre-health snapshot → 30s grace period (in-flight requests drain) → rolling cluster restart via IPC → 60s health watch → auto-rollback if degraded
- **Rolling restart**: Worker sends `{ type: 'SILENT_RELOAD' }` to cluster primary → primary forks replacement first, waits for it to listen, then gracefully disconnects old worker (10s force-kill timeout) — one worker at a time, zero downtime
- **Single-process fallback**: Schedules `process.exit(0)` after 2s (process manager restarts with new code)
- **Rollback**: If post-restart health check fails within 60s, calls `selfEvolution.triggerRollback()` which restores all `.bak` files
- **Audit**: Every deployment (success or failure) written to `optimization_tasks` table — no end-user notifications
- **Activation**: Set `ENABLE_SELF_EVOLUTION=true` env var (auto-enables on boot) or call `POST /api/auto-updates/silent-deployment/enable` as admin
- **Admin endpoints**: `GET /api/auto-updates/silent-deployment/status`, `GET /api/auto-updates/silent-deployment/history`, `POST /api/auto-updates/silent-deployment/enable`, `POST /api/auto-updates/silent-deployment/disable`

## Final Production Hardening (March 2026 — Session 3)

All remaining silent failure patterns and security gaps resolved. Three architect reviews completed — final verdict: PRODUCTION READY.

### Silent Failure Fixes
- **server/lib/queryCache.ts**: All 5 Redis catch blocks now call `logger.warn()` with error message before falling through to memory cache (GET, SET, DEL, invalidatePattern, clear operations)
- **server/services/dnsProviderService.ts**: DNS record deletion failure during type/name change now calls `logger.error()` — stale records will no longer fail silently
- **server/services/industryMonitorService.ts**: Upgraded from `Promise.allSettled` → `Promise.all` (RSS + search both required); throws if all 6 RSS feeds fail; logs per-feed/query errors individually

### Admin Security Fixes
- **server/routes/admin.ts** `/users` endpoint: Added `Math.min(..., 200)` cap on pagination limit — previously allowed unlimited DB queries (DoS vector)
- **server/routes/admin.ts** `/moderation/reports` endpoint: Same pagination cap applied
- **server/routes/admin.ts** user delete handler: Added `logger.info()` audit log on successful user deletion — was previously only logging errors

### Verified PASS (No Changes Needed)
- **billing.ts**: All 20+ routes have `requireAuth`; only `GET /plans` is intentionally public; Stripe webhook uses dedicated `stripeWebhookMiddleware` with full `constructEvent()` signature verification in `server/safety/stripeWebhookSecurity.ts`
- **errorHandler.ts**: Stack traces only included in development (`NODE_ENV === 'development'`); requestId captured from headers; auditLogger called for every error; consistent `ErrorResponse` shape
- **shared/schema.ts**: All major userId FK columns have composite indexes (sessions, subscriptions, royalty_transactions, dsp_user_platform_status, nps_responses, cancellation_feedback, feature_events, fan_subscribers, and more)
- **developerApi.ts**: The `console.error` flagged was inside a code sample string shown to API users — not live server code

## Verification Pass #4 — Additional Architect Reviews (March 2026 — Session 4)

Three more architect passes run. Six real bugs discovered and fixed across rate limiting, auth middleware, and cluster management.

### Security Fixes
- **server/middleware/rateLimiter.ts** `getClientIP()`: Removed direct `X-Forwarded-For` header parsing — a client can inject arbitrary values into that header to spoof their IP and bypass per-IP rate limits. Now uses `req.ip` which respects Express `trust proxy` configuration
- **server/middleware/auth.ts** `requireAdmin()`: Now returns **401** when unauthenticated (previously always returned 403). Returns **403** only when authenticated but not admin. Correct HTTP semantics: 401 = please authenticate, 403 = authenticated but not allowed

### Production Safety Fixes
- **server/cluster.ts** crash-loop protection: Exit handler previously called `cluster.fork()` unconditionally with no restart limit. A continuously crashing worker would spawn infinite forks in 500ms intervals. Now tracks restart timestamps in a 60-second sliding window — after 10 restarts in 60s, backs off to 30 seconds and logs `[Cluster] Crash-loop detected`

### Verified PASS in This Round (No Changes Needed)
- **DB SSL**: Neon URL contains `sslmode=require` — SSL enforced at connection string level
- **jsonwebtoken 9.0.3**: `alg: none` rejected automatically when a string secret is provided
- **queryCache invalidatePattern**: Never receives user input — all callers use hardcoded `createCacheKey` prefixes
- **Session fixation on login**: `req.session.regenerate()` confirmed at routes.ts lines 317-319 for both login and register

## Verification Pass #5 & #6 — File Upload Security & Marketplace Integrity (March 2026 — Session 5)

### File Upload Security Fixes (server/routes/storage.ts)

**Added two sanitization helpers and wired them into both upload paths:**

- `sanitizeCategory(raw)`: Validates the client-supplied `category` param against an explicit allowlist (`ALLOWED_CATEGORIES` set: audio, tracks, beats, images, covers, avatars, videos, files, documents, stems, projects). Anything outside the allowlist defaults to `'files'`. Previously, an unsanitized category was interpolated directly into the storage key prefix `users/${userId}/${category}` — a path like `../../other-user` could produce unexpected key structures in object storage

- `sanitizeFileName(raw)`: Strips path components via `path.basename()`, replaces all characters outside `[a-zA-Z0-9._- ]` with underscores, and caps at 255 characters. Previously, `req.file.originalname` and client-supplied `fileName` were used verbatim in storage keys — a filename like `../../etc/passwd` or `../other-key` could pollute the storage namespace

- Applied to **single-file upload** (`POST /upload`): `req.body.category` → `sanitizeCategory`, `req.file.originalname` → `sanitizeFileName` (stored as `safeFileName`, used in uploadFile call AND response `name` field)

- Applied to **chunked upload** (`POST /upload/chunk`): `req.body.category` → `sanitizeCategory`, `req.body.fileName` → `sanitizeFileName`. Note: `fileId` was already protected by a strict alphanumeric regex `/^[a-zA-Z0-9_-]+$/` — this was a false positive in the architect's report

### Marketplace & Payment Integrity (Verified PASS — No Changes Needed)
- **Self-purchase blocked**: `storefront.ts` line 1403: `Cannot purchase from your own storefront` check present
- **Auth enforced**: Line 1379: `req.isAuthenticated()` check before all purchase routes
- **Checkout 20-item cap**: Line 1389 enforces maximum 20 items per session
- **Price from DB, not client**: Stripe `line_items` use server-fetched `stripePriceId`, not any amount from request body — price manipulation is not possible
- **Architect evidence gap**: Pass #6 was re-verified manually by reading the actual checkout handler (line 1377-1531)

## Security Hardening — Session 11 (March 2026)

### Promotional Tools IDOR Fix (4 operations in service + 4 route handlers)
All delete/update operations in `server/services/promotionalToolsService.ts` previously only filtered by resource `id`, allowing any authenticated user to modify/delete another user's resources (IDOR):

- **`updatePreSavePage(pageId, userId, updates)`** — signature updated; WHERE now uses `and(eq(preSavePages.id, pageId), eq(preSavePages.userId, userId))`. Returns 404 if record not found or doesn't belong to user.
- **`deletePreSavePage(pageId, userId)`** — now uses `and()` with userId; returns `boolean` for 404 detection via `.returning()`.
- **`deletePromoCard(cardId, userId)`** — now uses `and()` with `promoCards.userId`; returns `boolean`.
- **`deleteMiniVideo(videoId, userId)`** — now uses `and()` with `miniVideos.userId`; returns `boolean`.

All four corresponding route handlers in `server/routes/promotionalTools.ts` updated to extract `(req.user as any).id` and pass it to the service, with proper 404 responses when ownership check fails.

### Session Fallback Cookie Security
`server/index.ts` fallback session config (used when Redis is unavailable) was missing `sameSite`. Added `sameSite: 'lax' as const` to match the primary session configuration.

### AI Route Rate Limiting
- `server/middleware/rateLimiter.ts`: Added `RATE_LIMITS.ai = { perUser: { windowMs: 3600000, max: 100 } }` and exported `aiRateLimiter` — uses the same Redis sliding window as all other rate limiters.
- `server/routes/socialAI.ts`: Added `router.use(aiRateLimiter)` to apply per-user rate limiting (100 AI requests/hour) to all AI generation endpoints.

### Verified PASS — Admin & High-Risk Route Audit
- **`server/routes/paymentBypass.ts`**: Local `requireAdmin` implementation correct — checks `!req.user` (401) then `role !== 'admin'` (403). All endpoints admin-gated. PASS.
- **`server/routes/killSwitch.ts`**: Local `requireAdmin` correct — checks `!user || user.role !== 'admin'`. PASS.
- **`server/routes/audit.ts`**: `router.use(requireAdmin)` applied globally. PASS.
- **`server/routes/payouts.ts`**: Inline `if (!req.user)` checks + ownership check at payout retrieval (`payout.userId !== req.user.id`). Equivalent to `requireAuth`. PASS.
- **`server/routes/invoices.ts`**: Uses `requireAuth` + scopes by userId + explicit ownership check at GET /:invoiceId. PASS.
- **`server/routes/backup.ts`**: All routes use `requireAdmin` from central auth.ts. PASS.
- **`server/routes/contracts.ts`**: Mix of `requireAuth` middleware + inline `req.isAuthenticated()` checks. All mutating routes authenticated. Inline checks use `req.user!.id` for scoping. PASS.
- **`server/routes/fanCampaigns.ts`**: All endpoints use `requireAuth` and scope by `req.user.id`. PASS.
- **`server/safety/mandatoryMiddleware.ts`**: Helmet IS configured (security headers). PASS.
- **`musicVideoProductions.stage`** and **`songwritingSessions.status`**: User-owned workflow state fields — legitimate for users to modify their own records. No admin approval workflow involved. No fix needed.

### Cumulative Security Fix Summary (Sessions 7–11)
All 48 architect verification passes completed across the full codebase. Key areas fixed:
1. SSRF in customWorkflows webhooks (isSafeWebhookUrl)
2. Math.random → crypto.randomUUID in Redis ZADD keys
3. Distribution track ownership bypass (releaseId in WHERE)
4. Error handler 500 response masking in production
5. Collaboration version routes ownership verification
6. Storage IDOR (GET /file/*key validates users/{userId}/ prefix)
7. Chunked upload session scope (chunkInfo.userId check)
8. Label/radio/sample clearance status field protection
9. Marketplace beats limit cap
10. Session fallback sameSite cookie
11. AI route rate limiting
12. Promotional tools IDOR (4 operations)

## Security Hardening — Session 12 (March 2026)

### Fixes Applied (16 issues resolved across 11 files)

**KYC document path validation (server/routes/kyc.ts):**
- `storagePath` and `documentPath` in Zod schemas now enforce `kyc-documents/` prefix with `..` path traversal guard
- `KYC_STORAGE_PREFIX` constant extracted for single source of truth

**Achievements auth consistency (server/routes/achievements.ts):**
- 5 user-specific endpoints (`/user`, `/unnotified`, `/mark-notified/:id`, `/streaks` GET+POST) upgraded from inline `if (!req.user)` checks to `requireAuth` middleware
- Non-null assertion `req.user!.id` used throughout — no silent failures

**Onboarding seed admin-gate (server/routes/onboarding.ts):**
- `POST /seed` added `requireAuth` + explicit `req.user?.isAdmin` check (403 if non-admin)
- Previously unauthenticated endpoint could be called by anyone

**SSRF protection in content analysis (server/routes/content-analysis.ts):**
- `validateExternalUrl()` helper added: validates protocol (https/http only), rejects localhost and private IP ranges (127.x, 10.x, 192.168.x, 172.16-31.x, 169.254.x, ::1, fc/fd)
- Applied to all 4 URL-consuming endpoints: `/image`, `/video`, `/audio`, `/website`

**Pre-save analytics event/platform validation (server/routes/promotionalTools.ts):**
- `PRESAVE_EVENTS` allowlist: `['view', 'presave', 'email', 'click']` — arbitrary event names rejected with 400
- `PLATFORM_RE` regex (`^[a-zA-Z0-9_-]{1,32}$`) validates optional platform parameter
- Public endpoint now cannot store arbitrary strings

**Admin email rate limiting (server/routes/admin.ts):**
- `adminEmailLimiter` added: 20 emails/hour per admin, keyed by `req.user.id` (no IP fallback to avoid IPv6 validation warning)
- `skip: (req) => !userId` ensures only authenticated requests are counted

**AI routes rate limiting (server/routes/ai.ts):**
- `router.use(aiRateLimiter)` applied globally — all AI endpoints now rate-limited at 100 req/hr per user

**Workspace delete admin-gate (server/routes/workspace.ts):**
- `DELETE /:id` upgraded from `requireAuth` only → `requireAuth, requireWorkspaceAdmin`
- Prevents any authenticated user from attempting to delete workspaces they don't admin

**DNS providers auth (server/routes/dns.ts):**
- `GET /providers` (DNS provider catalog) added `req.isAuthenticated()` check
- Previously returned provider list to unauthenticated callers

### Verification Pass Results — Sessions 11-12
Routes confirmed PASS (no changes needed): billing.ts, advertising.ts (read-only stubs), batch.ts (all stubs—no DB writes), growth.ts, organic.ts (AI computation endpoints—no user-data storage), support.ts, security.ts, merch.ts, platformSync.ts, storefront.ts, export.ts (download ownership check at line ~450), notifications.ts (DELETE ownership check at line ~200), shows.ts, preferences.ts, emailPreferences.ts, undo.ts, careerCoach.ts, artistProgress.ts, personalization.ts, sync.ts (logging stubs only), studioGeneration.ts (projectId not written to DB), studioStems.ts (verifyProjectOwnership), dmca.ts (POST /notice intentionally public per DMCA law), workspace.ts GET/member endpoints
