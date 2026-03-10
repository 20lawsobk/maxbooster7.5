# Max Booster - AI-Powered Music Career Management Platform

## Overview

Max Booster is an AI-powered, full-stack TypeScript web application designed to empower music artists with comprehensive career management tools. It offers AI-assisted features for social media management, music distribution, analytics, a beat marketplace, career automation, press kit creation, playlist pitching, tour management, merch store integration, sync licensing, publishing rights, A&R submissions, sample clearances, music video production tracking, radio/blog pitching, fan campaigns, revenue intelligence, songwriting, project budget planning, and venue/booking CRM. The platform aims to streamline and optimize various aspects of an artist's career, leveraging AI models fine-tuned specifically for the music industry, with the ambition to become the leading platform for artist career development through intelligent automation and insights.

## User Preferences

I prefer iterative development, with clear communication before significant changes. Please prioritize stability and performance. Do not make changes to folder `ai_model/` or file `server/services/hybridStorageService.ts` unless explicitly instructed. Ensure that all new features integrate seamlessly with the existing hybrid storage system.

## System Architecture

The Max Booster application uses a monorepo structure, separating concerns into `client/`, `server/`, `shared/`, `boosterstate/`, and `server/pocket-dimension/`. The UI/UX emphasizes a clean, responsive design.

**Key Architectural Decisions:**

