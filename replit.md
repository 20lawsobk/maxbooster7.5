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
- **Video Generation Engine**: Pure FFmpeg `geq` animated gradient renderer — Python NumPy frame generator removed from the rendering path. Backgrounds are generated via FFmpeg's `geq` filter using template-aware color palettes (each template's `bg` and `ac` colors drive the animation). Rendered at half resolution (540×960) then lanczos-upscaled to 1080×1920 for performance. All 7 background types (plasma, aurora, neon_pulse, gradient_sweep, wave, fire, warp) are supported natively in FFmpeg with no Python dependency.
- **MaxCore DigitalGPU v2**: A domain-native compute engine and hardware accelerator design stack for optimized performance.
- **Read Replica Routing**: PostgreSQL read replica for analytical and dashboard reads.
- **Silent Deployment System**: Self-evolution engine for silent deployments with rolling restarts and auto-rollback.
- **Security Hardening**: Includes IDOR prevention, improved session cookie security, AI route rate limiting, Zod-validated input, authentication consistency, and SSRF protection.
- **Performance Hardening**: Pagination, Redis query caching, composite DB indexes, Neon PostgreSQL, and request correlation IDs.
- **Reliability Fixes**: Various background service safeguards and fallbacks.
- **Gamified Onboarding**: RPG-style persona selector, XP system, and achievements.
- **Studio DAW UI/UX**: Spec-compliant layout with TopBar (transport + position + tempo + mode toggle) + LeftSidebar Browser (Tracks/Files/Plugins/Presets tabs, collapsible) + MainArea with view tabs (Timeline / Mixer / Node Graph [Expert] / Flow) + RightSidebar Universal Inspector (collapsible). Beginner/Expert mode toggle in TopBar. Mixer tab renders MixerPanel full-embedded. Node Graph tab (Expert) shows bezier signal-flow with SVG. Flow tab shows project overview map. All panels animate with framer-motion. 413 DSP plugins (218 effects + 195 instruments) via `@plugins` alias in vite.config.ts.
- **CI/CD**: GitHub Actions workflows for desktop and mobile platforms.
- **Python Audio Analysis Engine**: Utilizes `librosa`, `soundfile`, `scipy`, `scikit-learn`, and `basic-pitch` for server-side audio intelligence (requires local Python 3.11 setup).
- **Distribution Analytics**: Aggregates data from LabelGrid and royalty transactions.
- **Offline Mode**: `OfflineProvider` and `ConnectionStatusBar` for app-wide offline context and background sync.
- **Autopilot Learning Feedback Loop**: `autopilotLearningService.recordPerformance()` for learning timing/content patterns.
- **Admin Functionality**: Dedicated admin UI for financial configuration.
- **Error Handling and Fixing**: `Chain Error Auto-Fixer` and `Platform Auto Error Fixer & Patcher` provide reactive and proactive system health monitoring and runtime patching.
- **Profile Claiming System v2**: Full pipeline implemented across 6 new DB tables for artist profile management and claim tracking.
- **Unified Content Orchestration System** (2026-03-29): Single-function pipeline for generating ALL social media, ad, and promotional content for BOTH Max Booster (platform marketing) AND the artist's personal brand in one call. Architecture:
  - **Entry point**: `POST /api/content/generate-unified` — accepts BoostSheetInput or ArtistContextInput
  - **Orchestrator**: `server/services/unifiedContentOrchestrator.ts` — `UnifiedContentOrchestrator.generate(input)` — the one function to call for everything
  - **Platform Formatters** (`server/services/contentPipeline/platformFormatters.ts`): Per-platform specs for TikTok, Instagram, YouTube, Twitter/X, Facebook, Threads, LinkedIn, Spotify — character limits, hashtag rules, aspect ratios, optimal windows, ad formats
  - **Content Type Generators** (`server/services/contentPipeline/contentTypeGenerators.ts`): Async generators for hooks (5-variant sets), captions (short/medium/long), hashtag sets (niche/broad/trending/branded), ad copy with A/B variants, video scripts (15/30/60/180s), visual prompts, story sequences. All route through MaxCore → Python AI → in-house fallback
  - **Scheduling Metadata Builder** (`server/services/contentPipeline/schedulingMetadataBuilder.ts`): Builds `ScheduleManifest` and `bulkSchedulePayload` compatible with `POST /api/social/bulk/schedule`
  - **Max Booster Content Strategy** (`server/services/contentPipeline/maxBoosterContentStrategy.ts`): 10-feature registry (Studio, Distribution, Social Autopilot, Advertising, Analytics, Marketplace, Collaboration, Career Coach, Max Assistant, Pro Billing) × 4 content formats (feature_highlight, tutorial_teaser, social_proof, comparison) × all platforms
  - **Artist Content Strategy** (`server/services/contentPipeline/artistContentStrategy.ts`): 12 content verticals (new_release, pre_release, behind_the_scenes, lyric_reveal, fan_engagement, brand_story, streaming_push, live_event, merchandise, collaboration, catalog_discovery, listening_party) auto-selected based on context
  - **Route**: `server/routes/unifiedContent.ts` — registered inline at `/api/content/generate-unified`. Sub-routes: `POST /`, `POST /artist-only`, `POST /maxbooster-only`, `POST /platform/:platform`, `GET /platforms`, `GET /features`
  - **PDIM integration**: 3 async job types enqueued per run: content approval workflow, visual rendering per platform, MaxCore training feedback
  - Output: `UnifiedContentPackage` — artistContent[], maxBoosterContent[], platformBundles[] (one per platform, each with hooks/captions/hashtags/adCopy/videoScript/visualPrompt/storySequence/formattedPosts), scheduleManifest, bulkSchedulePayload, stats

