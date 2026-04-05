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
- **Video Generation Engine**: Four-tier cascade: PyTorch Latent Video Diffusion (music-conditioned 3D VAE + DiT backbone), `imageToVideoService` for beat-synced image-to-video with Ken Burns motion, FFmpeg `videoGeneratorService` for animated gradients (23 templates, 15 genre audio beds, CRF-20 cinematic quality), and a placeholder fallback.
- **Voice Synthesis Engine** (`voiceSynthesisService.ts`): 14 distinct voice profiles (radio_announcer, hype_man, deep_boss, ethereal_guide, arena_hype, r&b_smooth, rap_mc, afrobeats_hype, latin_energy, cold_luxury, etc.) each a unique FFmpeg processing chain (pitch shift via asetrate, genre EQ, compression, reverb, stereo width). Reference voice analysis auto-selects the closest profile. Segment synthesis with configurable pause gaps between lines.
- **Beat Sync Analyzer** (`beatSyncService.ts`): Dual-tier beat detection — Tier 1 (FFmpeg `ebur128` loudness analysis + peak detection), Tier 2 (Python `librosa` when available). Outputs BPM, beat timestamps, downbeats, section structure (intro/verse/chorus/outro), and energy envelope. Results cached 24h in PDIM to avoid re-analysis.
- **Image-to-Video Compositor** (`imageToVideoService.ts`): Converts 1–10 images into a full music video with Ken Burns motion paths (8 types: zoom in/out, pan left/right, tilt up/down, diagonal push), beat-synced scene cuts, xfade transitions, text overlays (hook/body/CTA with drop shadow + outline + slide-up animation), color grading (warm/cool/cinematic/neon), and cinematic vignette. Accepts user audio track with automatic beat-sync alignment.
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
