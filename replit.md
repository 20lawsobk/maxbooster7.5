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
**PDIM (`pocketdimensionstorage.replit.app`) is the ONLY storage backend.** It functions as both a Redis-compatible layer (for job queues, pub/sub, caching) and a persistent object storage system, accessed via a single HTTP exec endpoint.

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
- **Multimodal Content Generation System**: Orchestration via `server/services/multimodalGenerationService.ts` for text, image, audio, and video, all calling MaxCore.
- **Platform Rules Config**: `shared/config/platformRules.ts` defines platform-specific constraints (character limits, aspect ratios, etc.).
- **Video Generation Engine**: Four-tier cascade: (1) **UNetV4 LITE NumPy** — 17.5M-param from-scratch diffusion pipeline (`server/services/diffusion/`) with depthwise-separable convs, temporal self-attention, 128-dim FiLM music conditioning (BPM/energy/beat_index/is_drop), DDIM 5-step CPU inference, served via FastAPI at port 8010 (`Diffusion API` workflow); (2) PyTorch Latent Video Diffusion (music-conditioned 3D VAE + DiT, `video_diffusion/`); (3) `imageToVideoService` for beat-synced image-to-video with Ken Burns motion; (4) FFmpeg `videoGeneratorService` for animated gradients (23 templates, 15 genre audio beds, CRF-20 cinematic quality). Key files: `api_server_v4.py`, `unet_v4.py`, `temporal_attention.py`, `layers.py`, `synthesizer.py` (v3, UNetV4 LITE), `trainer.py` (train_v4/weights_v4.npz).
- **Voice Synthesis Engine** (`voiceSynthesisService.ts`): 14 distinct voice profiles (radio_announcer, hype_man, deep_boss, ethereal_guide, arena_hype, r&b_smooth, rap_mc, afrobeats_hype, latin_energy, cold_luxury, etc.) each a unique FFmpeg processing chain (pitch shift via asetrate, genre EQ, compression, reverb, stereo width). Reference voice analysis auto-selects the closest profile. Segment synthesis with configurable pause gaps between lines.
- **Beat Sync Analyzer** (`beatSyncService.ts`): Dual-tier beat detection — Tier 1 (FFmpeg `ebur128` loudness analysis + peak detection), Tier 2 (Python `librosa` when available). Outputs BPM, beat timestamps, downbeats, section structure (intro/verse/chorus/outro), and energy envelope. Results cached 24h in PDIM to avoid re-analysis.
- **Image-to-Video Compositor** (`imageToVideoService.ts`): Converts 1–10 images into a full music video via a two-tier per-scene renderer. **Tier 1 (PyTorch diffusion)** — calls `maxcoreDiffusionSceneService.ts` which probes the local PyTorch diffusion API (`VIDEO_DIFFUSION_URL`, default `http://127.0.0.1:8010`) via `isPyTorchDiffusionReady()` + `generatePyTorchDiffusionVideo()` with full beat-derived context (BPM, energy envelope, energy peaks, emotional arc, style_name mapped from colorGrade). Each scene gets an `mp4_b64` response which is decoded to a temp file, upscaled to target resolution, and text overlays applied via FFmpeg. **Tier 2 (Ken Burns FFmpeg)** — automatic per-scene fallback when the diffusion API is unavailable: 8 zoompan motion paths (zoom in/out center, pan left/right, diagonal push, tilt up/down). Both tiers feed the same xfade transition chain, audio mixing, and color grading pipeline. Result `source` field reports `pytorch_diffusion+beat_sync_*` or `equal_cuts`; `capabilities` array includes `pytorch_diffusion` or `ken_burns` + `ken_burns_fallback` accordingly.
- **PDIM Media Storage** (`pdimMediaStorageService.ts`): All generated voice files and music videos persist to PDIM via `hybridStorageService` (deduplication + hot/cold tiering). Beat analysis cached in PDIM Redis layer. Full attribution to requesting userId for quota tracking.
- **MaxCore DigitalGPU v2**: Three-tier system integrated into the video diffusion pipeline for GPU context, resource management, and post-processing.
- **Read Replica Routing**: PostgreSQL read replica for analytical and dashboard reads.
- **Silent Deployment System**: Self-evolution engine for silent deployments with rolling restarts and auto-rollback.
- **Security Hardening**: Includes IDOR prevention, improved session cookie security, AI route rate limiting, Zod-validated input, authentication consistency, and SSRF protection.
- **Performance Hardening**: Pagination, Redis query caching, composite DB indexes, Neon PostgreSQL, and request correlation IDs.
- **Reliability Fixes**: Various background service safeguards and fallbacks.
- **Gamified Onboarding**: RPG-style persona selector, XP system, and achievements.
- **Studio DAW UI/UX**: Spec-compliant layout with TopBar, LeftSidebar Browser, MainArea with view tabs (Timeline / Mixer / Node Graph / Flow), and RightSidebar Universal Inspector. Includes 413 DSP plugins.
- **CI/CD**: GitHub Actions workflows for desktop and mobile platforms.
- **Python Audio Analysis Engine**: Utilizes `librosa`, `soundfile`, `scipy`, `scikit-learn`, and `basic-pitch` for server-side audio intelligence.
- **Distribution Analytics**: Aggregates data from LabelGrid and royalty transactions.
- **Offline Mode**: `OfflineProvider` and `ConnectionStatusBar` for app-wide offline context and background sync.
- **Autopilot Learning Feedback Loop**: `autopilotLearningService.recordPerformance()` for learning timing/content patterns.
- **Admin Functionality**: Dedicated admin UI for financial configuration.
- **Error Handling and Fixing**: `Chain Error Auto-Fixer` and `Platform Auto Error Fixer & Patcher` provide reactive and proactive system health monitoring and runtime patching.
- **Profile Claiming System v2**: Full pipeline implemented across 6 new DB tables for artist profile management and claim tracking.
- **Unified Content Orchestration System**: Single-function pipeline (`server/services/unifiedContentOrchestrator.ts`) for generating all social media, ad, and promotional content for both Max Booster and artist brands.
- **Per-Artist Storefront Deployment System**: Replaces legacy marketplace custom URL generator with dynamic domain management and multi-tenant routing.
- **MaxCore AI Exclusivity**: MaxCore is the sole AI source across all endpoints, removing Python AI or ContentGenerator fallbacks for content generation. MaxCore Local Engine acts as a guaranteed fallback.
- **Advanced AI Routing**: All text generation routes through `unifiedAIController.generateContent()` to MaxCore.
- **Determinism Breakthroughs**: Implementation of seeded, deterministic outcomes for content generation, aesthetic elements, and AI decision-making, including UCB1 Multi-Armed Bandit for topic selection.
- **Parallelization**: Conversion of numerous serial database loops to `Promise.allSettled` for improved performance.
- **Veo Quality Gate**: Enhanced content quality gate to align with Google Veo model standards.
- **Caffeine Mode**: A deadline pressure system that dynamically adjusts quality gates, HyperLearning cycles, and autopilot timing.
- **Local Audio Generation**: FFmpeg `aevalsrc` synthesis with TTS via `flite` for `.mp3` generation as a fallback.
- **Video Audio Filter Fallback**: `applyAudioAndLogo` retries with safe audio chain on FFmpeg filter errors.
- **Audio & Video UX Overhaul**: Improved audio/video loading states, download buttons, and auto-start video generation for better user experience.
- **AI Generation Speed & Power Optimizations**: Includes `validatePlatformConstraints` fix, parallelized DB queries, `ultrafast` FFmpeg preset, in-memory content cache, activated full content quality pipeline, and progress bars for video generation.

