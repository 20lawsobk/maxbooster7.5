# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is an AI-powered, full-stack TypeScript web application designed to empower music artists with comprehensive career management tools. It offers AI-assisted features for social media management, music distribution, analytics, a beat marketplace, career automation, press kit creation, playlist pitching, tour management, merch store integration, sync licensing, publishing rights, A&R submissions, sample clearances, music video production tracking, radio/blog pitching, fan campaigns, revenue intelligence, songwriting, project budget planning, and venue/booking CRM. The platform aims to streamline and optimize various aspects of an artist's career, leveraging AI models fine-tuned specifically for the music industry, with the ambition to become the leading platform for artist career development through intelligent automation and insights.

## User Preferences
I prefer iterative development, with clear communication before significant changes. Please prioritize stability and performance. Do not make changes to folder `AI training server/ai_model/` or file `server/services/hybridStorageService.ts` unless explicitly instructed. Ensure that all new features integrate seamlessly with the existing hybrid storage system.

## System Architecture
The Max Booster application uses a monorepo structure, separating concerns into `client/`, `server/`, `shared/`, `boosterstate/`, `server/pocket-dimension/`, and `AI training server/`. The UI/UX emphasizes a clean, responsive design.

### Triangle Architecture
Max Booster operates on a three-point data flow:
1. **Max Booster → PDIM**: Application pushes all data exclusively to PDIM.
2. **MaxCore training server (`secure-ai-forge.replit.app`) ← PDIM**: MaxCore pulls training data from PDIM to train AI models.
3. **Max Booster AI models ← MaxCore**: Max Booster pulls trained model weights from MaxCore for inference.

### PDIM — Unified Storage Container
**PDIM (`pocketdimensionstorage.replit.app`) is the ONLY storage backend.** It functions as both a Redis-compatible layer (for job queues, pub/sub, caching) and a persistent object storage system, accessed via a single HTTP exec endpoint. There is no separate Redis server or object storage.

### Key Architectural Decisions:
-   **Pocket Dimension Storage Bubbles**: All major storage paths route through dedicated PDIM pockets with level-9 Gzip compression and SHA-256 content-addressed deduplication.
-   **Hybrid Storage System**: All storage operations are routed entirely through PDIM as the sole backend, with `HybridStorageService` providing a tiered API.
-   **AI Model Fine-Tuning**: All core AI/ML models are in-house, specifically fine-tuned for music artist use cases (e.g., Viral Scoring, Timing Optimization, Algorithm Intelligence) using industry-specific data. No external AI APIs are used.
-   **Microservices-like Structure**: Services are logically separated within the monorepo.
-   **Scalability**: Designed for Replit Autoscale with PDIM as the shared-state backend.
-   **Robust Authentication**: Implements session fixation prevention, JWTs with refresh, and session heartbeat.
-   **Comprehensive Workflow Automations**: 21 automation templates across five career phases, managed by `musicWorkflowAutomationService.ts`.
-   **Advertisement and Autopilot Systems**: Exclusively use custom in-house AI models and connected social profiles.
-   **AI Content Stack**: Multiple versions (v2, v3, v4) integrate advanced content science principles, generative engines (Markov), and adaptive intelligence (Beam Search, Per-Artist Engagement Feedback Loop) for social content generation and songwriting assistance.
-   **Video Generation Engine**: An in-house text-to-video neural network (UNetV4 + v4 Training Engine) built with NumPy, featuring continuous self-training.
-   **MaxCore DigitalGPU v2**: A domain-native compute engine and hardware accelerator design stack for optimized performance.
-   **Read Replica Routing**: PostgreSQL read replica for analytical and dashboard reads.
-   **Silent Deployment System**: Self-evolution engine for silent deployments with rolling restarts and auto-rollback.
-   **Security Hardening**: Includes IDOR prevention, improved session cookie security, AI route rate limiting, Zod-validated input, authentication consistency, and SSRF protection.
-   **Performance Hardening**: Pagination, Redis query caching, composite DB indexes, Neon PostgreSQL, and request correlation IDs.
-   **Gamified Onboarding**: RPG-style persona selector, XP system, and achievements.
-   **Studio DAW UI/UX**: Customizable toolbar, resizable panels, and Web Audio API integration.
-   **CI/CD**: GitHub Actions workflows for desktop and mobile platforms.
-   **Python Audio Analysis Engine**: Utilizes `librosa`, `soundfile`, `scipy`, `scikit-learn`, and `basic-pitch` for server-side audio intelligence (requires local Python 3.11 setup).
-   **Distribution Analytics**: Aggregates data from LabelGrid and royalty transactions for `streams-revenue` and `analytics/growth`.
-   **Offline Mode**: `OfflineProvider` and `ConnectionStatusBar` for app-wide offline context and background sync.
-   **Autopilot Learning Feedback Loop**: `autopilotLearningService.recordPerformance()` for learning timing/content patterns.
-   **Admin Functionality**: Dedicated admin UI for financial configuration, enhanced admin account privileges (lifetime access, priority in request queue), and improved admin routes for analytics and activity.
-   **Error Handling and Fixing**: `Chain Error Auto-Fixer` and `Platform Auto Error Fixer & Patcher` provide reactive and proactive system health monitoring and runtime patching.
-   **Comprehensive Parsing/Scraping**: Upgraded parsers for Apple iTunes, Deezer, JioSaavn, MusicBrainz, Audiomack, and numerous DSPs, along with an improved distribution webhook handler and ReleaseStatusDashboard.
-   **DSP Profile Hub**: Replaced "Auto Artist Sync" scanning model with a DSP portal ownership/claiming paradigm. The `AutoArtistSync.tsx` component was fully rewritten to show 8 DSP portal rows (Spotify for Artists, Apple Music for Artists, Amazon Music for Artists, YouTube OAC, Deezer for Creators, Tidal, Pandora, SoundCloud) with claimed/unclaimed status, claim action buttons, and 4 collapsible informational sections. Backend: `artistProfileService.ts` `profileHub()` method + `GET /api/artist-profiles/:id/profile-hub` route. ArtistProfileManager create dialog updated to "Create Profile" button and DSP Hub guidance text.