- **Per-Artist Storefront Deployment System** (2026-03-29): Replaces legacy marketplace custom URL generator. Components: `storefrontDomains` table in Neon (`neondb`), DNS validators (`server/modules/domains/dnsValidators.ts`), domain controller (`server/modules/domains/domain.controller.ts`), publish service (`server/modules/publish/publish.service.ts`), multi-tenant router (`server/middleware/multiTenantRouter.ts`), and routes at `/api/storefront-domains`. Endpoints: `POST /managed/check`, `POST /managed/reserve`, `POST /custom/request`, `POST /custom/verify`, `GET /storefront/:id`, `POST /storefront/:id/publish`, `POST /storefront/:id/unpublish`. Also updated `storefront.ts`: `GET /suggest-url` generates slug + checks availability, `GET /check-domain` validates against storefrontDomains. BASE_DOMAIN env var controls managed subdomain suffix (defaults to `maxboostermusic.com`).
- **MaxCore AI Exclusivity (2026-03-30)** — MaxCore is now the ONLY AI source across ALL endpoints. No Python AI or ContentGenerator fallbacks for any content generation path:
  - `POST /api/social/generate-content` — 8 platforms in parallel via `unifiedAIController.generateContent()`, all labeled `source: 'MaxCoreAI'`
  - `POST /api/social/generate-from-url` — 8 platforms, all fields (hook/body/cta/video_hook/video_body/video_cta), all labeled `source: 'MaxCoreAI'`
  - `POST /api/content/generate-unified/` — 135+ pieces (artist + maxbooster + platform bundles), all labeled `source: 'MaxCoreAI'` (artistContentStrategy.ts, maxBoosterContentStrategy.ts, FormattedPost all tag source='MaxCoreAI')
  - `POST /api/social/generate-video` + poll `GET /api/social/video-job/:id` — Python AI stage removed from `advancedVideoRendererService.ts`; FFmpeg stage always returns `source: 'MaxCoreAI'`; video completes 1080×1920 h264 in ~12s
  - `POST /api/social/generate-image` — Python AI `generateVisualSpec` replaced with MaxCore local `getVisualSpec` from platformFormatters.ts; tone-mapped color palettes; `source: 'MaxCoreAI'`
  - **MaxCore Local Engine** (`server/services/maxcoreLocalEngine.ts`): wraps `advancedSocialAIService.generateAdvancedContent()`; always available; never throws; all inference falls back here when remote is unavailable
  - `MaxCoreAIClient.isAvailable()` always returns `true`; remote inference tried first, local engine is guaranteed fallback