-   **Pocket Dimension Storage Bubbles**: All major storage paths route through dedicated Pocket Dimension pockets (level-9 Gzip, SHA-256 content-addressed deduplication, 4MB chunking). This includes `ai-model-weights`, `offline-mode-cache`, `application-storage`, `hybrid-cold-storage`, and per-user pockets.
-   **Hybrid Storage System**: A three-tier approach for data storage: Replit Object Storage (hot tier), Pocket Dimension (primary storage), and BoosterState (Rust WAL store for metadata, sessions, and queues).
-   **AI Model Fine-Tuning**: All core AI/ML models are in-house, specifically fine-tuned for music artist use cases (e.g., Viral Scoring, Timing Optimization, Algorithm Intelligence) using industry-specific data and public datasets. No external AI APIs are used.
-   **Microservices-like Structure**: Services are logically separated within the monorepo.
-   **Scalability**: Designed for Replit Autoscale with Redis for shared state.
-   **Robust Authentication**: Implements session fixation prevention, JWTs with refresh, and session heartbeat.
-   **Comprehensive Workflow Automations**: 21 automation templates across five career phases, managed by `musicWorkflowAutomationService.ts`.
-   **Advertisement and Autopilot Systems**: Exclusively use custom in-house AI models and connected social profiles, avoiding traditional ad platform integrations.
-   **Songwriting AI Assist**: Generates lyric suggestions, rhyme words, and mood-aware chord progressions using `unifiedAIController`.
-   **Social Content Generation**: Generates structured social media content (hook, body, cta, hashtags) using `unifiedAIController`.
-   **Social Autopilot**: Manages and triggers the live `AutopilotEngine` for automated social media actions.
-   **Media-to-Content Analysis**: Analyzes URLs, audio files, and images to extract metadata and generate social media content using Python-based services (`urlAnalyzer.py`, `audioAnalyzer.py`, `imageAnalyzer.py`).
-   **Video Generation Engine v2 (Realistic Scene Engine)**: Upgraded Python+NumPy+PIL frame generator piped into FFmpeg, now offering 13 visual styles: 8 abstract animated styles (plasma_fractal, galaxy_spiral, neon_tunnel, aurora_curtains, warp_speed, liquid_metal, fire_embers, crystal_facets) + 5 new realistic scene environments built entirely in-house — no external APIs: (1) `concert_stage` — perspective stage floor, truss lighting rig, spotlight beam animation, crowd silhouettes with bob animation, featured performer with raised arm + mic stand; (2) `city_nights` — city skyline with lit windows, animated rain streaks, bokeh street lights, ground reflections, pedestrian silhouettes; (3) `studio_session` — recording studio interior with mixing console, monitor speakers, mic stand, animated VU meters, waveform screen, warm amber side lighting, REC LED blink; (4) `golden_hour` — layered sky gradient (gold to deep blue), hill/tree landscape silhouettes, animated sun rays + atmospheric haze + floating particles; (5) `neon_cityscape` — neon-lit buildings with flickering signs, rain reflections, animated pedestrians, colored bokeh. New `scene_prompt` config key parses free-text scene descriptions into style selection (parse_scene_prompt()). GENRE_DEFAULTS updated: hip-hop→city_nights, r&b/soul→studio_session, pop/afrobeats/latin/rock/metal→concert_stage, country/folk/indie/gospel→golden_hour, trap/electronic/edm→neon_cityscape. VideoGenOptions now accepts `scene_prompt` field; videoGeneratorService.ts auto-derives scene prompt from topic+genre if not explicitly set. Human figure rendering via `_draw_human()` PIL helper (head, torso, arms, legs, raised arm variant) used across concert_stage, city_nights, and neon_cityscape styles.
-   **Video Generation Engine v3 — In-House Diffusion Model v4 (self-improving, 3M params)**: A text-to-video neural network built entirely from scratch using pure NumPy — no PyTorch, no TensorFlow, no external APIs, continuously self-improving in the background. **Architecture (v3)**: 3.0M-parameter 4-level U-Net (channels [32,64,96,128]); dual SelfAttention2D — 4-head at encoder L3 (6×6 feature map) + 8-head at bottleneck (3×3) for global reasoning; 2 ResBlocks+GroupNorm per level; FiLM conditioning at all 8 encoder+decoder levels; 48×48 native resolution; EMA decay=0.9995; cosine schedule; perceptual loss (Sobel edge + FFT); 50 DDIM inference steps; guidance scale 5.0; Lanczos 2-step upscaling to 512×512; contrast+sharpen+saturation post-processing. **Training data v4**: 602 prompts across 20 scene categories (original 12 + dj_booth, street_art, music_video_set, album_cover_shoot, hip_hop_cypher, luxury_yacht, gospel_choir, trap_aesthetic). **Rich PIL training templates** (`training_data_v2.py`): 104 templates across all 20 scenes — perspective stages, LED walls, skylines with bokeh, neon grids, jazz setups, pipe ceilings, mirror balls, laser shows, etc. All render at 256×256 then Lanczos-downscale to 48×48. **Blended frame source**: 50% rich PIL templates + 35% frameGenerator renderer + 15% procedural. **Long-term memory** (`memory.py`): persists scene mastery, experience replay buffer (500 hard examples), session log across all training runs — each session builds on the last. **Auto rotate/shuffle** (`RotatingBatchScheduler`): priority-weighted scene sampling (harder scenes get 2-3× more training time), 20% of each epoch replays hard examples from buffer, shuffled within each cycle. **Background self-training** (`diffusionBackgroundTrainer.ts`): starts automatically 60s after server boot, runs training sessions in a continuous loop rotating quick→medium→deep→medium→deep... indefinitely, never stops improving. **Training tiers**: quick (300×10, ~28min), medium (600×20, ~110min, default), deep (1000×30, ~275min). **API**: `GET/POST /api/music-videos/diffusion/status|train|generate|background/status|background/start|background/stop`.
-   **Veo-for-Music Full Training Pipeline (A-E COMPLETE)**: Five-module training infrastructure for surpassing Google's Veo in the music domain. (A) `dataset_schema.py`: `MaxBoosterSample` dataclass — unified data contract for all training data: (T,H,W,3) video frames, rich audio features (BPM, beat_grid, energy_curve, chroma, onset_strength), semantic labels (scene/genre/mood/style_tags), quality score, provenance; `SampleWriter` (npz+json), `ManifestWriter`, `SampleValidator`, `DatasetManifest`. (B) `dataset_pipeline.py`: `DatasetRegistry` catalogues 29 datasets (YouTube-8M, VGGSound, AIST++, FMA, GTZAN, UCF-101, Kinetics-700, LAION, WebVid-2M, OpenVid-1M, AudioSet, HMDB-51, DALI, MagnaTagATune, etc.) with exact search terms, HuggingFace IDs, licenses, sizes; `VideoDownloader` (yt-dlp, now installed); `VideoPreprocessor` (FFmpeg+PIL, no cv2); `AudioPreprocessor` (librosa — BPM, beat grid, energy curve, chroma); `CaptionGenerator` (visual+audio analysis, no external API); `DatasetBuilder` (YouTube/local video/audio/synthetic pipelines); `DatasetLoader` (multi-dataset mixing with configurable weights). (C) `training_curriculum.py`: 30-day progressive training schedule — Phase 1 (Days 1-7): Spatial Foundation T=4 64×64 lr=2e-4; Phase 2 (Days 8-14): Motion Coherence T=8 64×64 lr=1e-4; Phase 3 (Days 15-21): Music Specificity T=16 96×96 lr=5e-5; Phase 4 (Days 22-30): Audio-Visual Fusion T=32 96×96 lr=2e-5; `CurriculumScheduler` auto-advances by calendar day or quality target achievement; `QualityEvaluator` measures mse_loss/temporal_consistency/perceptual_score; `CurriculumTrainer` runs month-long loop. (D) `distillation.py`: Teacher-student knowledge distillation — `TeacherModel` (loads best available weights v4>v3>random); `DistillationLoss` (teacher matching α=0.7 + ground truth α=0.3 + feature alignment β=0.1 + temporal coherence); `ProgressiveDistillation` (consistency distillation: 2 teacher steps → 1 student step, halves inference cost per round); `KnowledgeDistillationTrainer` (on-the-fly soft-label generation, teacher cache); `SelfDistillation` (self-improving loop: trained model becomes next teacher). (E) `veo_roadmap.py`: Live milestone tracking and gap analysis — `VeoRoadmap` with 14 concrete milestones across 4 phases; `GapAnalyzer` compares all 11 dimensions vs Veo benchmarks (we win in music_sync, genre_accuracy, beat_sync, domain_music after 30 days); `RoadmapTracker` persists progress to disk, fires milestone alerts, generates ASCII status reports; 30-day projection shows +0.15 music moat advantage over Veo.
-   **UNetV4 + v4 Training Engine (COMPLETE & INTEGRATED)**: Next-generation 463M-parameter text-to-video diffusion model architecture. `unet_v4.py`: 5-level U-Net with channels [128,256,512,1024,1024], depthwise-separable convolutions at shallow levels, 4 ResBlocks per level, 32-head spatial + temporal attention at bottleneck (TemporalAttention1D), T=32 frame sequences, 96×96 native resolution, 256-dim conditioning (128 time + 128 text). `temporal_attention.py`: factored space-time attention with learned sinusoidal position embeddings. `frame_extractor.py`: 4 frame sources (renderer/templates/procedural/video cache), T-frame sequences, augmentation pipeline. `training_data_v3.py`: PromptGeneratorV3 with 60 scene categories and 100,000+ combinatorial prompts. `trainer.py` (`train_v4()`): full training loop — progressive phases (T=4/8/16/32), cosine diffusion schedule, perceptual+temporal coherence loss, gradient clipping, EMA (decay=0.9998), WEIGHTS_V4_PATH (`weights_v4.npz`) separate from v3. All components individually tested and verified.
-   **MaxCore DigitalGPU v2 (All 4 Phases COMPLETE & TESTED)**: A domain-native compute engine and hardware accelerator design stack. Phase 1 (LocalCPUBackend/NumPy+OpenBLAS): stable, all diffusion layers wired — 47 conv2d, 2 attention, 17 gemm per UNet forward. Phase 2 (LocalGPUBackend/Numba JIT): Numba 0.64 parallel JIT backend with fused kernels (conv+SiLU, linear+SiLU, fused online-softmax attention); auto-detecting dispatcher (Numba → NumPy fallback); hot-swappable via `gpu.upgrade_to_gpu()`. Phase 3 (GraphOptimizer + AutoTuner): op-fusion (conv2d+act→fused, gemm+act→fused), dead-code elimination, tile-size search; agent AutoTuner profiles hot kernels from profiler, benchmarks 3 configs each, persists best to `tune_config.json`; AutoTuner found 2.04× speedup for fused_conv_silu and 2.39× for gemm.impl=matmul. Phase 4 (MaxCoreTile + RTLGenerator): cycle-accurate 16×16 systolic PE array simulator (weight-stationary, 0.512 TFLOP/s @ 1GHz FP32); UNet forward estimated at 1.03ms @ 1GHz; RTLGenerator outputs 6 synthesizable SystemVerilog files (maxcore_pe.sv, maxcore_sram.sv, maxcore_array.sv, maxcore_tile_ctrl.sv, maxcore_top.sv, maxcore_pkg.sv with full ISA opcodes). All API methods on DigitalGPU: `upgrade_to_gpu()`, `optimize_graph()`, `auto_tune()`, `hardware_sim()`, `generate_rtl()`. Client-side: `DigitalGPUInferenceBridge.ts` WebGL2 pipeline routes diffusion output through GPU post-processing chain (color grading → bloom → chromatic aberration → vignette) with 8 scene presets and audio-reactive parameters. MaxCore ISA ops: TMM (gemm), TCONV (conv2d), TATTN (fused attention), REDUCE (deterministic reduction), ACT (fused SiLU/GELU/ReLU). Graph APIs: begin_graph / end_graph / run_graph / optimize_graph.
-   **Read Replica Routing**: PostgreSQL read replica is used for analytical and dashboard reads.
-   **Silent Deployment System**: Self-evolution engine for silent deployments with rolling restarts and auto-rollback.
-   **Security Hardening**: Includes IDOR prevention, improved session cookie security, AI route rate limiting, Zod-validated input, authentication consistency, and SSRF protection. Optimizations to the self-healing security engine and rate limiters.
-   **Content Generation Simulation**: `POST /api/social/ai/generate` now returns a `simulation` block with genre auto-detection, viral score, predicted engagement metrics, platform optimization data, and scheduling intelligence.
-   **AI Content Stack v2 (Max Quality Upgrade)**: All five in-house JS AI content generation services upgraded for maximum output quality: (1) `ContentGenerator.ts` — hookOptions expanded to 12-16 per content type with genre-specific hook pools (hip-hop, trap, r&b, pop, afrobeats, electronic, drill, country); CTAs expanded to 8-11 per category. (2) `contentQualityPipeline.ts` — strategies expanded from 3 to 6 per objective (milestone, journey, exclusivity, challenge, opinion, community, scarcity, value-stack, first-mover, pov, transformation, industry-truth added); each strategy now has 2-3 template variants (array format); HOOK_PATTERNS expanded to 11; `scoreSentiment()` uses 5 word-category groups with 50+ positive words; `scoreCTA()` improved with urgency/action/emoji pattern detection. (3) `viralScoring.ts` — hookPatterns expanded to 18 (release/milestone/transformation/achievement hooks added); emotionalTriggers expanded to 62+ (dope, insane, goated, on repeat, chills, no skips, earworm, etc.). (4) `autoPostGenerator.ts` — all four objective headline generators expanded to 10 templates; all body generators expanded to 6 rich variants per objective. (5) `advancedSocialAIService.ts` — SEMANTIC_WORD_WEIGHTS expanded from 20 to 80+ entries; VIRAL_PATTERNS expanded from 6 to 14 patterns (milestone, vulnerability, discovery, industry_truth, process_reveal, replay_bait, community_love, curiosity_gap added); hookTemplates expanded to 10-12 per content type with genre awareness; body generators use 3-variant pools per content type; CTAs expanded to 10-12 per objective; generateVariants upgraded to 5 types (adding milestone/community variant).
-   **AI Content Stack v4 (Generative + Adaptive Intelligence Upgrade)**: Round 3 upgrades activating three new intelligence layers: (1) **Markov Generative Engine** — `ContentGenerator.ts` n-gram model training corpus upgraded from 15 generic phrases to 274 start sequences / 2,673 transition states using `VIRAL_CONTENT_CORPUS_FLAT` (300+ high-performing music artist post sentences organized by content type: announcement, behind_scenes, storytelling, engagement, tiktok_native, instagram_native, twitter_native, genre-specific hip-hop/r&b/pop/trap, milestone, pre_release). `generateMarkovBody()` method added — activated at 25% probability for release body segments to produce novel sentences not available in any template pool. (2) **Beam Search Candidate Selection** — `BeamContext` interface and `scoreCandidate()` inline fast-scorer (~0.5ms, no async) added to `ContentGenerator.ts`; scores candidates on: objective-signal density, platform-native signals, release-phase alignment, genre vocabulary, specificity signals, curiosity gap patterns, emotional resonance, tone alignment. `beamSelect()` method applies temperature-scaled softmax weighting (temp=0.6) for quality-biased weighted random selection (preserves variety, avoids pure argmax). All 8 pool selection points in `buildFromPrompt()` (hook, closers, eventBodies, descBodies, genericReleaseBodies, selfIdPhrases, beatBodies, CTA) now use `beamSelect()`. `patternWeights` parameter threaded from `GenerationOptions` → `generateCaption()` → `generateFromTemplate()` → `buildFromPrompt()` → `BeamContext`. (3) **Per-Artist Engagement Feedback Loop** — `getContentPatternWeights(userId, platform?)` method added to `autopilotLearningService.ts`; queries `autopilot_learning_data` by hookType over last 60 days, computes relative engagement weights (1.0 = baseline, up to 2.5x), returns per-pattern bias map. `detectHookPattern(text)` function added to both `autoPostingService.ts` and `autoPostingServiceV2.ts` — inspects content text and classifies into 10 pattern types (curiosity_gap, tiktok_native, twitter_native, instagram_native, storytelling, behind_scenes, engagement, release_cta, pre_release, milestone, organic). All `recordPerformance()` calls now tag real hook types instead of hardcoded `'organic'`, enabling feedback loop to accumulate per-artist pattern performance data for future weighted generation.
-   **AI Content Stack v3 (Advanced Content Science Upgrade)**: Research-based Round 2 upgrades applying evidence-based content science principles across all four core generation files: (1) `contentQualityPipeline.ts` — added `releasePhase` and `streamCount` to `ContentContext` interface; added `CONTENT_FORMULA_LIBRARY` (12 proven viral formulas: curiosity_gap, before_after, social_proof, challenge_dare, insider_secret, misconception, countdown, milestone, relatable_moment, transformation, community_shoutout, industry_truth); added `PSYCHOLOGICAL_TRIGGER_LAYERS` mapping objectives to 2-3 trigger combos; added `RELEASE_PHASE_MULTIPLIERS` (pre-release 1.08x, launch 1.22x, first-week 1.15x, milestone 1.12x); upgraded `predictEngagement()` from 4 simple signals to 20+ advanced signals; added `scoreSpecificity()` and `scoreEmotionalArc()` scoring methods; updated `calculateScores()` to include specificity (8%) and emotionalArc (7%) dimensions. (2) `advancedSocialAIService.ts` — added `PLATFORM_NATIVE_DNA` (openers/transitions/closers/avoidPhrases per platform: TikTok, Instagram, Twitter, YouTube, Facebook); added `SELF_IDENTIFICATION_PHRASES` library (artists/fans/universal categories with 6 entries each); added `EMOTIONAL_ARC_TEMPLATES` (Hook→Context→Tension→Resolution→CTA structures for announcement, storytelling, engagement, behind_scenes content types); added `CURIOSITY_GAP_PATTERNS` (12 information-gap linguistic constructions); added `buildEmotionalArcBody()` method (used for 55% of storytelling/announcement/behind_scenes content); added `buildCuriosityGapHook()` method (used for 30% of viral/engagement hooks); updated `generateHook()` to inject curiosity gaps and platform-native openers. (3) `viralScoring.ts` — added curiosity gap detection (+12 max) in `analyzeHookStrength()`; added platform-native language detection (+8) per platform; added self-identification phrase detection (+7); added emotional arc detection (tension +8, resolution +6, full arc +11 bonus) in `analyzeEmotionalResonance()`; added self-identification phrase scoring (+14 max); added `scoreSpecificity()` private method and integrated into `calculateOverallScore()`; added content formula formula detection bonuses. (4) `ContentGenerator.ts` — added release phase detection in `parseTopicContext()` (5 phases: pre-release, launch, first-week, sustain, milestone); added curiosity gap hook pool (6 templates) for release content; added phase-specific hook arrays (pre-release/launch/first-week/milestone each with 4 templates); added self-identification body phrases (5 templates, 50% insertion rate); added 3 new specific body templates for release content (voice memo origin, scrapped versions narrative, universal/personal line).
-   **Performance Hardening**: Pagination, Redis query caching, composite DB indexes, Neon PostgreSQL, and request correlation IDs are implemented. Includes new production-scale indexes and an 8-hour social engagement analytics refresh cron.
-   **Gamified Onboarding**: RPG-style "Choose Your Class" persona selector, animated XP bar, rank progression, and achievement pop-ups.
-   **Studio DAW UI/UX**: Customizable toolbar, resizable panels, platform-adaptive fullscreen mode, and Web Audio API integration.
-   **CI/CD**: GitHub Actions workflows automate builds for desktop (Linux, Windows, macOS) and mobile (Android, iOS) platforms.
-   **Python Audio Analysis Engine**: Utilizes `librosa`, `soundfile`, `scipy`, `scikit-learn`, and `basic-pitch` for server-side audio intelligence, including BPM/key analysis, MIDI transcription, and auto-tagging on beat uploads.
-   **Distribution Analytics**: Enhanced routes for `streams-revenue` and `analytics/growth` aggregate data from LabelGrid and `royaltyTransactions` table for comprehensive reporting.
-   **Redis Stability**: Implemented `unhandledRejection` handlers to treat Redis `Command timed out` and `Connection is closed` as non-fatal, preventing app restarts during temporary Redis slowdowns.
-   **Offline Mode**: `OfflineProvider` and `ConnectionStatusBar` enable app-wide offline context, a dismissible banner, and a background sync queue.
-   **Autopilot Learning Feedback Loop**: `autopilotLearningService.recordPerformance()` is called after successful auto-posts to record initial analytics and learn timing/content patterns.
-   **TikTok Production Mode**: Switched `TIKTOK_ENV` to `production` using production client credentials.
-   **Financial Config Admin UI**: Admin panel "Financial Config" tab lets admin edit DSP royalty rates (per-stream base rate, premium multiplier), tax treaty withholding rates per country, and label settings (ISRC registrant code, UPC prefix, etc.) with inline editing. Backend routes: `GET/PATCH /api/admin/financial-config/royalty-rates/:id`, `GET/PATCH /api/admin/financial-config/tax-treaties/:id`, `GET/PATCH /api/admin/financial-config/label-settings/:key`.