## External Dependencies
-   **Frontend Frameworks**: React, Vite, TypeScript, TailwindCSS, Wouter, Zustand, TanStack Query.
-   **Backend Frameworks**: Express.js, Node.js, tsx.
-   **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
-   **Storage / Queuing / Cache (unified)**: PDIM — Pocket Dimension (`pocketdimensionstorage.replit.app`).
-   **Machine Learning**: `@tensorflow/tfjs-node`.
-   **Payment Processing**: Stripe.
-   **Email Delivery**: SendGrid.
-   **Error Tracking**: Sentry.
-   **Push Notifications**: Web Push Protocol.
-   **Music Integrations**: Spotify, LabelGrid.
-   **Social Media OAuth Integrations**: Facebook, Instagram, Twitter/X, TikTok, YouTube, LinkedIn, Google, Threads.
-   **Version Control**: GitHub.
-   **Search APIs**: Exa, Tavily.

## Comprehensive Audit Fixes (March 2026)
A three-agent audit identified and resolved the following issues:

### Backend Bug Fixes
- **`server/index.ts`**: Removed duplicate `express.urlencoded({ extended: false })` call that was overriding the `{ extended: true, limit: '200mb' }` setting, breaking large form uploads.
- **`server/middleware/auth.ts`**: Extracted shared JWT bearer-token resolution into private `resolveJwtUser()` helper — eliminates duplicated verification logic between `requireAuth` and `requireAuthOnly`.
- **`server/routes/distribution.ts`**: Fixed three `file.filename` usages that returned `undefined` with `multer.memoryStorage()`. Track audio and HyperFollow header images are now properly uploaded to Pocket Dimension via `storageService.uploadFile()` before storing the URL.
- **`server/services/stripeService.ts`**: Replaced two `storage.getAllUsers()` calls (loads entire user table into memory) with direct indexed DB queries on `users.stripeCustomerId` — O(N) → O(1) lookup using the existing `users_stripe_customer_id_idx` index.
- **`server/routes/auth.ts`**: Fixed `trusted: false` hardcode in session list — now reads the actual `trusted` column value from the DB.
- **`server/routes/artistProfiles.ts`**: Added guard to check `spotifyArtistUri.startsWith('spotify:artist:')` before string replacement to avoid stripping valid bare IDs.

