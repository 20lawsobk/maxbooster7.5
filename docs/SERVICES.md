# Server Services Reference

Services live in `server/services/` and encapsulate business logic above the data access layer. They are imported by route handlers and background workers.

---

## AI & Content Generation

### `maxcore.ts`
**`callMaxcore(path, body, options?)`** — Core client for the external MaxCore AI server (`secure-ai-forge.replit.app`).
- Uses `Authorization: Bearer` only (never `X-API-Key` or `X-Admin-Key` — those 401).
- Includes circuit breaker + bulkhead: rejects fast when MaxCore is known-down.
- `pingMaxcore()` — health check; returns `{ reachable: boolean }`.
- `requireMaxCore` — Express middleware that returns `503 AIUnavailableError` when MaxCore is unreachable.

**MaxCore endpoints (external):**

| Path | Method | Description |
|---|---|---|
| `/api/generate/content` | POST | Text/lyric/caption generation |
| `/api/generate/image` | POST | AI image (renders prompt as typographic art) |
| `/api/platform/video/generate` | POST | Beat ad video (sync, returns scene-script) |
| `/api/analyze/*` | POST | Audio/content analysis |
| `/api/platform/audio-job/:id` | GET | Poll async audio generation job |
| `/api/health` | GET | Reachability probe |

### `advertisingDispatchService.ts`
Orchestrates ad campaign delivery across social platforms.
- `dispatchCampaign(campaign)` — dispatches creatives to platform APIs.
- `getCampaignMetrics(campaignId)` — reads `organicMetrics` from DB; computes CTR/ROAS proxies.
- `optimizeTargeting(campaignId)` — writes targeting adjustments to `aiOptimizations.history`.
- `optimizeCreative(campaignId)` — scores creative variants; persists best performer.
- `optimizeBidding(campaignId)` — adjusts bid strategy based on ROAS.
- All `optimize*` methods return `boolean` — only `true` when a real DB change was persisted (honest applied-count reporting).

### `autonomousService.ts`
Runs the autonomous campaign intelligence loop.
- `runCampaignOptimization(campaignId)` — loads campaign, skips if impressions = 0, runs all three optimizer methods, counts and notifies for actually-applied changes.
- `runContentDispatch()` — posts scheduled social content and triggers campaign optimization for active campaigns.

### `contentGenerationService.ts`
Thin wrapper around MaxCore `/api/generate/content`.
- Handles `socialMedia`, `advertising`, `ai` content types.
- Crash-guards: defensively accesses optional `req.body` fields, nullable autopilot prefs, keyword/tag/performer arrays.
- Internal 25s timeout via `Promise.race`.

---

## Beat Money Loop

### `beatMoneyLoopService.ts`
The autonomous Beat Money Loop engine. Admin-only singleton. See [BEAT_MONEY_LOOP.md](BEAT_MONEY_LOOP.md) for full documentation.

Key methods:
- `runCycle(trigger, overrides?)` — runs a full generate→list cycle.
- `enable() / disable()` — toggle the scheduler.
- `getStatus()` — current state (enabled, active cycle, last result).
- `getCycles(limit?)` — cycle history from DB.
- `recoverOrphanedCycles()` — called ~75s after boot; marks stale running cycles as failed, excluding cycles started by the current process.

---

## Distribution

### `distributionService.ts`
DSP release submission and tracking.
- `submitRelease(releaseId)` — sends to configured DSP providers.
- `syncReleaseStatus(releaseId)` — polls DSP APIs for status updates.
- `generateISRC()` / `generateUPC()` — allocates codes from registry tables.

> Import fix: uses `import { storage as baseStorage }` — do not change to `import { storage }` (named export mismatch).

### `hyperFollowService.ts`
Pre-save landing page management for upcoming releases.
- Creates, updates, and tracks HyperFollow page conversions.

---

## Social Media

### `socialMediaService.ts`
Cross-platform post publishing.
- Posts to Instagram, TikTok, X, Facebook, YouTube via platform APIs.
- Token refresh before each call; marks account `error` on persistent failures.
- Instagram/Threads: 45s timeout (was 20s — circuit breaker triggered too fast).