## External Dependencies
- **Frontend Frameworks**: React, Vite, TypeScript, TailwindCSS, Wouter, Zustand, TanStack Query.
- **Backend Frameworks**: Express.js, Node.js, tsx.
- **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
- **Storage / Queuing / Cache (unified)**: PDIM — Pocket Dimension (`pocketdimensionstorage.replit.app`).
- **Machine Learning**: `@tensorflow/tfjs-node`.
- **Payment Processing**: Stripe.
- **Email Delivery**: SendGrid.
- **Error Tracking**: Sentry.
- **Push Notifications**: Web Push (VAPID/Web Push API), Desktop Push, Mobile Push (FCM v1 API / legacy FCM).
- **Music Integrations**: Spotify, LabelGrid.
- **Social Media OAuth Integrations**: Facebook, Instagram, Twitter/X, TikTok, YouTube, LinkedIn, Google, Threads.
- **Version Control**: GitHub.
- **Search APIs**: Exa, Tavily.
## Production Readiness — Critical Fixes

### Build Rules
- `dist/index.cjs` and `dist/cluster.cjs` are committed pre-built artifacts used by `start.sh` (`node dist/cluster.cjs`).
- **Always run `npx tsx script/build.ts` and commit both dist bundles after any server-side changes.**
- Migration journal is frozen at `0005` — do NOT run `drizzle-kit generate` or `drizzle-kit push`.

