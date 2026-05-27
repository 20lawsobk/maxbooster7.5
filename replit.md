# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is an AI-powered, full-stack TypeScript web application designed to empower music artists with comprehensive career management tools. It offers AI-assisted features for social media management, music distribution, analytics, a beat marketplace, career automation, press kit creation, playlist pitching, tour management, merch store integration, sync licensing, publishing rights, A&R submissions, sample clearances, music video production tracking, radio/blog pitching, fan campaigns, revenue intelligence, songwriting, project budget planning, and venue/booking CRM. The platform aims to streamline and optimize various aspects of an artist's career, leveraging AI models fine-tuned specifically for the music industry, with the ambition to become the leading platform for artist career development through intelligent automation and insights.

## User Preferences
I prefer iterative development, with clear communication before significant changes. Please prioritize stability and performance. Do not make changes to folder `AI training server/ai_model/` or file `server/services/hybridStorageService.ts` unless explicitly instructed. Ensure that all new features integrate seamlessly with the existing hybrid storage system.

**Agent reminder:** At the end of every task, update the "Accomplishments Log" section in this file AND `.local/agent-notes.md` with what was built, which files were changed, and the test baseline. This compensates for context-window limits across sessions.

## System Architecture
The Max Booster application uses a monorepo structure, separating concerns into `client/`, `server/`, `shared/`, `boosterstate/`, `server/pocket-dimension/`, and `AI training server/`. The UI/UX emphasizes a clean, responsive design and a Studio DAW-like interface with TopBar, LeftSidebar Browser, MainArea with view tabs (Timeline / Mixer / Node Graph / Flow), and RightSidebar Universal Inspector.

The core of the system is a "Triangle Architecture" data flow: Max Booster pushes all data exclusively to PDIM, MaxCore training server pulls training data from PDIM, and Max Booster pulls trained model weights from MaxCore for inference. PDIM serves as the ONLY unified storage backend, functioning as both a Redis-compatible layer and a persistent object storage system with level-9 Gzip compression and SHA-256 content-addressed deduplication.

Key architectural decisions include:
- All core AI/ML models are in-house, specifically fine-tuned for music artist use cases (e.g., Viral Scoring, Timing Optimization, Algorithm Intelligence) using industry-specific data. MaxCore (`secure-ai-forge.replit.app`) is the sole AI source across all endpoints.
- Microservices-like logical separation within the monorepo for scalability, designed for Replit Autoscale with PDIM (`pocketdimensionstorage.replit.app`) as the shared-state backend.
- Robust authentication with session fixation prevention, JWTs with refresh, and session heartbeat.
- Comprehensive workflow automations managed by `musicWorkflowAutomationService.ts`, and a Unified Content Orchestration System for all content generation.
- Custom in-house AI models exclusively used for Advertisement and Autopilot Systems, integrating an advanced AI Content Stack (v2, v3, v4) for social content and songwriting.
- A Multimodal Content Generation System via `server/services/multimodalGenerationService.ts` orchestrates text, image, audio, and video generation, all calling MaxCore. This includes a Video Generation Engine, Voice Synthesis Engine, and Python Audio Analysis Engine for media processing, along with a Beat Audio Separator for generating MP3s and frequency-band stems from uploaded WAV beats.
- Offline mode for app-wide context and background sync.
- Autopilot Learning Feedback Loop for recording performance patterns.
- Dedicated admin UI for financial configuration.
- `Chain Error Auto-Fixer` and `Platform Auto Error Fixer & Patcher` for system health and runtime patching.
- Profile Claiming System v2 for artist profile management.
- Per-Artist Storefront Deployment System for dynamic domain management and multi-tenant routing, including a full DIY DNS Infrastructure (`dns-os/`, `dns-node/`) with DNSSEC, GeoDNS, BGP Anycast, EPP Registrar Client, and an Authoritative DNS Server. This also features a Domain Registrar System and a Multi-Provider DNS Adapter supporting various commercial DNS providers.
- Advanced AI Routing through `unifiedAIController.generateContent()` to MaxCore, using seeded, deterministic outcomes for content generation, aesthetic elements, and AI decision-making (including UCB1 Multi-Armed Bandit for topic selection).
- Three-Tier Video Diffusion Architecture: Max Booster → MaxCore Rendering Engine relay → MaxCore AI Content Gateway → MaxCore.
- Performance hardening features include pagination, composite DB indexes, Neon PostgreSQL, request correlation IDs, server-side in-memory API cache, Brotli compression, browser caching, i18n lazy-loading, IndexedDB async query-cache persister, non-blocking Google Fonts, and DNS resource hints.
- Canonical image upload patterns and specific handling for beat marketplace cover art.
- Generated contracts are persisted in the `generated_contracts` PostgreSQL table.
- Storage quota system based on `user_storage_files` table, `mime_type`, and `subscription_tier`.
- Advertising autopilot performance endpoint computes ROI estimates.
- AI generation pipeline (`server/services/diffusion/gen_engine_v2/`) includes GPU-aware primitives (`ops.py`), `UNetV5` for image generation, `SchedulerV2` with `DPMSolver2M` and `KarrasSampler`, `AudioSynthV2` for music engine (DSP and MaxCore AI modes), `TrainerV5`, `LTXAdapter` for a 3-tier backend cascade, and `api_server_v5.py`.