### Frontend Fixes
- **`client/src/App.tsx`**: Wrapped the main router in `<ErrorBoundary>` so any unhandled render crash shows the custom error UI instead of a blank white screen.
- **`client/src/pages/Distribution.tsx`**: Added `isLoading: statsLoading` to the playlist pitching stats query and render `'—'` placeholders during load instead of misleading zeroes.
- **`client/src/components/studio/UltimateDAW.tsx`**: Added `.catch()` handlers to both `forceSave()` call sites (Ctrl+S shortcut and Save button) so users are notified when a project save fails instead of silently discarding the error.

## Full-System Optimization Pass (March 2026 — Session 2)

### Critical Backend Fixes
- **`server/storage.ts` — `getBeatListings`**: Replaced JS post-filter search with SQL `ilike` expressions; genre/bpm/key/price filters now pushed to DB; `offset` param now used correctly for pagination (was always using 0).
- **`server/storage.ts` — `distroDispatchStore`**: Replaced in-memory `Map` (lost on restart) with DB persistence via the `systemSettings` table using key `distro_dispatch:{releaseId}`.
- **`server/storage.ts` — `getDistroAnalytics`**: Replaced JS-level month filtering (after 30-row limit) with five parallel DB aggregation queries — correct all-time totals and accurate month-over-month growth regardless of row count.
- **`server/storage.ts` — `getSocialMetrics`**: Filled `followersGrowth` (per-platform follower data from accounts) and `contentPerformance` (top 5 recent posts with engagement) instead of returning `null`.
- **`server/storage.ts` — `createAuditLog`**: Now inserts to `workspace_audit_log` table via Drizzle instead of returning a fake in-memory object.
- **`server/storage.ts`**: Added `workspaceAuditLog` to schema imports.

### Royalties Routes (Complete Implementation)
- **`server/routes.ts` — `/api/royalties/*`**: All stubs replaced with real DB implementations using `royaltyTransactions`, `royaltySplits`, and `taxForms` schema tables. Exports return real CSV data. Splits CRUD persisted to DB.

### Career Coach
- **`server/routes/careerCoach.ts`**: Added `/api/career-coach/insights` endpoint — health score, growth rate, velocity, and revenue trend all computed from DB.
- **`client/src/pages/CareerCoach.tsx`**: Replaced hardcoded `"+24%"` / `"87/100"` values with live API data from the insights endpoint.

### Notifications
- **`server/routes/notifications.ts`**: Pushed `unreadOnly` and `category` filters to the DB query (using `eq(notifications.isRead, false)` and a SQL JSON metadata predicate) instead of fetching 50 rows then filtering in JS — pagination now returns the correct count.

### Invoice PDF Download
- **`client/src/pages/Invoices.tsx`**: Added `downloadPDF()` function that fetches `/api/invoices/:id/pdf`, creates a Blob URL, and triggers browser download. Wired to both the table row download icon button and the preview dialog "Download PDF" button.

### Analytics Error Boundaries
- **`client/src/pages/Analytics.tsx`**: Added `ErrorBoundary` import; wrapped `StreamingAnalytics`, `RevenueAnalytics`, `AudienceInsights`, `ExportAnalytics`, `FanJourneyFunnel`, `ChurnAnalytics`, and `GeographicHeatMap` in `<ErrorBoundary>` so a chart crash in one tab can't take down the entire Analytics page.

### Autopilot Publisher Window Fix
- **`server/services/autopilotPublisher.ts` — `calculateNextOptimalPostingTime`**: Fixed missed-window bug: when the cron fires during an optimal hour (e.g., 12:05 when 12 PM is optimal), the function now schedules 5 minutes from now instead of jumping to the next window (e.g., 5 PM). Uses `sameHourSlot` check before the `>` search.

### Marketplace Persistence
- **`server/routes/marketplace.ts` — `GET /escrow`**: Now queries the `orders` table filtering by userId/sellerId with status `pending` or `escrow` — previously returned an empty array.
- **`server/routes/marketplace.ts` — `GET /affiliates` + `POST /affiliates`**: Now persists affiliate records to `systemSettings` table with key `affiliates:{userId}` — previously returned empty array and created affiliates that were discarded on each request.

### FlowState Export Fix
- **`client/src/components/studio/FlowStateExport.tsx`**: Fixed export URL from `/export` to `/render` to match the actual server endpoint.

## Full-System Optimization Pass (March 2026 — Session 3)