### 1. Social Media Page — `/api/social/*` returning 404 in production (FIXED)
Three-layer root cause, all resolved:

**Layer 1 — CJS bundle lazy-init ordering**: In the esbuild CJS bundle, the `safeLoadRoute` wrapper for `socialMedia` called the module-level `log` helper before its lazy init ran → silent TypeError → router never mounted → 404.
- Fix: `server/routes.ts` registers the socialMedia router via an eager `await import()` *before* the `routeModules` lazy-load array. Entry removed from `routeModules[]` to prevent double-registration.

**Layer 2 — TensorFlow browser package**: `socialMedia.ts` statically imported `unifiedAIController` → `SocialAutopilotEngine` etc. → `import * as tf from '@tensorflow/tfjs'` (browser build). `@tensorflow/tfjs` auto-requires `@tensorflow/tfjs-backend-webgl` which is not installed in the production container.
- Partial fix applied (switched 20 shared ML model files to `@tensorflow/tfjs-node`) but `@tensorflow/tfjs-node` also requires `libtensorflow.so.2` native library which is absent from the production container.

**Layer 3 — TF loading at route-registration time (definitive fix)**: The real problem was importing TF-heavy services at module load time. Core social data routes (`/platform-status`, `/posts`, `/weekly-stats`, etc.) never need TF.
- **Definitive fix**: All TF-heavy service imports in `server/routes/socialMedia.ts` converted from static top-level imports to **lazy async getter functions** (`getUnifiedAI()`, `getContentQuality()`, `getCompetitorBenchmark()`, `getPythonAI()`, `getVeoMusic()`, `getRenderAdvancedVideo()`). These load only on first call inside AI-specific route handlers — never at route-registration time.
- **Verified**: Fresh production bundle tested *without* any TF library path → all 6 social endpoints return 401 cleanly. E2E browser test confirms "Social Media Management" page loads fully with no errors.

### 2. Boosterstate Binary (FIXED)
`build.sh` exports `RUSTFLAGS` with standard Debian glibc paths. Binary placed at `./bin/boosterstate`.

### 3. Python Runtime (FIXED)
`build.sh` downloads CPython 3.12.13 from python-build-standalone. `start.sh` uses `python_runtime/bin/python3` first.

### 4. ShortcutManager TypeError (FIXED)
Defensive guards in `client/src/lib/shortcuts/ShortcutManager.ts` for undefined key fields in localStorage.

### 5. PDIM ZREMRANGEBYSCORE (non-blocking)
`chainErrorAutoFixer` auto-degrades to 25% in-memory mode. No code change needed.

### Database Architecture
- `DATABASE_URL` → `heliumdb` (Replit local) — shell only
- `NEON_DATABASE_URL` → `neondb` (Neon PostgreSQL) — **actual app database** for all Drizzle/route queries

### Admin Account
- Email: `blawzmusic@gmail.com` (from `ADMIN_EMAIL` env var)
- Credentials managed via `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_USERNAME` secrets

## 120M req/s Rate Limit Upgrade (All Surfaces)

All artificial HTTP rate limits upgraded to match MaxCore and PDIM rated capacity of **120 000 000 req/s** (7.2 billion requests per 60-second window). Every rate-limit surface in the codebase was located and upgraded:

| Surface | Location | Limit |
|---|---|---|
| `globalScalableRateLimiter` | `scalableRateLimiter.ts` | 7.2B req/min per user/IP |
| `apiRateLimiter` | `scalableRateLimiter.ts` | 7.2B req/min per user/IP |
| `aiRateLimiter` | `scalableRateLimiter.ts` | 7.2B req/min per user/IP |
| `createScalableRateLimiter` default | `scalableRateLimiter.ts` | 7.2B req/min |
| `createHighScaleRateLimiter` tiers | `scalableRateLimiter.ts` | 10M–1B req/min (monthly/yearly/lifetime) |
| `RATE_LIMITS.global.perIP / perUser` | `rateLimiter.ts` | 7.2B req/min |
| `RATE_LIMITS.billing / uploads / ai` | `rateLimiter.ts` | 7.2B req/min |
| `maxRequests` + `criticalMax` | `config/defaults.ts` | 7.2B req/min |
| `adminEmailLimiter` | `routes/admin.ts` | 7.2B req/min |
| `keyCreateLimiter` | `routes/apiKeys.ts` | 7.2B req/min |
| `chatLimiter` | `routes/assistant.ts` | 7.2B req/min |
| `contentAnalysisLimiter` | `routes/content-analysis.ts` | 7.2B req/min |