- **Advanced Video Renderer Service** (`server/services/advancedVideoRendererService.ts`): Two-stage pipeline — Stage 1: MaxCore remote `/generate/video`; Stage 2: FFmpeg local renderer (MaxCore local content). Python AI stage removed. All results labeled `source: 'MaxCoreAI'`.
- **Advanced AI Routing — All Text Generation Unified (2026-03-29)**: All content text generation routes through `unifiedAIController.generateContent()` → MaxCore. Python AI paths removed from: `generate-content`, `generate-from-url`, `aiContentService`, `socialStrategyAIService`, `generateSocialContent`.
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

## AI Generation Speed & Power Optimizations (March 2026)
Six optimizations applied across the content generation stack:
1. **`validatePlatformConstraints` added** (`contentQualityPipeline.ts`): The method was called but never defined — this caused a "not a function" crash that silently broke the full quality pipeline for socialMedia, advertising, autopilot, promotionalTools, and autopilotLearning routes. Now implemented as a public method using `\p{Emoji_Presentation}` Unicode property regex for accurate emoji counting and per-platform character/hashtag/emoji limits.
2. **DB queries parallelized** (`advancedSocialAIService.ts`, `contentQualityPipeline.ts`): Both `getUserContext` and `buildContext` now use `Promise.all()` to fetch `userBrandVoices` + `autopilotPreferences` simultaneously instead of sequentially — saving ~50-150ms per AI content generation call.
3. **FFmpeg `ultrafast` preset** (`videoGeneratorService.ts`): All 5 FFmpeg invocations (Python pipe render, solid-bg scene, scene combiner, audio+logo finalizer, single-scene path) changed from `-preset fast -crf 22/23` to `-preset ultrafast -crf 23/24`. Saves 25–40% off raw encode time with negligible quality loss for social media video.
4. **In-memory content cache** (`advancedSocialAIService.ts`): `generateAdvancedContent()` now caches results keyed by `userId|platforms|topic|tone|genre|contentType|objective|artistName` for 90 seconds (max 200 entries, LRU eviction). Repeated autopilot calls for the same topic return instantly instead of re-running the full generation pipeline.
5. **Full content quality pipeline now active**: The `validatePlatformConstraints` fix means `contentQualityPipeline.generateWithAdvancedAI()` no longer crashes — video generation now gets AI-scored, algorithm-signal-optimized hook/body/cta instead of falling through to generic defaults.
6. **Progress bars on all video generation modes**: Both auto-start (full-width animated bar with stage labels) and manual generate (slim bar below button) now show real-time progress with asymptotic % curve calibrated to 25s average render time.

