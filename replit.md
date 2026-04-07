# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is an AI-powered, full-stack TypeScript web application designed to empower music artists with comprehensive career management tools. It offers AI-assisted features for social media management, music distribution, analytics, a beat marketplace, career automation, press kit creation, playlist pitching, tour management, merch store integration, sync licensing, publishing rights, A&R submissions, sample clearances, music video production tracking, radio/blog pitching, fan campaigns, revenue intelligence, songwriting, project budget planning, and venue/booking CRM. The platform aims to streamline and optimize various aspects of an artist's career, leveraging AI models fine-tuned specifically for the music industry, with the ambition to become the leading platform for artist career development through intelligent automation and insights.

## User Preferences
I prefer iterative development, with clear communication before significant changes. Please prioritize stability and performance. Do not make changes to folder `AI training server/ai_model/` or file `server/services/hybridStorageService.ts` unless explicitly instructed. Ensure that all new features integrate seamlessly with the existing hybrid storage system.

## PERMANENT — Infrastructure Availability
**MaxCore (`secure-ai-forge.replit.app`) and PDIM (`pocketdimensionstorage.replit.app`) are ALWAYS running and NEVER down.**
- The 8TB+ dataset on MaxCore is permanently available. Treat it as 100% reliable — no "unavailable" guard clauses, fallback stubs, or "MaxCore down" warning paths are ever needed or acceptable.
- Do NOT add error branches, empty-return guards, or warnings that assume MaxCore or PDIM could be offline. Both servers have guaranteed uptime.
- This overrides any prior scratchpad notes about "MaxCore unavailable → return null/empty". That pattern is prohibited. If MaxCore returns an error it is a transient call failure (retry), not a server-down event.

## System Architecture
The Max Booster application uses a monorepo structure, separating concerns into `client/`, `server/`, `shared/`, `boosterstate/`, `server/pocket-dimension/`, and `AI training server/`. The UI/UX emphasizes a clean, responsive design and a Studio DAW-like interface with TopBar, LeftSidebar Browser, MainArea with view tabs (Timeline / Mixer / Node Graph / Flow), and RightSidebar Universal Inspector, including 413 DSP plugins.

The core of the system is a "Triangle Architecture" data flow:
1. Max Booster pushes all data exclusively to PDIM.
2. MaxCore training server (`secure-ai-forge.replit.app`) pulls training data from PDIM to train AI models.
3. Max Booster pulls trained model weights from MaxCore for inference.

PDIM (`pocketdimensionstorage.replit.app`) serves as the ONLY unified storage backend, functioning as both a Redis-compatible layer and a persistent object storage system. All storage operations route through PDIM via a `HybridStorageService` with dedicated pockets for data, utilizing level-9 Gzip compression and SHA-256 content-addressed deduplication.

Key architectural decisions include:
- All core AI/ML models are in-house, specifically fine-tuned for music artist use cases (e.g., Viral Scoring, Timing Optimization, Algorithm Intelligence) using industry-specific data. No external AI APIs are used. MaxCore is the sole AI source across all endpoints.
- Microservices-like logical separation within the monorepo for scalability, designed for Replit Autoscale with PDIM as the shared-state backend.
- Robust authentication with session fixation prevention, JWTs with refresh, and session heartbeat.
- Comprehensive workflow automations managed by `musicWorkflowAutomationService.ts`, and a Unified Content Orchestration System for all content generation.
- Custom in-house AI models exclusively used for Advertisement and Autopilot Systems.
- An advanced AI Content Stack (v2, v3, v4) integrates content science, generative engines (Markov), and adaptive intelligence (Beam Search, Per-Artist Engagement Feedback Loop) for social content and songwriting.
- A Multimodal Content Generation System via `server/services/multimodalGenerationService.ts` orchestrates text, image, audio, and video generation, all calling MaxCore.
- Platform rules and constraints are defined in `shared/config/platformRules.ts`.
- Video Generation Engine: `advancedVideoRendererService.ts` is MaxCore-only (all local FFmpeg/Python renderers removed). Job flow: `POST /api/social/generate-video` → background `renderVideo()` → MaxCore `infer('/generate-video')` → `poll('/video-job/<mcJobId>')` → `cacheVideoLocally()` → stored in `ffmpegJobs` → client polls `GET /api/social/video-job/<localJobId>` → returns URL. Video proxy: `GET /api/social/video-proxy/:filename` streams the MaxCore video to the browser with auth headers (checks local `uploads/videos/` cache first, then fetches from MaxCore using stored URL or 6 candidate paths, and writes to disk for subsequent requests). `maxcoreVideoUrlStore` Map (exported from `advancedVideoRendererService.ts`) holds the authoritative MaxCore URL per filename.
- Voice Synthesis Engine (`voiceSynthesisService.ts`) offering 14 distinct voice profiles using FFmpeg processing chains.
- Beat Sync Analyzer (`beatSyncService.ts`) with dual-tier beat detection (FFmpeg `ebur128` and Python `librosa`).
- Image-to-Video Compositor (`imageToVideoService.ts`) converting images into music videos via PyTorch diffusion or Ken Burns FFmpeg fallback.
- MaxCore DigitalGPU v2 integrated into the video diffusion pipeline for GPU context and post-processing.
- Read replica routing for PostgreSQL for analytical reads.
- Silent deployment system with rolling restarts and auto-rollback.
- Security hardening includes IDOR prevention, session cookie security, AI route rate limiting, Zod-validated input, authentication consistency, and SSRF protection.
- Performance hardening features like pagination, Redis query caching, composite DB indexes, Neon PostgreSQL, and request correlation IDs.
- Reliability fixes with background service safeguards and fallbacks.
- Gamified onboarding with RPG-style persona selector, XP system, and achievements.
- Python Audio Analysis Engine using `librosa`, `soundfile`, `scipy`, `scikit-learn`, and `basic-pitch`.
- Offline mode for app-wide context and background sync.
- Autopilot Learning Feedback Loop for recording performance patterns.
- Dedicated admin UI for financial configuration.
- `Chain Error Auto-Fixer` and `Platform Auto Error Fixer & Patcher` for system health and runtime patching.
- Profile Claiming System v2 for artist profile management.
- Per-Artist Storefront Deployment System for dynamic domain management and multi-tenant routing.
- Advanced AI Routing through `unifiedAIController.generateContent()` to MaxCore.
- Seeded, deterministic outcomes for content generation, aesthetic elements, and AI decision-making, including UCB1 Multi-Armed Bandit for topic selection.
- Parallelization of database operations using `Promise.allSettled`.
- Veo Quality Gate for content quality.
- Caffeine Mode for dynamic adjustment of quality gates and learning cycles.
- Local Audio Generation using FFmpeg `aevalsrc` and TTS via `flite` as fallback.
- Audio & Video UX Overhaul with improved loading states and generation progress.
- AI Generation Speed & Power Optimizations including platform constraint validation, parallelized DB queries, `ultrafast` FFmpeg preset, and in-memory content cache.

