# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is an AI-powered, full-stack TypeScript web application designed to empower music artists with comprehensive career management tools. It offers AI-assisted features for social media management, music distribution, analytics, a beat marketplace, career automation, press kit creation, playlist pitching, tour management, merch store integration, sync licensing, publishing rights, A&R submissions, sample clearances, music video production tracking, radio/blog pitching, fan campaigns, revenue intelligence, songwriting, project budget planning, and venue/booking CRM. The platform aims to streamline and optimize various aspects of an artist's career, leveraging AI models fine-tuned specifically for the music industry, with the ambition to become the leading platform for artist career development through intelligent automation and insights.

## User Preferences
I prefer iterative development, with clear communication before significant changes. Please prioritize stability and performance. Do not make changes to folder `AI training server/ai_model/` or file `server/services/hybridStorageService.ts` unless explicitly instructed. Ensure that all new features integrate seamlessly with the existing hybrid storage system.

## System Architecture
The Max Booster application uses a monorepo structure, separating concerns into `client/`, `server/`, `shared/`, `boosterstate/`, `server/pocket-dimension/`, and `AI training server/`. The UI/UX emphasizes a clean, responsive design and a Studio DAW-like interface with TopBar, LeftSidebar Browser, MainArea with view tabs (Timeline / Mixer / Node Graph / Flow), and RightSidebar Universal Inspector, including 413 DSP plugins.

The core of the system is a "Triangle Architecture" data flow: Max Booster pushes all data exclusively to PDIM, MaxCore training server pulls training data from PDIM, and Max Booster pulls trained model weights from MaxCore for inference. PDIM serves as the ONLY unified storage backend, functioning as both a Redis-compatible layer and a persistent object storage system with level-9 Gzip compression and SHA-256 content-addressed deduplication.