### `autopilotService.ts`
UCB1-bandit-based social automation.
- `selectPlatform(history)` — UCB1 arm selection; seeds from static defaults + history; force-explores untried arms.
- `generateContent(platform, context)` — calls MaxCore for platform-specific copy.
- `runAutopilotCycle(userId)` — full scan → generate → schedule cycle.

### `socialListeningService.ts`
Monitors platform trending topics and brand mentions.
- Feeds data into autopilot context and analytics.

---

## Notifications

### `notificationService.ts`
In-app notification delivery.
- `createNotification(userId, type, payload)` — stores in DB; dispatches real-time via WebSocket.
- `getNotifications(userId)` — paginated fetch.

### `pushNotificationService.ts`
Web Push (VAPID) notification delivery.
- `sendPush(subscription, payload)` — sends via `web-push` library.
- Subscription storage and VAPID key management.

### `desktopPushService.ts`
Electron desktop notification integration.

---

## Auth & Session

### `jwtAuthService.ts`
- `signJWT(userId, role)` — mints token with `ver` claim.
- `verifyJWT(token)` — validates signature + version + revocation.
- `revokeJWT(tokenHash)` — marks token revoked in DB.
- `recordJwtFailure(ip)` / `isJwtBrute(ip)` — brute-force tracking.

---

## Media & AI

### `sharpImageService.ts`
Image processing via Sharp.
- `resize`, `convert`, `generateThumbnail`, `extractMetadata`.

### `diffBGService.ts` / `diffusion-gateway/`
Background diffusion (image generation) fallback.
- Checks external MaxCore URL first; falls back to local Python diffusion gateway only if MaxCore is unavailable.
- Local Gateway (port 8008) is not running in production.

### `videoService.ts`
Beat ad video generation and serving.
- Pure transport: submits to MaxCore → polls → caches result URL.
- No local re-encoding — MaxCore returns a servable URL.

---

## Analytics

### `analyticsService.ts`
Platform analytics aggregation.
- `getStreamingTrends(userId)` — DSP play counts and trajectory.
- `getRevenueReport(userId, range)` — beat sales + streaming royalties.
- `getAudienceDemographics(userId)` — geographic + age breakdown.

### `revenueForecastService.ts`
AI-assisted revenue projection.
- Uses MaxCore content-gen endpoint with financial context.

---

## Infrastructure

### `evolutionRegistry.ts` / `self-evolution-engine.ts`
Tracks and applies autonomous system "gap" improvements.
- `seenChangeIds` persisted via PDIM (`evolution-state/state.json`).
- Pruned to `MAX_SEEN_IDS` to prevent unbounded growth.
- Scripts must use a dedicated chain or Workers time out (separate chain from direct-call queue).

### `pdimService.ts` (PDIM)
Rate-limited high-throughput key-value store interface.
- Adaptive concurrency (AIMD), passive geometric decay, parallel direct lanes.
- Fast-fail to fallback storage when chain wait exceeds bound.
- L1 in-process cache on high-volume callers.

---

## Compliance & Safety

### `compliance/`
Legal and copyright compliance checks.
- Plagiarism detection, DMCA guard, terms enforcement.

### `safety/`
Content safety layer.
- Filters AI-generated content before delivery.
- Regex-based checks kept local (not MaxCore-dependent).

---

## Key Patterns

### Retry wrapper
All `DatabaseStorage` methods wrap DB calls in `_retryQuery(fn)` — 3 attempts with 300ms backoff for transient connection errors.

### `requireMaxCore` middleware
Any route that depends on MaxCore wraps its handler with this. Returns `503 { error: "AI service unavailable" }` immediately when MaxCore is known-down, rather than letting the request time out.

### `aiErrorStatus(err)`
Helper that maps `AIUnavailableError` → 503 before falling back to 500. Used in catch blocks to prevent the catch-all 500 from swallowing the 503.
