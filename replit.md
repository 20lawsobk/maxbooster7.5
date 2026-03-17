# Max Booster - AI-Powered Music Career Management Platform

## Overview

Max Booster is an AI-powered, full-stack TypeScript web application designed to empower music artists with comprehensive career management tools. It offers AI-assisted features for social media management, music distribution, analytics, a beat marketplace, career automation, press kit creation, playlist pitching, tour management, merch store integration, sync licensing, publishing rights, A&R submissions, sample clearances, music video production tracking, radio/blog pitching, fan campaigns, revenue intelligence, songwriting, project budget planning, and venue/booking CRM. The platform aims to streamline and optimize various aspects of an artist's career, leveraging AI models fine-tuned specifically for the music industry, with the ambition to become the leading platform for artist career development through intelligent automation and insights.

## User Preferences

I prefer iterative development, with clear communication before significant changes. Please prioritize stability and performance. Do not make changes to folder `AI training server/ai_model/` or file `server/services/hybridStorageService.ts` unless explicitly instructed. Ensure that all new features integrate seamlessly with the existing hybrid storage system.

## System Architecture

The Max Booster application uses a monorepo structure, separating concerns into `client/`, `server/`, `shared/`, `boosterstate/`, `server/pocket-dimension/`, and `AI training server/`. The UI/UX emphasizes a clean, responsive design.

### Triangle Architecture

Max Booster operates on a three-point data flow:
1. **Max Booster → PDIM**: Application pushes all data (AI model weights, session state, queue jobs, object blobs, cache, pub/sub) exclusively to PDIM.
2. **MaxCore training server (`secure-ai-forge.replit.app`) ← PDIM**: MaxCore pulls training data from PDIM to train AI models.
3. **Max Booster AI models ← MaxCore**: Max Booster pulls trained model weights from MaxCore for inference.

### PDIM — Unified Storage Container

**PDIM (`pocketdimensionstorage.replit.app`) is the ONLY storage backend.** It is a single unified system that simultaneously acts as:
- **Redis-compatible layer**: BullMQ job queues, Lua script execution via wasmoon LuaExecutor, pub/sub, key expiry, sorted sets — all Redis-protocol operations go through PDIM.
- **Pocket Dimension object storage**: Persistent key-value blobs, AI model weight files, application data, cold storage, per-user pockets — all with level-9 Gzip compression and SHA-256 content-addressed deduplication.

There is **no separate Redis server** and **no separate object storage**. PDIM is both, accessed via a single HTTP exec endpoint: `https://pocketdimensionstorage.replit.app/api/redis/instances/e50d64e610d37dd52ce85711/exec` using `{ cmd, args }` JSON payloads with bearer-token auth.

**Key Architectural Decisions:**