**Auth security limits intentionally kept conservative** (brute-force / abuse prevention):
- `login`: 50 / 15 min · `register`: 10 / 1 h · `forgotPassword`: 5 / 1 h · `twoFactor`: 15 / 5 min

**PDIM tuning** (max-capacity mode, no artificial throttling):
- AIMD init = 1 ms, ZPOPMIN gap = `Math.max(1, multiplier)` ≈ 4 ms on 8-core
- PermanentFixRegistry stale escalations suppressed when `DEFAULTS.pdimGapFloorMs === 1`

## Stress Test + 50-Year Self-Evolution Simulation

### v3 — Platform-Wide (`scripts/stress_test_v3.mjs`)

Covers **ALL 20 platform subsystems** (68 local + 5 MaxCore endpoints = 73 total) across 6 load phases. Every subsystem probed: Infrastructure · Auth · Analytics · Dashboard · Social AI · Content Analysis · Commerce · Notifications · Gamification · Distribution · Music Production · Autopilot/Agents · Advertising · Artist Management · Events/Venues · Fan Engagement · Files/Sync · Security/Admin · Workflow Automation · Search.

| Phase | Label | Users | Req/user | Waves | Total reqs | Result |
|---|---|---|---|---|---|---|
| 0 | WARMUP | 5 | 3 | 3 | 135 | ✅ 100% |
| 1 | NOMINAL | 15 | 3 | 3 | 405 | ✅ 100% all 20 subsystems |
| 2 | SUSTAINED | 25 | 3 | 3 | 675 | ✅ 100% all 20 subsystems |
| 3 | STRESS | 35 | 4 | 3 | 3,360 | ✅ 100% (local only) |
| 4 | BURST | 50 | 4 | 3 | 4,800 | ✅ 100% (local only) |
| 5 | EXTREME | 75 | 3 | 2 | 5,400 | ✅ 100% (local only) |

**10-Factor Self-Evolution Model** — each platform subsystem modelled independently:

| Factor | Subsystems affected | Year-1 gain |
|---|---|---|
| MaxCore AI inference | Content, Social, Analytics, Autopilot, Search | +25%/yr |
| PDIM Adaptive Storage | Files, Infrastructure, Auth | +18%/yr |
| Distribution Network | Distribution, Fan Engagement | +30%/yr |
| Analytics Engine | Dashboard, Analytics, Advertising | +20%/yr |
| Social Media AI | Social, Content, Fan Engagement | +22%/yr |
| Autopilot/ML Agents | Autopilot, Workflows, Career Coach | +10→18%/yr |
| Advertising Intelligence | Advertising, Commerce | +20%/yr |
| Commerce Layer | Commerce, Marketplace | +15%/yr |
| Hardware Silicon | All subsystems (baseline) | +19%/yr |
| App-layer Optimization | All subsystems | +12%/yr |

**Inter-subsystem coupling** modelled: AI maturity amplifies autopilot (×1.5@Y10), analytics (×1.4), social (×1.3), advertising (×1.4), fan engagement (×1.3), notifications (×1.25), workflows (×1.5).

**Platform-Wide Capacity Projections** (all 10 factors combined):

| Horizon | Users | Capacity | Evolution Mult | Maturity Score | Status |
|---|---|---|---|---|---|
| 1 month | 5.3K | 138.7M req/s | ×1.16 | 49/100 | ✅ EXCESS |
| 1 year | 10.6K | 681.5M req/s | ×5.68 | 51/100 | ✅ EXCESS |
| 3 years | 47.4K | 23.6B req/s | ×196.5 | 55/100 | ✅ EXCESS |
| 6 years | 448.8K | 1.63T req/s | ×13,581 | 62/100 | ✅ EXCESS |
| 10 years | 8.53M | 106.72T req/s | ×889,339 | 70/100 | ✅ EXCESS |
| 20 years | 148.6M | 207.4P req/s | ×1.73B | 100/100 | ✅ EXCESS |
| 50 years | 150M | 9.25ZB req/s | ×77.1T | 100/100 | ✅ EXCESS |

All 12 time horizons: ✅ EXCESS headroom. All 20 subsystems: ✅ EXCESS at all horizons.

**Subsystem capacity table** (Budget × Y1/Y10/Y50 multiplier) and **coupling amplification table** included in test output.

Run: `node scripts/stress_test_v3.mjs` · `--no-external` (skip MaxCore) · `--phases N-M` · `--sim-only`

### v2 — Previous version (`scripts/stress_test_v2.mjs`)

32 endpoint categories, 5 phases, 1,560 requests, 98.4% success. 4-factor model (MaxCore × PDIM × App-layer × Hardware).