## Replit Environment Setup

- **Node.js**: Version 22 (required for `engines: { node: ">=22" }`)
- **Python**: 3.11 with uvicorn, fastapi, pydantic (for Python AI microservice on port 9878)
- **Database**: Neon PostgreSQL (NEON_DATABASE_URL), Replit PostgreSQL as fallback (DATABASE_URL)
- **Workflow**: `npm run start` on port 5000 (production mode, webview)
- **Production mode**: `npm run build` (esbuild bundles server to dist/cluster.cjs, Vite builds client to dist/public), then `npm run start` (starts Node cluster)
- **Hybrid Storage**: Replit Object Storage (REPLIT_BUCKET_ID: replit-objstore-3eab39bb-cd26-43db-9900-1e811e2220fe) as hot tier + Pocket Dimension (custom compression/dedup) as cold tier + BoosterState (Rust WAL, port 9877) for metadata/queues
- **Redis**: REDIS_URL set (redis://...cloud.rlrcp.com) — BullMQ workers, Redis session store, cross-instance WebSocket PubSub all active
- **All API keys configured**: Stripe (live), SendGrid, Sentry, all OAuth providers (Facebook, Instagram, TikTok, Twitter, LinkedIn, YouTube, Google, Threads, Spotify), LabelGrid, Exa, Tavily, GitHub PAT
- **Admin**: ADMIN_EMAIL=blawzmusic@gmail.com, ADMIN_USERNAME=B-Lawz Music (bootstrapped)
- **Deployment**: Autoscale, build with `npm run build`, run with `npm run start`

## External Dependencies

-   **Frontend Frameworks**: React, Vite, TypeScript, TailwindCSS, Wouter, Zustand, TanStack Query.
-   **Backend Frameworks**: Express.js, Node.js, tsx.
-   **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
-   **Caching/Queuing/Sessions**: Redis.
-   **Object Storage**: Replit Object Storage, Pocket Dimension.
-   **TensorFlow**: `@tensorflow/tfjs-node` (with graceful fallback to CPU backend).
-   **Payment Processing**: Stripe.
-   **Email Delivery**: SendGrid.
-   **Error Tracking**: Sentry.
-   **Push Notifications**: Web Push Protocol.
-   **Music Integrations**: Spotify, LabelGrid.
-   **Social Media OAuth Integrations**: Facebook, Instagram, Twitter/X, TikTok, YouTube, LinkedIn, Google, Threads.
-   **Version Control**: GitHub.
-   **Search APIs**: Exa, Tavily.

## Production Hardening (v4.1 — March 2026)

**Critical bugs fixed:**
- `client/src/lib/logger.ts`: Removed broken `import { logger } from 'logger'` (non-existent npm package causing infinite recursion stack overflow). Replaced all internal `logger.info/error()` calls with direct `console.log/error/warn()` — the client Logger class IS the logger, so it must not self-reference.
- `client/src/lib/offline/index.ts`: `initOfflineQueue`, `initDraftStorage`, `initOfflineCache`, and `initSyncManager` were only re-exported (not locally imported), making them undefined when called inside `initOfflineSystem()`. Added proper local imports for all four functions.
- `client/src/lib/externalLinks.ts`, `offlineStorage.ts`, `sentry.ts`, `undoSystem.ts`: All had `import { logger } from 'logger'` (non-existent package). Fixed to `import { logger } from '@/lib/logger'`.
- `server/safety/mandatoryMiddleware.ts`: CORS middleware was blocking `http://127.0.0.1:5000` and `http://localhost:*` origins in production, causing all static asset requests from Replit's webview preview to return 500. Added `isLocalOrigin` check to allow localhost/127.0.0.1 origins alongside Replit domains.
- `server/safety/index.ts` + `server/index.ts`: Typo `initializeSafetyystems` → `initializeSafetySystems` (consistent rename across both files).
- `server/routes.ts`: Pocket Dimension write endpoint (`POST /api/pocket/:pocketId/write`) was a stub returning fake success without persisting anything. Fixed to actually insert into `userStorageFiles` table with proper content-addressed key, size tracking, and DB record.
- Missing `client/src/data/blogPosts.ts`: File referenced by `Blog.tsx` and `BlogPost.tsx` didn't exist, breaking production Vite build. Created complete data file with 5 industry-relevant blog posts, `BlogPost`/`BlogSection` TypeScript interfaces, and `getBlogPostBySlug`/`getRelatedPosts` helper functions.

**Environment variables added:**
- `WEBHOOK_SECRET`: Required by `server/services/webhookReliabilityService.ts` in production. Set as 64-char hex random secret.

## Codebase Polish (v4.0 full sweep)

**Bugs fixed:**
- `server/routes/api/v1/analytics.ts` `/platforms`: Platform token mapping was wrong — `spotify` and `soundcloud` were reading `facebookToken`/`tiktokToken`. Fixed to only surface the 5 platforms that have actual OAuth token columns (`youtube`, `facebook`, `instagram`, `twitter`, `tiktok`)
- `server/routes/auth.ts` `/devices/trust`: This endpoint was a complete no-op — it returned success without saving anything to the DB. Fixed: `trusted` boolean column added to `sessions` table and the endpoint now persists via `db.update()`
- `shared/schema.ts` `sessions`: Added `trusted boolean DEFAULT false` column

**Backend hardening:**
- `server/routes/socialMedia.ts`: Inbox `limit`/`offset` params now validated with `Number()` + NaN guard and clamped (1–200)
- `server/routes/studioGeneration.ts` `/audio-to-melody`: Python stderr captured and surfaced as a readable error message
- `server/services/aiServer.py` `/analyze/audio`: Path traversal protection — realpath + WORKSPACE_DIR boundary check; 403 for paths outside workspace
- `server/services/aiServer.py` `_detect_key()`: Graceful fallback for clips < 0.5s; `chroma_stft` fallback if CQT fails; default 'C major' if all attempts fail

**console.log/info → structured logger:**
- `server/services/diffusionBackgroundTrainer.ts`: All 4 `console.log`/`console.error` calls replaced with `logger.info`/`logger.error`
- `client/src/pages/Analytics.tsx`: Removed 2 `console.info` calls from WebSocket connect/disconnect handlers

**Native browser dialogs eliminated (10 instances replaced with AlertDialog/toast):**
- `FlowStateProjectSelector.tsx`: Both `window.confirm` calls (unsaved-changes + delete project)
- `StemsManager.tsx`: `confirm('delete stem?')` → AlertDialog with Cancel/Delete
- `CustomWorkflowBuilder.tsx` `WorkflowCard`: `confirm('Delete workflow?')` → AlertDialog  
- `ScoreEditor.tsx`: `alert('PDF Export...')` → toast notification
- `AdminDashboard.tsx` `TokenManagementTab`: `alert()` for token issued → toast; `alert('revoked')` → toast
- `AdminDashboard.tsx` `WebhookMonitorTab`: `alert('retry initiated')` → toast
- `Landing.tsx`: `alert('Too many requests')` → destructive toast
- `Marketplace.tsx`: Inline `confirm('delete product?')` → AlertDialog with pendingDeleteProductId state
- `MerchStore.tsx`: Inline `confirm('Are you sure?')` → AlertDialog with pendingDeleteId state
- `SocialMedia.tsx`: `confirm('delete scheduled post?')` → AlertDialog with pendingDeleteCalendarPostId state

**Frontend quality:**
- `AudioEngine.ts`: CPU usage now derived from actual Web Audio context timing delta (was `Math.random()`)
- `FlowStateLyricsToMelody.tsx`: Mode-aware header subtitle and empty state (Lyrics vs Audio input)
- `FlowStateSampleBrowser.tsx`: Empty state for no samples + no search results
- `App.tsx`: Removed duplicate `prefetchAdjacentRoutes` call from initial mount effect (the location-change effect handles this correctly on its own)

## AI Generation Stack (v4.0 — April 3, 2026 Launch)

**In-House Models (no external APIs):**
- **UNetV4 Diffusion** (463M params) — text-to-video generation, 64×64 base, continuous training
- **Music Generation** (Splice replacement) — text-to-audio, audio-to-audio style transfer, pattern generation (drums/bass/pad/melody/chords), MIDI output, intelligent mastering
- **Multi-modal Content Engine** — any input (text/audio/image/video/URL) → any output (text/audio/image/video)
- **Creative Transformer** — social content, scripts, lyrics, hashtags
- **BPM Detection, Genre Classification, Recommendation Engine** — shared ML layer

**Video Post-Processing Pipeline** (`server/services/diffusion/video_postprocessor.py`):
- SuperResUpscaler: 64→1080p with learned sharpening convolution
- MotionInterpolator: source_fps → target_fps with ease-curve blending
- BeatSyncMapper: onset detection + BPM grid → brightness flashes on beat
- PlatformExporter: 7 platform profiles (TikTok/Reels/Shorts/Instagram/Twitter/Facebook/Master)
- `GET /platforms` endpoint exposes all profiles to frontend
- Every generated video auto-remastered to correct platform spec

**Training Infrastructure:**
- Dual-node federated training: Replit + Windows (D: drive) via FedAvg weight sync
- Peer sync worker: `PEER_TRAINING_NODE` env var → syncs every 10 sessions
- Curriculum: 30-day phased training targeting April 3, 2026 launch
- D: drive layout: `D:/ai_server/` with models/, datasets/, knowledge/, logs/

**Sample Library (Splice Replacement):**
- AI-generated samples auto-persisted to `studio_samples` DB table after each generation
- Browsable via `GET /api/studio/samples` with search, category, BPM, key filters
- Text-to-audio, audio-to-audio style transfer, and pattern generation all feed the library

**Wired Flows:**
- Lyrics → melody: client-side math + backend model suggestions blended together
- Full arrangement (melody/bass/pad/drums) → DAW timeline via `onTrackGenerated` callback
- URL → all 4 output types: `POST /api/social/analyze-url` returns content + video_config + audio_style + image_prompt
## Codebase Security & Reliability Audit (March 10, 2026)

**Python fixes applied:**
- `server/services/diffusion/memory.py`: Corrupted memory.json now backed up to `memory.json.corrupted` before starting fresh — training progress never silently lost
- `server/services/diffusion/memory.py`: `RotatingBatchScheduler` removed useless full-dataset copy (`[(f,p) for f,p in dataset if True]`) — direct reference used instead
- `workers/dataset_manager.py`: Fixed unclosed file handle (`open().close()` → `with open() as f`), fixed `subprocess.run(shell=True)` to use list args with return code checking
- `workers/gpu_scheduler.py`: Fixed `subprocess.run(shell=True)` without return code check — training failures no longer silently marked as idle; exit codes logged
- `maxcore_server.py`: Fixed bare `except Exception: pass` in `_append_loss` and `_append_session` — now logs warnings with error detail

**TypeScript/server fixes applied:**
- `server/safety/stripeWebhookSecurity.ts`: Replaced in-memory `Set<string>` idempotency with Redis-backed (24h TTL, fallback to memory). Survives restarts and multi-instance deployments
- `server/routes.ts`: Strengthened HTML sanitization from `/<[^>]*>/g` (bypassable) to `/[<>&"'\`]/g` (strips all injection chars)
- `server/routes.ts`: Registration race condition fixed — `createUser` now wrapped in try/catch that handles DB unique constraint (code 23505) gracefully

**Frontend fixes applied:**
- `client/src/pages/ShowPage.tsx`: Emergency stop now clears countdown interval and resets countdown state — next song no longer auto-starts after emergency stop
- `client/src/pages/ShowPage.tsx`: Added unmount cleanup useEffect for countdown interval — no memory leak on navigation
- `client/src/components/search/SearchSuggestions.tsx`: Removed `dangerouslySetInnerHTML` XSS risk — search suggestions now render as safe text content

**Database fixes applied:**
- `migrations/0011_add_missing_indexes.sql`: Added indexes for `users.password_reset_token`, `users.google_id`, `users.stripe_customer_id`, `ai_models.model_type`, `ai_models.status`
- `shared/schema.ts`: Schema updated with matching drizzle index definitions
- `migrations/0005_api_tier_enum_update.sql` → renamed to `migrations/0012_api_tier_enum_update.sql` to resolve conflict with `0005_jazzy_excalibur.sql`

**Outstanding issue:**
- `CONTROL_DAEMON_URL` is set to `https://maxbooster.replit.app` (wrong) — must be updated to the actual Cloudflare tunnel URL for the Windows GPU server to receive dataset download jobs. The Dataset Downloader will remain at 7/32 until this is corrected.