-   **Pocket Dimension Storage Bubbles**: All major storage paths route through dedicated Pocket Dimension pockets (level-9 Gzip, SHA-256 content-addressed deduplication, 4MB chunking). This includes `ai-model-weights`, `offline-mode-cache`, `application-storage`, `hybrid-cold-storage`, and per-user pockets.
-   **Hybrid Storage System**: Routes entirely through PDIM as the sole backend. `HybridStorageService` provides a tiered API but all writes and reads ultimately land in PDIM. Replit Object Storage and BoosterState are NOT used.
-   **AI Model Fine-Tuning**: All core AI/ML models are in-house, specifically fine-tuned for music artist use cases (e.g., Viral Scoring, Timing Optimization, Algorithm Intelligence) using industry-specific data and public datasets. No external AI APIs are used.
-   **Microservices-like Structure**: Services are logically separated within the monorepo.
-   **Scalability**: Designed for Replit Autoscale with PDIM as the shared-state backend (queues, sessions, cache — all routed through PDIM's Redis-compatible layer).
-   **Robust Authentication**: Implements session fixation prevention, JWTs with refresh, and session heartbeat.
-   **Comprehensive Workflow Automations**: 21 automation templates across five career phases, managed by `musicWorkflowAutomationService.ts`.
-   **Advertisement and Autopilot Systems**: Exclusively use custom in-house AI models and connected social profiles, avoiding traditional ad platform integrations.
-   **Songwriting AI Assist**: Generates lyric suggestions, rhyme words, and mood-aware chord progressions using `unifiedAIController`.
-   **Social Content Generation**: Generates structured social media content (hook, body, cta, hashtags) using `unifiedAIController`.
-   **Social Autopilot**: Manages and triggers the live `AutopilotEngine` for automated social media actions.
-   **Media-to-Content Analysis**: Analyzes URLs, audio files, and images to extract metadata and generate social media content using Python-based services.
-   **Video Generation Engine v3 — In-House Diffusion Model v4**: A text-to-video neural network built from scratch using pure NumPy, continuously self-improving. Features a 3.0M-parameter 4-level U-Net architecture with attention mechanisms and FiLM conditioning. Training data includes 602 prompts across 20 scene categories. Background self-training runs continuously.
-   **Veo-for-Music Full Training Pipeline**: Five-module training infrastructure for video generation, including `MaxBoosterSample` dataclass for unified data, `DatasetRegistry` for cataloging datasets, a progressive 30-day training curriculum, teacher-student knowledge distillation, and live milestone tracking.
-   **UNetV4 + v4 Training Engine**: Next-generation 463M-parameter text-to-video diffusion model architecture with a 5-level U-Net, depthwise-separable convolutions, and 32-head spatial + temporal attention. Includes a robust training loop with progressive phases and advanced loss functions.
-   **MaxCore DigitalGPU v2**: A domain-native compute engine and hardware accelerator design stack with LocalCPUBackend (NumPy+OpenBLAS), LocalGPUBackend (Numba JIT), GraphOptimizer with AutoTuner for performance, and MaxCoreTile + RTLGenerator for hardware simulation and SystemVerilog output.
-   **Read Replica Routing**: PostgreSQL read replica is used for analytical and dashboard reads.
-   **Silent Deployment System**: Self-evolution engine for silent deployments with rolling restarts and auto-rollback.
-   **Security Hardening**: Includes IDOR prevention, improved session cookie security, AI route rate limiting, Zod-validated input, authentication consistency, and SSRF protection.
-   **Content Generation Simulation**: `POST /api/social/ai/generate` now returns a `simulation` block with genre auto-detection, viral score, predicted engagement metrics, platform optimization data, and scheduling intelligence.
-   **AI Content Stack v2 (Max Quality Upgrade)**: Upgraded five in-house JS AI content generation services for maximum output quality, expanding hook options, CTAs, content quality strategies, viral scoring, and auto-post generation.
-   **AI Content Stack v4 (Generative + Adaptive Intelligence Upgrade)**: Activates Markov Generative Engine for novel sentence generation, Beam Search Candidate Selection for quality-biased content, and Per-Artist Engagement Feedback Loop for personalized pattern weighting.
-   **AI Content Stack v3 (Advanced Content Science Upgrade)**: Integrates research-based content science principles, including `CONTENT_FORMULA_LIBRARY`, `PSYCHOLOGICAL_TRIGGER_LAYERS`, `RELEASE_PHASE_MULTIPLIERS`, `PLATFORM_NATIVE_DNA`, `SELF_IDENTIFICATION_PHRASES`, and `EMOTIONAL_ARC_TEMPLATES` for more effective content.
-   **Performance Hardening**: Pagination, Redis query caching, composite DB indexes, Neon PostgreSQL, and request correlation IDs are implemented.
-   **Gamified Onboarding**: RPG-style "Choose Your Class" persona selector, animated XP bar, rank progression, and achievement pop-ups.
-   **Studio DAW UI/UX**: Customizable toolbar, resizable panels, platform-adaptive fullscreen mode, and Web Audio API integration.
-   **CI/CD**: GitHub Actions workflows automate builds for desktop (Linux, Windows, macOS) and mobile (Android, iOS) platforms.
-   **Python Audio Analysis Engine**: Utilizes `librosa`, `soundfile`, `scipy`, `scikit-learn`, and `basic-pitch` for server-side audio intelligence.
-   **Distribution Analytics**: Enhanced routes for `streams-revenue` and `analytics/growth` aggregate data from LabelGrid and `royaltyTransactions` table.
-   **Redis Stability**: Implemented `unhandledRejection` handlers to treat Redis timeouts and connection issues as non-fatal.
-   **Offline Mode**: `OfflineProvider` and `ConnectionStatusBar` enable app-wide offline context and background sync queue.
-   **Autopilot Learning Feedback Loop**: `autopilotLearningService.recordPerformance()` is called after successful auto-posts to learn timing/content patterns.
-   **Financial Config Admin UI**: Admin panel for editing DSP royalty rates, tax treaty withholding rates, and label settings.

## External Dependencies

-   **Frontend Frameworks**: React, Vite, TypeScript, TailwindCSS, Wouter, Zustand, TanStack Query.
-   **Backend Frameworks**: Express.js, Node.js, tsx.
-   **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
-   **Storage / Queuing / Cache (unified)**: PDIM — Pocket Dimension (`pocketdimensionstorage.replit.app`). Acts as Redis-compatible queue/cache layer (BullMQ, Lua, pub/sub) AND persistent object storage simultaneously. This is the ONLY storage backend — no separate Redis server, no Replit Object Storage.
-   **Machine Learning**: `@tensorflow/tfjs-node`.
-   **Payment Processing**: Stripe.
-   **Email Delivery**: SendGrid.
-   **Error Tracking**: Sentry.
-   **Push Notifications**: Web Push Protocol.
-   **Music Integrations**: Spotify, LabelGrid.
-   **Social Media OAuth Integrations**: Facebook, Instagram, Twitter/X, TikTok, YouTube, LinkedIn, Google, Threads.
-   **Version Control**: GitHub.
-   **Search APIs**: Exa, Tavily.

## Critical Database Notes

**IMPORTANT: Two database URLs exist in this environment:**
- `NEON_DATABASE_URL` → Real Neon cloud database (used by the server via `config.database.url = NEON_DATABASE_URL || DATABASE_URL`)
- `DATABASE_URL` → Local PostgreSQL on `helium` (used by dev tools and direct `node -e` scripts)

**ALL schema changes (ALTER TABLE, etc.) MUST target `NEON_DATABASE_URL`, not `DATABASE_URL`.** The server will always connect to the Neon cloud DB. Any column additions verified against `DATABASE_URL` will NOT be visible to the running server.

When running a schema migration from a shell script, always use `process.env.NEON_DATABASE_URL` explicitly:
```javascript
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });
```

## Production Setup (Replit)

-   **Dev Workflow command**: `bash -c './boosterstate/target/release/boosterstate & sleep 2 && NODE_ENV=development npx tsx server/index.ts'`
    -   Starts BoosterState Rust sidecar (fast KV on port 9877) first, then the dev server
    -   BoosterState release binary is pre-built at `./boosterstate/target/release/boosterstate`
-   **Production deployment**: Build: `cargo build --release --manifest-path boosterstate/Cargo.toml && npm run build:deploy`; Run: `./boosterstate/target/release/boosterstate & sleep 2 && npm run start`
    -   `build:deploy` = Vite + esbuild bundle
    -   `start` = production Node.js cluster from `dist/cluster.cjs`
-   **CJS bundle compatibility**: Files using `import.meta.url` must use the pattern:
    ```ts
    const __metaUrl = (import.meta as any)?.url as string | undefined;
    const __filename = __metaUrl ? fileURLToPath(__metaUrl) : path.resolve(process.argv[1] ?? '');
    ```
    Applied to: `server/cluster.ts`, `server/startup-probes.ts`, `server/services/diffusionBackgroundTrainer.ts`, `server/services/diffusionVideoService.ts`
-   **Storage (all tiers)**: PDIM is the sole backend — exec endpoint `https://pocketdimensionstorage.replit.app/api/redis/instances/e50d64e610d37dd52ce85711/exec`; bearer token in `PDIM_BEARER_TOKEN` env secret; HTTP URL in `PDIM_HTTP_EXEC_URL`. No external Redis server, no Replit Object Storage bucket.
-   **Deployment builds**: Workflow command: `npm run build:deploy && npm run start`. Deployment build command (`build:prod`): `npx tsx script/build.ts && npm prune --production --omit=dev`. `security-fix.ts` is only in `npm run build` (dev), never in `build:prod` or `build:deploy`. Always use "Clear build cache" in the Deployments pane when redeploying. `postinstall` now runs `script/postinstall.mjs` (consolidates TF binary removal + BullMQ `stalled.forEach` patch).
-   **BullMQ / PDIM compatibility fixes** (all resolved, no recurring errors):
    - `stalled.forEach is not a function` — patched in `script/postinstall.mjs` via `Array.isArray(stalled) ? stalled : []` guard in `node_modules/bullmq/dist/cjs/classes/worker.js`
    - Repeatable job Lua errors — `server/services/autonomousJobScheduler.ts` replaced `q.getRepeatableJobs()` + `q.add(…, {repeat:…})` Lua API with plain `setInterval` scheduling (no Lua dependency)
    - PDIM 429 rate-limit bursts — `bzpopmin` polling interval raised from 200ms → 500ms + 0–100ms random jitter in `server/lib/pdimClient.ts`
    - All BullMQ workers now have `stalledInterval: 30000, maxStalledCount: 2` (including `autonomousWorker.ts` and `scaleJobQueue.ts`)
-   **DatabaseLogTransport** (`server/services/databaseLogTransport.ts`): PG_CODE=53100 (too_many_connections) immediately permanently disables the transport on first hit — no retry storm. `MAX_CONSECUTIVE_FAILURES` lowered to 3, `PERMANENT_DISABLE_THRESHOLD` to 10, backoff base raised to 10s. `flushIntervalMs` raised to 30000ms in `server/index.ts` so the first flush fires well after the startup seeding burst clears — 53100 eliminated from startup logs.
-   **Cluster DB pool sizing** (`server/config/defaults.ts`): In production (`REPLIT_DEPLOYMENT=1`), pool size per worker = `ceil(15 / CLUSTER_WORKERS)` (e.g., 5 for 3 workers = 15 total) instead of a flat 20 per worker. This prevents the N×20 connection count from exceeding Neon's connection limit and causing 53100 errors. `DB_POOL_SIZE` env var always overrides.
-   **Fast-path health endpoint** (`server/index.ts`): `/api/health` is intercepted by an early middleware registered before the session store. This ensures Replit's health checker always gets a sub-10ms response regardless of PDIM rate-limit state (previously 2–7 seconds due to session HGET stalls on PDIM 429).
-   **Cluster primary handles all health paths** (`server/cluster.ts`): The primary health server (which binds port 5000 immediately with `reusePort: true`) responds 200 to `/health`, `/api/health`, AND `/api/ping`. Previously it only handled `/health` and `/api/ping` — returning 503 for `/api/health`. Since the OS distributes SO_REUSEPORT connections between the primary and all workers, some health checks always hit the primary. Returning 503 on the deployment health-check path caused fresh deployments to fail the 4-minute health-check timeout even after workers were running. The `HEALTH_PATHS` set in cluster.ts must contain every path Replit's health checker may use.
-   **Background workers on cluster worker 0 only** (`server/index.ts` + `server/cluster.ts`): Each forked worker receives `CLUSTER_WORKER_ID` env var (0, 1, 2, …). Only worker 0 (or the single process in non-clustered/dev mode) runs `initializeWorkers()` (BullMQ processors). Workers 1+ are HTTP-only. This reduces PDIM job-queue poll traffic by N× and eliminates the 429 cascade from multiple workers racing on the same queues. Worker env (including `CLUSTER_WORKER_ID`) is preserved on crash-respawn via `workerEnvMap` in cluster primary.
-   **Deploy pruner philosophy** (`script/build.ts`): The pruner does NOT pattern-delete directories by name (`doc`, `test`, `examples`, etc.) inside `node_modules`. Those directory names are sometimes used for real runtime JS modules (e.g., `exceljs/lib/doc/workbook.js`). `npm prune --omit=dev` is the real allowlist — it keeps exactly what production dependencies need. Only files provably never `require()`d at runtime are deleted: `*.map`, `*.d.ts`, `*.md`, changelogs. Specific large known-safe blobs (Rust build artifacts, TF browser bundles, Electron, Sentry browser SDKs) are removed by exact path.
-   **Startup Seeding Optimizations**: Distribution platforms seeding (`server/seed/distributionPlatforms.ts`) replaced 194 sequential SELECT/UPDATE queries with a single batch `INSERT...onConflictDoUpdate`. Achievements seeding (`server/seed/seedAchievements.ts`) replaced 16 sequential SELECT+INSERT loops with a single `COUNT` check (skip entirely if all seeded) plus one batch `INSERT` for missing records — startup seeding now completes in near-instant vs ~14s previously.
-   **Chain Error Auto-Fixer** (`server/services/chainErrorAutoFixer.ts`): Started early in `server/index.ts`; hooks into the structured logger transport to intercept error/warn messages in real time, runs a 15s health check loop, and applies 10 named fix patterns. Admin API: `GET /api/admin/chain-fixer/status`, `POST /api/admin/chain-fixer/reset/:patternId`, `POST /api/admin/chain-fixer/force-check`.
-   **Fabric routes**: Gracefully skipped if pocket-dimension fabric dependencies fail to initialize (non-fatal warning)
-   **Python AI**: Python 3.11 module is **not installed** (removed to stay under the 8 GiB deployment image limit). All `spawn('python3', ...)` calls use the `PYTHON` constant from `server/services/pythonPath.ts`, which tries `.venv/bin/python3` → `/usr/bin/python3` → `python3` and sets `PYTHON_AVAILABLE = false` if nothing is found. When `PYTHON_AVAILABLE` is false, `renderWithPython()` in `videoGeneratorService.ts` immediately rejects with a clear error message instead of an ENOENT crash. To re-enable Python video generation locally: install Python 3.11, run `python3 -m venv .venv && .venv/bin/pip install numpy Pillow`, and the path resolver will automatically find it.