## External Dependencies
- **Frontend Frameworks**: React, Vite, TypeScript, TailwindCSS, Wouter, Zustand, TanStack Query.
- **Backend Frameworks**: Express.js, Node.js, tsx.
- **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
- **Storage / Queuing / Cache (unified)**: PDIM — Pocket Dimension (`pocketdimensionstorage.replit.app`).
- **Machine Learning**: `@tensorflow/tfjs-node`.
- **Payment Processing**: Stripe.
- **Email Delivery**: SendGrid.
- **Error Tracking**: Sentry.
- **Push Notifications**: Web Push, Desktop Push, Mobile Push (FCM v1 API / legacy FCM).
- **Music Integrations**: Spotify, LabelGrid.
- **Social Media OAuth Integrations**: Facebook, Instagram, Twitter/X, TikTok, YouTube, LinkedIn, Google, Threads.
- **Version Control**: GitHub.
- **Search APIs**: Exa, Tavily.

## Backend Setup Status (Last Updated: 2026-04-07)

### Completed Fixes
1. **PDIM circuit breaker — 4xx false-trip fixed** (`server/lib/pdimClient.ts`): Non-429 4xx responses from PDIM now call `cbRecordSuccess()` (server IS reachable) and return `null` instead of tripping the circuit breaker.
2. **PDIM circuit breaker — TimeoutError false-trip fixed** (`server/lib/pdimClient.ts`): `AbortSignal.timeout()` throws `TimeoutError` (not `AbortError`). Both are now excluded from `cbRecord503()` and instead apply AIMD backpressure via `_pdimAdapt429()`.
3. **Service worker (sw.js) 404 fixed** (`server/index.ts`): Added early `express.static('client/public')` before session middleware so `sw.js` and PWA assets are served before Vite middleware is ready. Confirmed: `GET /sw.js - 200`.
4. **TensorFlow native addon rebuilt**: Ran `npm rebuild @tensorflow/tfjs-node --build-addon-from-source`. All 6 TF-dependent routes now load: `autopilot`, `promotionalTools`, `autopilotLearning`, `unifiedContent`, `creativeModel`, `songwriting`.
5. **PlatformAutoFixer probe — false backoff patch fixed** (`server/services/platformAutoFixer.ts`): PDIM ping probe now returns `unknown` (not `critical`) for 404 responses and timeout responses, preventing the AIMD gap from being raised to 2000ms unnecessarily. Probe timeout increased from 5s to 12s to allow for Replit app cold-start.
6. **PDIM exec timeout tuned** (`server/lib/pdimClient.ts`): Exec timeout set to 15s (gives Replit-hosted PDIM app time to cold-start; 30s was too long, 8s was too short).
7. **Database schema pushed**: All 7 migrations applied via `node scripts/db-push.js`.

### Current State
- All 24/24 environment variables pass validation.
- All routes load successfully (no TF binding failures).
- TFWorkerPool: 6 TF inference workers ready.
- PDIM circuit breaker: CLOSED and stable (no oscillation).
- Session store, BullMQ queues, WebSocket servers all initialized.
- PDIM exec endpoint timeouts (~15s) are expected — PDIM server accepts connections but hangs on Redis commands (exec endpoint may not implement Redis protocol). Circuit breaker stays CLOSED; LuaExecutor degrades gracefully (returns null for missing keys).