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
- **Pocket Dimension Storage Bubbles**: All major storage paths route through dedicated PDIM pockets with level-9 Gzip compression and SHA-256 content-addressed deduplication.
- **Hybrid Storage System**: All storage operations are routed entirely through PDIM as the sole backend, with `HybridStorageService` providing a tiered API.
- **AI Model Fine-Tuning**: All core AI/ML models are in-house, specifically fine-tuned for music artist use cases (e.g., Viral Scoring, Timing Optimization, Algorithm Intelligence) using industry-specific data. No external AI APIs are used.
- **Microservices-like Structure**: Services are logically separated within the monorepo.
- **Scalability**: Designed for Replit Autoscale with PDIM as the shared-state backend.
- **Robust Authentication**: Implements session fixation prevention, JWTs with refresh, and session heartbeat.
- **Comprehensive Workflow Automations**: 21 automation templates across five career phases, managed by `musicWorkflowAutomationService.ts`.
- **Advertisement and Autopilot Systems**: Exclusively use custom in-house AI models and connected social profiles.
- **AI Content Stack**: Multiple versions (v2, v3, v4) integrate advanced content science principles, generative engines (Markov), and adaptive intelligence (Beam Search, Per-Artist Engagement Feedback Loop) for social content generation and songwriting assistance.
- **Video Generation Engine**: An in-house text-to-video neural network (UNetV4 + v4 Training Engine) built with NumPy, featuring continuous self-training.
- **MaxCore DigitalGPU v2**: A domain-native compute engine and hardware accelerator design stack for optimized performance.
- **Read Replica Routing**: PostgreSQL read replica for analytical and dashboard reads.
- **Silent Deployment System**: Self-evolution engine for silent deployments with rolling restarts and auto-rollback.
- **Security Hardening**: Includes IDOR prevention, improved session cookie security, AI route rate limiting, Zod-validated input, authentication consistency, and SSRF protection. Admin settings PUT enforces 20-key allowlist; API key creation validates scopes against an explicit allowlist; search queries capped at 200 chars; all JSON.parse from user input is try-catched; search offset clamped to ≥ 0.
- **9-Phase Optimization Pass (2026-03)**: Dead code removed (splitsContract.ts, splitService.ts, royaltiesForecastingService.ts); releaseWorkflow.ts confirmed live; careerCoach.ts previousAnalytics/previousRevenue queries fixed (30–60 day window via `lte`); followersGrowth/currentFollowers now included in insights output; careerCoach health score includes revenueTrend; DELETE+PUT /goals/:id endpoints added; careerCoachService.ts has updateGoal()/deleteGoal(); songwriting.ts: standalone /rhyme/:word endpoint, 26 genre progressions (added phonk+lofi), fixed duplicate rhyme keys; shows.ts: PATCH /:id/attendance + /:id/status endpoints, stats query optimized 3→1 (conditional aggregation), avgCapacityFill added; revenueForecast.ts: 5 wrong error formats fixed; syncLicensing.ts: PUT now sets updatedAt; venues.ts: removed redundant venueCount duplicate, added declined count in stats; postingUtils.ts created (shared detectHookPattern); contracts.ts: GET /tax-rates and GET /marketplace-disputes moved before GET /:contractId (were shadowed — critical routing bug fix); **Error format standardization (phase 1)**: 98 occurrences of `{ message: 'Internal server error' }` normalized to `{ error: 'Failed to process request' }` across 13 route files; **Route shadowing audit**: All 116 route files scanned — zero single-segment literal routes shadowed by /:param routes; marketplace.ts hardened; apiKeys.ts rate-limited (10 ops/hour per user, 20-key cap); **assistant.ts hardening**: N+1 delete loop replaced with bulk `inArray` delete; rate limiter added (30 req/min, admin-exempt); `req.body ?? {}` guard prevents 500 on empty body; **New capability endpoints**: `DELETE /:id` added to revenueForecast (with deleteForecastById service); `PATCH /:id/status` added to syncLicensing (sets licensedTo/licenseFee/licensedAt on licensed status); `PATCH /:id/status` + `POST /:id/followup` added to labelSubmissions (full outcome + follow-up tracking); `PATCH /:id/status` added to playlistPitching (placed/accepted/rejected/under_review states, auto-sets responseAt/submittedAt); `PATCH /:id/status` added to radioPitches (featured/aired/rejected states + featureUrl capture); **Error format standardization (phase 2)**: 378 occurrences of `{ message: }` in response bodies normalized to `{ error: }` across 27 route files (accessibility.ts, achievements.ts, admin.ts, batch.ts, billing.ts, collaborations.ts, connectedAccounts.ts, emailPreferences.ts, fabric.ts, fanHub.ts, invoices.ts, musicVideos.ts, notifications.ts, paid.ts, preferences.ts, shortcuts.ts, shows.ts, socialAI.ts, socialMedia.ts, socialOAuth.ts, studio.ts, undo.ts, and others); **Auth middleware standardization**: All 6 response points in server/middleware/auth.ts (requireAuth, requireAuthOnly, requireAdmin — including trial-expiry and subscription-expiry 403s) normalized to `{ error: }` key; entire platform now has zero `{ message: }` in any HTTP error response body; 12/12 live endpoint checks passing.
- **Performance Hardening**: Pagination, Redis query caching, composite DB indexes (applied directly via SQL CONCURRENTLY on analytics, projects, releases, posts, content_calendar tables), Neon PostgreSQL, and request correlation IDs. All Redis middleware operations (rate limiters, admission control, session store) have 400–500ms timeouts with automatic fallback to in-process or PostgreSQL stores — preventing PDIM congestion from stalling API requests. Steady-state response times: 200–400ms; startup congestion: 500–2000ms.
- **Reliability Fixes (2026-03)**: queueBackpressure overlapping-check guard (`_checkInFlight` flag); AudioFingerprintService LRU cap 5000 entries; databaseBackupService fd leak on error; deleteOldCollabSnapshots bulk-DELETE; seedPluginCatalog single bulk INSERT; admin `getSocialCalendarStats` SQL GROUP BY (no JS row scan); `updateAiProfile` per-user write lock; aiModelVersions query limited to 100; platformRows engagement query limited to 100.
- **Accessibility Fixes (2026-03)**: Sidebar overlay keyboard handler (Escape/Enter); sidebar aria-hidden uses `isDesktop` media-query state so desktop nav is never hidden from screen readers; tabIndex changed from -1 to 0 on overlay button.
- **Error Resilience (2026-03)**: ErrorBoundary added around StudioOneDAW, ArtistProgressDashboard, RevenueForecast; search history insert logs warning instead of silently swallowing; sidebar visibleNavItems memoized.
- **Gamified Onboarding**: RPG-style persona selector, XP system, and achievements.
- **Studio DAW UI/UX**: Customizable toolbar, resizable panels, and Web Audio API integration.
- **CI/CD**: GitHub Actions workflows for desktop and mobile platforms.
- **Python Audio Analysis Engine**: Utilizes `librosa`, `soundfile`, `scipy`, `scikit-learn`, and `basic-pitch` for server-side audio intelligence (requires local Python 3.11 setup).
- **Distribution Analytics**: Aggregates data from LabelGrid and royalty transactions for `streams-revenue` and `analytics/growth`.
- **Offline Mode**: `OfflineProvider` and `ConnectionStatusBar` for app-wide offline context and background sync.
- **Autopilot Learning Feedback Loop**: `autopilotLearningService.recordPerformance()` for learning timing/content patterns.
- **Admin Functionality**: Dedicated admin UI for financial configuration, enhanced admin account privileges (lifetime access, priority in request queue), and improved admin routes for analytics and activity.
- **Error Handling and Fixing**: `Chain Error Auto-Fixer` and `Platform Auto Error Fixer & Patcher` provide reactive and proactive system health monitoring and runtime patching.
- **Comprehensive Parsing/Scraping**: Upgraded parsers for Apple iTunes, Deezer, JioSaavn, MusicBrainz, Audiomack, and numerous DSPs, along with an improved distribution webhook handler and ReleaseStatusDashboard.
- **DSP Profile Hub**: Replaced "Auto Artist Sync" scanning model with a DSP portal ownership/claiming paradigm, displaying 8 DSP portal rows with claimed/unclaimed status.
- **Share & Embed Panel**: New Distribution tab (`share-embed`) with `EmbedCodeGenerator` component — generates LabelGrid WordPress shortcodes (`[labelgrid_smartlink]`, `[labelgrid_release]`, `[labelgrid_player]`), HTML iframe embeds, QR codes (via `qrcode` package with PNG download), live previews for button/widget/player types, and a release selector wired to `/api/distribution/releases`.

## External Dependencies
- **Frontend Frameworks**: React, Vite, TypeScript, TailwindCSS, Wouter, Zustand, TanStack Query.
- **Backend Frameworks**: Express.js, Node.js, tsx.
- **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
- **Storage / Queuing / Cache (unified)**: PDIM — Pocket Dimension (`pocketdimensionstorage.replit.app`).
- **Machine Learning**: `@tensorflow/tfjs-node`.
- **Payment Processing**: Stripe.
- **Email Delivery**: SendGrid.
- **Error Tracking**: Sentry.
- **Push Notifications**: Web Push Protocol.
- **Music Integrations**: Spotify, LabelGrid.
- **Social Media OAuth Integrations**: Facebook, Instagram, Twitter/X, TikTok, YouTube, LinkedIn, Google, Threads.
- **Version Control**: GitHub.
- **Search APIs**: Exa, Tavily.