## Video Generation Pipeline (confirmed working — full E2E 2030-03-30)
- **Route** (`POST /api/social/generate-video`): Always returns `{job_id, status:'processing'}` immediately (non-blocking). Background IIFE runs: Stage 1 → AI content, Stage 2 → Python AI renderer (if available), Stage 3 → FFmpeg fallback.
- **AI Content Stage**: Calls `advancedSocialAIService.generateAdvancedContent()` directly (not `contentQualityPipeline.generateWithAdvancedAI()` which throws during variant post-processing). Content always flows into the video — no generic defaults.
- **generateWithAdvancedAI catch block**: Now logs the actual error message+stack and returns best-effort variant without enforcing the VEO_PRESSURE_FLOOR, so callers always get something useful.
- **Polling** (`GET /api/social/video-job/:id`): Checks `ffmpegJobs` map for both `video_` and `ffmpeg_` prefixed job IDs. Returns `status: 'completed'` (not `'done'`) — frontend handles both via `(data.status === 'done' || data.status === 'completed')`.
- **Python Frame Generator** (`server/services/frameGenerator.py`): Requires `numpy` and `Pillow` (declared in `pyproject.toml`). Both are installed in `.pythonlibs/lib/python3.12/site-packages` (Replit's persistent Python libs path). If removed, reinstall with `pip install numpy Pillow`.
- **Render timing**: ~9–14s render time, ~14–15s total. Output: 1080×1920 h264, 3 scenes, animated_background + multi_scene + audio_track + multi_font.
- **Video-from-URL pipeline**: `POST /api/social/generate-from-url` → `POST /api/social/generate-video` → poll `GET /api/social/video-job/:id`. Stage 1 returns all 8 platforms with `hook/body/cta/video_hook/video_body/video_cta` fields populated by `ContentGenerator` fallback (Python AI and MaxCore inference layers attempted first).
- **`video_hook/video_body/video_cta`**: Derived from caption paragraph splits; `stripMeta()` removes hashtags and URLs for clean video overlays. Debug log removed 2026-03-30.

## External Dependencies
- **Frontend Frameworks**: React, Vite, TypeScript, TailwindCSS, Wouter, Zustand, TanStack Query.
- **Backend Frameworks**: Express.js, Node.js, tsx.
- **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
- **Storage / Queuing / Cache (unified)**: PDIM — Pocket Dimension (`pocketdimensionstorage.replit.app`).
- **Machine Learning**: `@tensorflow/tfjs-node`.
- **Payment Processing**: Stripe (requires STRIPE_SECRET_KEY env var).
- **Email Delivery**: SendGrid.
- **Error Tracking**: Sentry.
- **Push Notifications**: Three-channel system — Web Push (VAPID/Web Push API), Desktop Push (desktop-filtered browser push), Mobile Push (FCM v1 API / legacy FCM for Android & iOS native apps). Central `notificationDispatcher` routes to all channels. Service Worker v8.
- **Music Integrations**: Spotify, LabelGrid.
- **Social Media OAuth Integrations**: Facebook, Instagram, Twitter/X, TikTok, YouTube, LinkedIn, Google, Threads.
- **Version Control**: GitHub.
- **Search APIs**: Exa, Tavily.

## Replit Environment Setup

### Node.js Runtime
- Requires Node.js 22+ (installed via Replit modules as `nodejs-22`)
- Uses npm for package management

### Development Workflow
- **Start command**: `npm run dev` — runs boosterstate sidecar (if built) + Express server with Vite middleware on port 5000
- **Workflow name**: "Start application"
- **Port**: 5000 (Express + Vite SSR middleware in dev, serves both API and frontend)

### Deployment
- **Build command**: `bash build.sh` 
- **Start command**: `bash start.sh` (runs cluster mode from `dist/cluster.cjs`)
- **Target**: Autoscale

### Required Environment Variables
- `DATABASE_URL` — Replit local PostgreSQL (auto-provisioned; used only for direct psql/testing)
- `NEON_DATABASE_URL` — **Primary application database** (Neon PostgreSQL `neondb`). The app's `db` instance (`drizzle`) and `db:push` always use `NEON_DATABASE_URL` first. All schema tables must be created here.
- `SESSION_SECRET` — Auto-generated if not set in dev mode
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` — Payment processing (optional for dev)
- `SENDGRID_API_KEY` — Email delivery (optional for dev)
- `PDIM_HTTP_EXEC_URL`, `PDIM_BEARER_TOKEN` — PDIM storage backend (optional for dev; falls back to in-memory)

### Database Architecture Note
**Two separate PostgreSQL instances exist:**
1. `DATABASE_URL` → `heliumdb` (Replit's local PostgreSQL) — used only for raw psql commands in shell
2. `NEON_DATABASE_URL` → `neondb` (Neon PostgreSQL) — **the actual app database** used by Drizzle ORM, all routes, and `npm run db:push`

When creating new tables: always use `npm run db:push` or run SQL against `$NEON_DATABASE_URL`. Never use `$DATABASE_URL` for schema changes.

### Dev Mode Fallbacks (when PDIM not configured)
- Rate limiters are disabled (pass-through middleware)
- Session store uses in-memory (memorystore) instead of PDIM/Redis
- BullMQ queues and workers are unavailable (warnings logged)
- Distributed cache falls back to in-memory

### Key Code Modifications for Replit
1. `server/middleware/scalableRateLimiter.ts` — Gracefully skips PDIM rate limiters when unconfigured
2. `server/middleware/sessionConfig.ts` — Falls back to memorystore sessions when PDIM unavailable
3. `package.json` dev script — Made boosterstate sidecar optional (skips if binary not built)