## External Dependencies
- **Frontend Frameworks**: React, Vite, TypeScript, TailwindCSS, Wouter, Zustand, TanStack Query.
- **Backend Frameworks**: Express.js, Node.js, tsx.
- **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
- **Storage / Queuing / Cache (unified)**: PDIM — Pocket Dimension (`pocketdimensionstorage.replit.app`).
- **Machine Learning**: `@tensorflow/tfjs`.
- **Payment Processing**: Stripe.
- **Email Delivery**: Resend (`RESEND_API_KEY`), verified sender domain `max-booster.com`, from `noreply@max-booster.com`. SendGrid deprecated (permanently quota-locked).
- **Error Tracking**: Sentry.
- **Push Notifications**: Web Push, Desktop Push, Mobile Push (FCM v1 API / legacy FCM).
- **Music Integrations**: Spotify, LabelGrid.
- **Social Media OAuth Integrations**: Facebook, Instagram, Twitter/X, TikTok, YouTube, LinkedIn, Google, Threads.

## Recent Hardening (May 2026)
- **OAuth log redaction**: `server/routes/socialOAuth.ts` now centralises secret scrubbing via `redactOAuthFields()` and `scrubSecretsFromText()`. The Token Exchange Failed log redacts `access_token` / `refresh_token` / `id_token` from `tokenData`. The Threads long-lived token exchange — whose request URL contains `client_secret` and `access_token` query params — no longer logs the raw error object; messages are scrubbed before being passed to pino. The outer `catch (err)` only logs sanitized message + name.
- **Logout fix**: `WebLayout.tsx` and `DesktopLayout.tsx` previously called a non-existent `logoutMutation` from `useAuth`. Both now call `await logout()` then redirect to `/login`, gated by a `signingOut` flag, matching `TopBar`. Verified by the existing `tests/auth-flows.test.ts` steps 9-10.
- **Go CVEs**: `dns-os/services/dns-authoritative/go.mod` bumped `github.com/jackc/pgx/v5` 5.6.0 → 5.9.0 and `golang.org/x/crypto` 0.24.0 → 0.35.0. `go.sum` regenerates on the next `go mod tidy` (Go isn't installed in the dev container).
- **Type cleanup**: `safeLoadRoute` in `server/routes.ts` now uses explicit `LoadedModule` / `RouterLike` / `SetupFn` types with `error: unknown` narrowing; pino calls in `server/middleware/csrf.ts` flipped to `(object, message)`; `client/src/lib/queryClient.ts` narrows `query.meta`; `WebLayout` no longer references the non-existent `user.displayName`; `DesktopLayout` electron-bridge access uses a typed `electronWindow` cast.
- **Version Control**: GitHub.
- **MaxCore-only routing**: `contentQualityPipeline.ts`, `contentVariantGenerator.ts`, `advertising.ts` (image gen) all now use MaxCore exclusively. Dead `pythonAIService` imports removed from `socialStrategyAIService.ts` and `unifiedAIController.ts`. Python AI sidecar retained only for audio analysis, MIDI transcription, and cinematic video templates.
- **MaxCore false-failure fix**: `MaxCoreAIClient.get/generate/infer()` previously suppressed endpoints for 2 min on ANY non-ok response (including 503 under training load), causing the ScoreCalibrator to see 0/5 successes and log "MaxCore unreachable" even when MaxCore was up. Fixed: only suppress on 404/405 (endpoint absent). 5xx/3xx return null without suppressing.
- **PDIM prober fix**: Direct HTTP circuit-recovery prober now accepts any `res.ok` (HTTP 200) as proof PDIM is alive. Previously required `application/json` content-type, causing it to skip `cbForceClose()` when PDIM returned `text/plain` PING responses.
- **PDIM worker-count-aware gap floor** (May 27, 2026): Production PDIM 429 floods diagnosed — each of 13 cluster workers had its own AIMD state with floor=1ms; combined rate = 13,000 req/s, far above PDIM's per-instance limit. Fix: `_PDIM_GAP_FLOOR_MS = clusterWorkers × 4ms` (dev=4ms, prod=52ms/worker → ~250 combined req/s). `setPdimGapFloor()` hardened to never lower floor below this minimum. Boot log now shows floor value. File: `server/lib/pdimClient.ts`.
- **Beat Money Loop** (May 27, 2026): Admin-only autonomous revenue loop — scan music industry context → TS-native beat synthesis → marketplace listing at competitive price → organic ad campaign (MaxCore/PDIM, budget=0) → analyse → repeat. Adaptive cadence [1h–24h] from industry confidence score. Starts paused; admin flips it on. Files: `shared/schema.ts` (2 new tables), `server/services/beatMoneyLoopService.ts` (new), `server/routes/admin/beatMoneyLoop.ts` (new, 5 endpoints), `server/routes.ts` (+1 safeLoadRoute), `server/services/autonomousJobScheduler.ts` (30 min heartbeat job), `client/src/pages/AdminDashboard.tsx` (Beat Loop tab). Tables created directly on Neon via psql. Route loaded clean at boot (`adminBeatMoneyLoop` ✅).
- **PDIM thundering-herd + LuaExecutor timeout fix** (May 27, 2026): Root cause — `_enqueueScriptExec` shared `_pdimGlobalChain` with direct calls. At boot, 780+ direct callers queued at the PermanentFixer-restored 2000ms gap = ~28-minute drain; LuaExecutor Workers timed out at 60s waiting for their redis.call() to be dispatched. Two fixes: (1) `server/lib/pdimClient.ts` — `_enqueueScriptExec` now uses a dedicated `_pdimScriptChain` so Workers are never blocked behind the direct-call queue (429 protection preserved via `_rateLimitedUntil` inside each `fn()` call); (2) `server/services/permanentFixRegistry.ts` — PermanentFixer caps the restored AIMD gap at 400ms (down from 2000ms) so the startup queue drains in ~4 minutes instead of 28. Verified: zero "redis.call timed out after 60s" errors, ScoreCalibrator 5/5 topics, MaxCoreSync ✅. Also addressed resource-starvation cause of app startup failures: `tsc --noEmit` (typecheck workflow) can consume 4GB RAM and starve tsx; kill it before restarting the app if the app hangs at boot.