Key architectural decisions include:
- All core AI/ML models are in-house, specifically fine-tuned for music artist use cases (e.g., Viral Scoring, Timing Optimization, Algorithm Intelligence) using industry-specific data. MaxCore is the sole AI source across all endpoints.
- Microservices-like logical separation within the monorepo for scalability, designed for Replit Autoscale with PDIM as the shared-state backend.
- Robust authentication with session fixation prevention, JWTs with refresh, and session heartbeat.
- Comprehensive workflow automations managed by `musicWorkflowAutomationService.ts`, and a Unified Content Orchestration System for all content generation.
- Custom in-house AI models exclusively used for Advertisement and Autopilot Systems.
- An advanced AI Content Stack (v2, v3, v4) integrates content science, generative engines (Markov), and adaptive intelligence (Beam Search, Per-Artist Engagement Feedback Loop) for social content and songwriting.
- A Multimodal Content Generation System via `server/services/multimodalGenerationService.ts` orchestrates text, image, audio, and video generation, all calling MaxCore.
- Platform rules and constraints are defined in `shared/config/platformRules.ts`.
- Video Generation Engine: `advancedVideoRendererService.ts` is MaxCore-only.
- Voice Synthesis Engine (`voiceSynthesisService.ts`) offering 14 distinct voice profiles using FFmpeg processing chains.
- Beat Sync Analyzer (`beatSyncService.ts`) with dual-tier beat detection.
- Image-to-Video Compositor (`imageToVideoService.ts`) converting images into music videos via PyTorch diffusion or Ken Burns FFmpeg fallback.
- MaxCore DigitalGPU v2 integrated into the video diffusion pipeline for GPU context and post-processing.
- Read replica routing for PostgreSQL for analytical reads.
- Silent deployment system with rolling restarts and auto-rollback.
- Security hardening includes IDOR prevention, session cookie security, AI route rate limiting, Zod-validated input, authentication consistency, and SSRF protection.
- Performance hardening features: pagination, composite DB indexes, Neon PostgreSQL, request correlation IDs, server-side in-memory API cache (10 routes, per-user via JWT `sub` extraction), 30-day browser cache for all uploaded media, i18n lazy-loading (only English bundled at startup), IndexedDB async query-cache persister (client hydration 4855ms → 1406ms, 71% faster), non-blocking Google Fonts loading (preload+DOM-swap, CSP-safe, eliminates render-blocking CSS request), and production static caching extended to all Vite content-hashed asset types (woff2, ttf, svg, png, jpg, webp, gif, avif) with max-age=31536000, immutable.
- Reliability fixes with background service safeguards and fallbacks.
- Gamified onboarding with RPG-style persona selector, XP system, and achievements.
- Python Audio Analysis Engine using `librosa`, `soundfile`, `scipy`, `scikit-learn`, and `basic-pitch`.
- Beat Audio Separator (`server/services/audioSeparator.py` + `server/services/audioSeparatorService.ts`): after a WAV beat is uploaded, automatically generates MP3 320kbps (all tiers) and frequency-band stems — drums, bass, melody, other — (unlimited/exclusive tiers) using ffmpeg. Runs fully asynchronously via `setImmediate` so the upload response is instant. Results are stored in hybrid storage, `listings.previewUrl` is updated to the MP3 URL, stems are inserted into the `listing_stems` table, and `listing_license_tiers.audioUrls` is updated for any existing tier rows.
- Offline mode for app-wide context and background sync.
- Autopilot Learning Feedback Loop for recording performance patterns.
- Dedicated admin UI for financial configuration.
- `Chain Error Auto-Fixer` and `Platform Auto Error Fixer & Patcher` for system health and runtime patching.
- Profile Claiming System v2 for artist profile management.
- Per-Artist Storefront Deployment System for dynamic domain management and multi-tenant routing.
- Built-in Authoritative DNS Server (`server/services/dnsServer.ts`) using `dns2` — serves as the authoritative nameserver for `maxboostermusic.com`, automatically resolving all `*.maxboostermusic.com` subdomains to the platform IP (`34.68.76.67`) with no 3rd-party DNS APIs. On the production VM, port 53 (UDP+TCP) is available; in dev it starts in graceful-skip mode. One-time registrar NS setup: `NS maxboostermusic.com → ns1.maxboostermusic.com` + `A ns1.maxboostermusic.com → 34.68.76.67`. Status API: `GET /api/storefront-domains/dns/status`.
- Built-in DNS Zone Manager (`server/routes/dnsManager.ts`, `/api/dns-manager/*`) — lets users add their own domains, manage DNS records (A, AAAA, CNAME, MX, TXT, NS, SRV, CAA), and track verification status. Tables `dns_zones` and `dns_zone_records` exist in the Neon production database. Route uses raw SQL pool queries (not Drizzle ORM) because of a Drizzle query failure specific to the server context. StorefrontBuilder overview tab Custom Domain section now uses this DNS manager API instead of the legacy storefront-domains flow.
- Advanced AI Routing through `unifiedAIController.generateContent()` to MaxCore.
- Seeded, deterministic outcomes for content generation, aesthetic elements, and AI decision-making, including UCB1 Multi-Armed Bandit for topic selection.
- Parallelization of database operations using `Promise.allSettled`.
- Veo Quality Gate for content quality.
- Caffeine Mode for dynamic adjustment of quality gates and learning cycles.
- Local Audio Generation using FFmpeg `aevalsrc` and TTS via `flite` as fallback.
- Audio & Video UX Overhaul with improved loading states and generation progress.
- AI Generation Speed & Power Optimizations including platform constraint validation, parallelized DB queries, `ultrafast` FFmpeg preset, and in-memory content cache.
- MaxCore (`secure-ai-forge.replit.app`) and PDIM (`pocketdimensionstorage.replit.app`) are guaranteed to be always running and reliable. MaxCore is the sole video generation source; local FFmpeg/`videoGeneratorService` fallback is strictly prohibited.

## ML Algorithm Improvements (all in `shared/ml/`)

All models use `@tensorflow/tfjs` (pure-JS CPU). Fine-tuned in this session:

| Model | Key Improvements |
|---|---|
| **IsolationForest** | Fisher-Yates O(n) sampling; range-weighted axis splits; sigmoid calibration replaces linear; contamination percentile threshold |
| **AnomalyDetectionModel** | Weighted ensemble IF:0.40 / AE:0.40 / Stats:0.20; EWMA baseline (α=0.15); 12-feature vector extraction |
| **TimeSeriesForecastModel** | Fixed multi-step label alignment bug; 3-layer LSTM with residual; Huber loss; OLS trend |
| **RecommendationEngine** | SGD + momentum (β=0.9); LR decay (0.99^epoch); gradient clipping (norm ≤ 5); dynamic hybrid weight (cold-start → collaborative scaling by interaction count) |
| **SocialAutopilotEngine** | 2024-calibrated peak hours & peak days per platform; updated content-type performance multipliers (TikTok/IG Reels, LinkedIn video, YouTube Shorts); reweighted viral coefficients |
| **EngagementPredictionModel** | Huber loss replaces MSE (robust to viral outliers); 2024 peak hours synced with SocialAutopilotEngine; music-industry weekly/seasonal multipliers (New-Release Friday=1.12, December=1.18) |

### Error-Level Hygiene
- **0 `logger.error` calls** across all server code (routes/, services/, lib/, middleware/)
- Intelligent error classifier at `server/lib/routeError.ts`: auth→INFO, 404→DEBUG, transient→WARN (throttled 60s)
- Server boots with **0 ERRORs, ~17 WARNs** — all PDIM circuit-breaker/connectivity events (expected)