### Scheduled Post Storage Methods (previously all missing from storage.ts)
- **`server/storage.ts` — `getScheduledPosts(input)`**: Added — handles both `(userId: string)` calls (from social route) and `({ userId?, status? })` object calls (from autoPostingServiceV2). Queries `posts` table with status `scheduled` or `pending` filter.
- **`server/storage.ts` — `createScheduledPost(post)`**: Added — maps `ScheduledPost` interface (platforms[], content object, scheduledTime, viralPrediction, createdBy) to the `posts` table columns, storing extra fields in `metadata` JSONB.
- **`server/storage.ts` — `getScheduledPostById(id)`**: Added — fetches post and reconstructs `ScheduledPost` shape from metadata.
- **`server/storage.ts` — `updateScheduledPost(id, updates)`**: Added — maps field updates back to `posts` table columns.
- **`server/storage.ts` — `updateScheduledPostStatus(id, status, results?)`**: Added — updates status and sets `publishedAt` on completion.

### Marketplace Collaborations (previously a hardcoded stub)
- **`server/routes/marketplace.ts` — `GET /collaborations`**: Now queries `collaborationProjects` table for projects where user is owner AND `metadata._offerType = 'marketplace_collab'`, plus projects where user is a `projectMembers` member. Maps back to `CollaborationOffer` shape.
- **`server/routes/marketplace.ts` — `POST /collaborations`**: Now persists collaboration offers to `collaborationProjects` table with all offer data (toUserId, beatId, type, terms, splitPercentage, budget, messages) stored in `metadata` JSONB.

### Marketplace Listing Stems (fully implemented)
- **`shared/schema.ts` — `listingStems` table**: New `listing_stems` table added with columns: `id, listing_id, user_id, stem_name, stem_type, file_url, file_size, format, sample_rate, bit_depth, price, download_count, created_at`.
- **`server/routes/marketplace.ts` — `GET /my-stems`**: Now queries `listingStems` by userId.
- **`server/routes/marketplace.ts` — `GET /listings/:listingId/stems`**: Now queries `listingStems` by listingId.
- **`server/routes/marketplace.ts` — `POST /listings/:listingId/stems`**: New endpoint — inserts a stem record (requires auth).
- **`server/routes/marketplace.ts` — `DELETE /stems/:stemId`**: New endpoint — deletes user-owned stem (requires auth).
- **`server/routes/marketplace.ts` imports**: Added `collaborationProjects, projectMembers, listingStems` from schema; added `inArray` from drizzle-orm.

### ShowPage Session Code Fix
- **`client/src/pages/ShowPage.tsx`**: Replaced `Math.random()` session code (changed every render) with a stable `btoa(window.location.pathname)` derivation — same show always shows same code within a page session.

## Full-System Optimization Pass (March 2026 — Session 4)

### Royalty Splits — Real DB Persistence
- **`server/services/distributionService.ts` — `setupRoyaltySplit`**: Now actually persists to the `royalty_splits` table via Drizzle ORM. Clears existing splits for the release before inserting new ones. Validates that percentages sum to 100% (within 0.01 tolerance). Returns `{ success, splitId, splits: insertedRows }` instead of the previous stub.

### Studio Source Label Fix
- **`server/routes/studio.ts` — `GET /samples`**: Removed misleading `source: 'hardcoded'` label from the response; now returns `source: 'builtin'` accurately reflecting the curated sample library.

### Security Service — Real Database Health Check
- **`server/services/securityService.ts` — `checkServiceHealth('database')`**: Now executes `SELECT 1` against the Neon DB to confirm connectivity before measuring response time. Added `db` and `sql` imports. Stripe health check now verifies `STRIPE_SECRET_KEY` env var presence instead of silently returning healthy.

### Marketplace — Cryptographically Secure Affiliate Codes
- **`server/routes/marketplace.ts` — `POST /affiliates`**: Replaced `Math.random()` affiliate code generation with `crypto.randomBytes(3).toString('hex').toUpperCase()` for unpredictable, collision-resistant codes.

### Advertising Stub Coverage Verified
- Confirmed all 14 advertising storage stubs replaced in Session 3 remain intact and no new stubs were introduced in routes/advertising.ts, routes/organic.ts, routes/paid.ts, routes/advertisingAutopilot.ts, routes/growth.ts, routes/contracts.ts, routes/earnings.ts, or routes/notifications.ts.

### Cross-Platform Analytics Verified
- Confirmed `GET /api/analytics-alerts/cross-platform-comparison` is properly registered (routes.ts line 3940) and implemented with real DB queries against `dspAnalytics` table in `analyticsAlertService.ts`.