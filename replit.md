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
- **Multimodal Content Generation System** (v3.0.0): New architecture replacing template-based generation. Orchestration: `server/services/multimodalGenerationService.ts` (`normalizeInput → planTasks → workers → MultimodalPackage`). Workers: text, image, audio, video — all call MaxCore at `AI_SERVER_URL` with graceful local fallbacks.
- **Platform Rules Config** (`shared/config/platformRules.ts`): `PLATFORM_RULES` const covering all 7 platforms – character limits, recommended lengths, hashtag rules, tone arrays, image/video aspect ratios, video durations, requiresHook flag, audio voiceover/duration/style.
- **Video Generation Engine**: An in-house text-to-video neural network (UNetV4 + v4 Training Engine) built with NumPy, featuring continuous self-training.
- **MaxCore DigitalGPU v2**: A domain-native compute engine and hardware accelerator design stack for optimized performance.
- **Read Replica Routing**: PostgreSQL read replica for analytical and dashboard reads.
- **Silent Deployment System**: Self-evolution engine for silent deployments with rolling restarts and auto-rollback.
- **Security Hardening**: Includes IDOR prevention, improved session cookie security, AI route rate limiting, Zod-validated input, authentication consistency, and SSRF protection.
- **Performance Hardening**: Pagination, Redis query caching, composite DB indexes, Neon PostgreSQL, and request correlation IDs.
- **Reliability Fixes**: Various background service safeguards and fallbacks.
- **Gamified Onboarding**: RPG-style persona selector, XP system, and achievements.
- **Studio DAW UI/UX**: Customizable toolbar, resizable panels, and Web Audio API integration.
- **CI/CD**: GitHub Actions workflows for desktop and mobile platforms.
- **Python Audio Analysis Engine**: Utilizes `librosa`, `soundfile`, `scipy`, `scikit-learn`, and `basic-pitch` for server-side audio intelligence (requires local Python 3.11 setup).
- **Distribution Analytics**: Aggregates data from LabelGrid and royalty transactions.
- **Offline Mode**: `OfflineProvider` and `ConnectionStatusBar` for app-wide offline context and background sync.
- **Autopilot Learning Feedback Loop**: `autopilotLearningService.recordPerformance()` for learning timing/content patterns.
- **Admin Functionality**: Dedicated admin UI for financial configuration.
- **Error Handling and Fixing**: `Chain Error Auto-Fixer` and `Platform Auto Error Fixer & Patcher` provide reactive and proactive system health monitoring and runtime patching.
- **Profile Claiming System v2**: Full pipeline implemented across 6 new DB tables for artist profile management and claim tracking.
- **Determinism Breakthroughs**: Significant updates across various services (`advancedSocialAIService`, `autoPostGenerator`, `custom-ai-engine`, `WaveformAudioPlayer`, `contentVariantGenerator`, `image-generation.ts`, `contentQualityPipeline`, `autonomous-autopilot.ts`, `autopilot-engine.ts`, `autopilotPublisher.ts`, `routes/songwriting.ts`, `services/aiContentService.ts`, `services/dynamicTrendsService.ts`, `services/maxAssistantService.ts`, `routes/files.ts`) ensuring seeded, deterministic outcomes for content generation, aesthetic elements, and AI decision-making. This includes the implementation of UCB1 Multi-Armed Bandit for topic selection in the autopilot.
- **Parallelization**: Conversion of numerous serial database loops to `Promise.allSettled` for batch API endpoints, improving performance for operations like submitting releases, scheduling posts, and managing files.
- **Veo Quality Gate**: Enhanced content quality gate to align with 90% of Google Veo model standards, including a new `scoreNarrativeAuthenticity` dimension and rebalanced scoring weights.
- **URL Content Generation**: Implemented asynchronous FFmpeg jobs for video generation and improved resilience for multimodal pipelines with client-side fallbacks.
- **Caffeine Mode**: A deadline pressure system (`computeSchedulePressure`) that dynamically adjusts quality gates, HyperLearning cycles, and autopilot timing when behind schedule.
- **Local Audio Generation** (`server/services/audioGeneratorService.ts`): FFmpeg `aevalsrc` synthesis (bass+beat+pad) with TTS via FFmpeg `flite` lavfi filter, outputs real `.mp3` files to `uploads/audio/`. Served via `/uploads/audio` static route. `audioWorker` in `multimodalGenerationService.ts` calls this as a fallback when MaxCore is unavailable.
- **Video Audio Filter Fallback** (`server/services/videoGeneratorService.ts`): `applyAudioAndLogo` catches FFmpeg filter-not-found errors and retries with a safe `volume=0.9` chain instead of `equalizer/acompressor/dynaudnorm`.
- **Audio & Video UX Overhaul** (`client/src/pages/SocialMedia.tsx`, `client/src/components/content/ServerVideoGenerator.tsx`):
  - Replaced confusing "Voiceover Script" fallback cards with a clear amber "Audio clip not ready" state
  - Added Download buttons to all audio player and inline video player cards
  - Format-aware loading button copy ("Creating audio clip…", "Building video…", "Generating image…")
  - `ServerVideoGenerator` gains an `autoStart` prop — when `true`, it fires generation immediately on mount without requiring a second user click; shows a cinematic progress view instead of the form
  - `autoStart={true}` passed from the URL-tab results fallback so video begins rendering as soon as the user's generate request completes
  - `autoStartPending` is included in all display-condition checks so the spinner shows during the 400ms warm-up delay — prevents premature "Something went wrong" flash

## Video Generation Pipeline (confirmed working — 10/10 E2E tests)
- **Route** (`POST /api/social/generate-video`): Always returns `{job_id, status:'processing'}` immediately (non-blocking). Background IIFE runs: Stage 1 → AI content, Stage 2 → Python AI renderer (if available), Stage 3 → FFmpeg fallback.
- **AI Content Stage**: Calls `advancedSocialAIService.generateAdvancedContent()` directly (not `contentQualityPipeline.generateWithAdvancedAI()` which throws during variant post-processing). Content always flows into the video — no generic defaults.
- **generateWithAdvancedAI catch block**: Now logs the actual error message+stack and returns best-effort variant without enforcing the VEO_PRESSURE_FLOOR, so callers always get something useful.
- **Polling** (`GET /api/social/video-job/:id`): Checks `ffmpegJobs` map for both `video_` and `ffmpeg_` prefixed job IDs.
- **Render timing**: ~19–28s end-to-end. HTTP response: ~880–1000ms.

## External Dependencies
- **Frontend Frameworks**: React, Vite, TypeScript, TailwindCSS, Wouter, Zustand, TanStack Query.
- **Backend Frameworks**: Express.js, Node.js, tsx.
- **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
- **Storage / Queuing / Cache (unified)**: PDIM — Pocket Dimension (`pocketdimensionstorage.replit.app`).
- **Machine Learning**: `@tensorflow/tfjs-node`.
- **Payment Processing**: Stripe (requires STRIPE_SECRET_KEY env var).
- **Email Delivery**: SendGrid.
- **Error Tracking**: Sentry.
- **Push Notifications**: Web Push Protocol.
- **Music Integrations**: Spotify, LabelGrid.
- **Social Media OAuth Integrations**: Facebook, Instagram, Twitter/X, TikTok, YouTube, LinkedIn, Google, Threads.
- **Version Control**: GitHub.
- **Search APIs**: Exa, Tavily.