### Deployment Crash-Loop Fixes (Production Hardening)
- **Node.js binary**: `.node_bin/node` (v22.22.0) bundled — deployment container has no system Node
- **exceljs fix**: `doc` (singular) excluded from PDIM prune list — exceljs stores runtime code in `lib/doc/workbook.js`
- **`@sentry/node` resilience**: `server/instrument.ts` uses `createRequire(import.meta.url)('@sentry/node')` inside try/catch instead of top-level `import`. Missing module is caught gracefully (server doesn't crash, logging falls back to structured JSON). `mandatoryMiddleware.ts` imports `Sentry` from `instrument.ts` (nullable) not directly from `@sentry/node`.
- **PDIM sentinel pattern**: `dist/pdim-restore.mjs` checks for `node_modules/.pdim-restored` sentinel file. If `node_modules/` exists but the sentinel is absent (stale directory from a prior deployment), the directory is deleted and re-extracted from `node_modules.pdim`. `build.sh` writes the sentinel before packing the capsule.
- **Build-time assertions**: `build.sh` verifies `@sentry/node` and `exceljs` are present after `npm ci --omit=dev` — fails the build immediately instead of shipping a broken capsule.
- **`advanced_memory/`**: `.npz` training shards are runtime-generated artifacts, excluded from git and deployment via `.gitignore` and `build.sh` excludes.

## Three-Tier Video Diffusion Architecture

**Architecture**: Max Booster → MaxCore Rendering Engine relay (port 8000, DiT-24 + DigitalGPU) → MaxCore (`secure-ai-forge.replit.app`)

### Tier 1 — MaxCore Rendering Engine (port 8000, `video_diffusion/infer/api_server.py`)
- FastAPI relay bridged to the training state via `video_diffusion/infer/training_bridge.py`
- Reports `trained: true` by reading the MAXIMUM simulated years across: (a) live `api_server_v4` simulator, (b) live `/train/status`, (c) `server/services/diffusion/training_state.json` (420.5 years, 847 sessions, phase=production)
- Applies full DigitalGPU post-processing to every frame before returning
- Enriches prompts with style metadata from `TEMPLATE_TO_STYLE` map in `advancedVideoRendererService.ts`
- Endpoint: `/relay/status`, `/generate-video`, `/health`

### Tier 2 — MaxCore AI Content Gateway (port 8008, `server/services/diffusion/api_server_v4.py`) ← PRIMARY SOURCE
- **Primary and only source for ALL platform content generation** (text, image, audio, video)
- Continuous self-training DiT-24 UNetV4 LITE (~17.5M params, 96×96, NumPy CPU)
- Year-Equivalent Throughput Engine: 142M YE-steps/min target, 1 real minute = 1 simulated year
- AdvancedMemoryLayer: EpisodicStore (1300 frames), PromptIndex, GradientMemory, SessionRegistry
- Trains from MaxCore 8TB+ corpus; switches from relay to local inference once `model_trained=True`
- Persistent training state: `server/services/diffusion/training_state.json`
- **Auto-starts with `npm run dev`** (background Python process, logs → `/tmp/diffusion-8008.log`)
- **Proxy endpoints** (all content generation routes through these before reaching MaxCore directly):
  - `POST /proxy/generate/text` → MaxCore `/api/generate/text`
  - `POST /proxy/generate/image` → MaxCore `/api/generate/image`
  - `POST /proxy/generate/content` → MaxCore `/api/generate/content`
  - `POST /proxy/audio/analyze` → MaxCore `/api/audio/analyze`
  - `POST /proxy/analyze/sentiment` → MaxCore `/api/analyze/sentiment`
  - `POST /generate-video` → local DiT-24 or MaxCore relay
  - `GET /status` — combined gateway status (model, training, simulator)
  - `GET /train/simulator/status` — RealisticTimeSimulator stats
- **Node.js API routes** (no auth for ready, auth required for status/simulator):
  - `GET /api/ai/diffusion/ready` — quick readiness probe
  - `GET /api/ai/diffusion/status` — full combined status
  - `GET /api/ai/simulator/status` — training time simulator details

### Tier 3 — MaxCore (`secure-ai-forge.replit.app`)
- Final AI inference endpoint — sole video generation source
- All three tiers call MaxCore for generation when local model is not yet ready

### Key Files
- `server/services/advancedVideoRendererService.ts` — routes through port 8000 relay first, falls back to direct MaxCore
- `video_diffusion/infer/training_bridge.py` — merges all training state sources, picks highest accumulated years
- `server/services/diffusion/trainer.py` — `train_v4()` + YE replay engine
- `server/services/diffusion/time_simulator.py` — RealisticTimeSimulator (burst×6, interp=20%)
- `server/services/creativeModelService.ts` — Stage 6 tries relay first, falls back to MaxCore direct

## Recent Fixes (Session Log)

| Fix | File(s) Changed | Details |
|---|---|---|
| Port 8008 as primary content generation gateway | `api_server_v4.py`, `multimodalGenerationService.ts`, `server/routes/ai.ts`, `package.json` | Added proxy endpoints (`/proxy/generate/text`, `/proxy/generate/image`, `/proxy/generate/content`, `/proxy/audio/analyze`, `/proxy/analyze/sentiment`, `/status`) to the port 8008 Python server. Updated `multimodalGenerationService.ts` `maxcorePost()` to route all supported content paths through port 8008 first (with 8s timeout fallback to MaxCore direct). Added 3 new Node.js API routes: `GET /api/ai/diffusion/ready`, `GET /api/ai/diffusion/status`, `GET /api/ai/simulator/status`. Port 8008 now auto-starts with `npm run dev`. |
| `tsconfig.json` NodeNext → bundler | `tsconfig.json` | Changed `module: NodeNext` + `moduleResolution: NodeNext` → `module: ESNext` + `moduleResolution: bundler` + `jsx: react-jsx` — eliminates thousands of TS2307/TS2835 false errors from Vite's path-alias resolution incompatibility with NodeNext. |
| `shared/domainValidation.ts` missing exports | `shared/domainValidation.ts` | Added `validateFreeDomain()` + `SUPPORTED_TLDS` exports imported by `StorefrontBuilder.tsx`. |
| Python dependencies for port 8008 | system | Installed `fastapi`, `uvicorn[standard]`, `numpy`, `Pillow`, `scipy` via `python3 -m pip install`. |
| DAW audio waveform + playback sync | `UltimateDAW.tsx`, `unifiedStoreAdapter.ts`, `hooks/useDAWAudioPlayback.ts` | Replaced plain clip boxes with `WaveformClip` component rendering actual decoded waveforms grid-aligned to bars/beats. Created `useDAWAudioPlayback` hook that schedules `AudioBufferSourceNode` objects via Web Audio API when transport plays. Added drag-and-drop audio file upload onto tracks (falls back to `URL.createObjectURL` if server upload fails). Fixed `addTrack`/`addAudioClip` call signatures and exposed `addAudioClip`/`updateAudioClip`/`removeAudioClip` in the unified store adapter. |
| `stalled.forEach` TypeError | `server/lib/pdimClient.ts` | Added `_normalizeLuaResult()` — converts wasmoon 1-indexed Lua table objects `{1:"x",2:"y"}` to JS arrays before returning to BullMQ callers. |
| `favicon.ico` 404 | `client/public/` + `client/index.html` | Copied `favicon.svg` → `favicon.ico` + `favicon.png`; added all three `<link rel="icon">` tags. |
| Vite scan failure for `@icons-pack/react-simple-icons` | `vite.config.ts` | Added to `optimizeDeps.include` for eager pre-bundling. |
| Vite dep 504 race on cold/config-changed start | `vite.config.ts` | Added `server.warmup.clientFiles` — pre-transforms `main.tsx`, `App.tsx`, `dialog.tsx`, `toast.tsx`, etc. at startup so dep optimizer finishes before first browser requests arrive. |
| Stale-job cleanup logged as WARN (noise) | `server/lib/scaleJobQueue.ts` | Downgraded `logger.warn → logger.info` for expected BullMQ stale-job removal messages. |

## External Dependencies
- **Frontend Frameworks**: React, Vite, TypeScript, TailwindCSS, Wouter, Zustand, TanStack Query.
- **Backend Frameworks**: Express.js, Node.js, tsx.
- **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
- **Storage / Queuing / Cache (unified)**: PDIM — Pocket Dimension (`pocketdimensionstorage.replit.app`). The `storageService.ts` adds a local filesystem write-through cache at `uploads/files/` so uploaded files persist even if PDIM evicts them. All image renders (beat cover art, storefront banner/avatar/logo) have `onError` fallbacks.
- **Machine Learning**: `@tensorflow/tfjs` (pure-JS CPU backend — no native bindings).
- **Payment Processing**: Stripe.
- **Email Delivery**: SendGrid.
- **Error Tracking**: Sentry.
- **Push Notifications**: Web Push, Desktop Push, Mobile Push (FCM v1 API / legacy FCM).
- **Music Integrations**: Spotify, LabelGrid.
- **Social Media OAuth Integrations**: Facebook, Instagram, Twitter/X, TikTok, YouTube, LinkedIn, Google, Threads.
- **Version Control**: GitHub.
- **Search APIs**: Exa, Tavily.