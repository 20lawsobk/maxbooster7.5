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
-   **Video Generation Engine**: Drives a custom Python+NumPy frame generator piped into FFmpeg, offering 8 animated visual styles and a neural network (`videoNeuralNet.py`) for predicting visual parameters.
-   **Read Replica Routing**: PostgreSQL read replica is used for analytical and dashboard reads.
-   **Silent Deployment System**: Self-evolution engine for silent deployments with rolling restarts and auto-rollback.
-   **Security Hardening**: Includes IDOR prevention, improved session cookie security, AI route rate limiting, Zod-validated input, authentication consistency, and SSRF protection. Optimizations to the self-healing security engine and rate limiters.
-   **Content Generation Simulation**: `POST /api/social/ai/generate` now returns a `simulation` block with genre auto-detection, viral score, predicted engagement metrics, platform optimization data, and scheduling intelligence.
-   **AI Content Stack v2 (Max Quality Upgrade)**: All five in-house JS AI content generation services upgraded for maximum output quality: (1) `ContentGenerator.ts` — hookOptions expanded to 12-16 per content type with genre-specific hook pools (hip-hop, trap, r&b, pop, afrobeats, electronic, drill, country); CTAs expanded to 8-11 per category. (2) `contentQualityPipeline.ts` — strategies expanded from 3 to 6 per objective (milestone, journey, exclusivity, challenge, opinion, community, scarcity, value-stack, first-mover, pov, transformation, industry-truth added); each strategy now has 2-3 template variants (array format); HOOK_PATTERNS expanded to 11; `scoreSentiment()` uses 5 word-category groups with 50+ positive words; `scoreCTA()` improved with urgency/action/emoji pattern detection. (3) `viralScoring.ts` — hookPatterns expanded to 18 (release/milestone/transformation/achievement hooks added); emotionalTriggers expanded to 62+ (dope, insane, goated, on repeat, chills, no skips, earworm, etc.). (4) `autoPostGenerator.ts` — all four objective headline generators expanded to 10 templates; all body generators expanded to 6 rich variants per objective. (5) `advancedSocialAIService.ts` — SEMANTIC_WORD_WEIGHTS expanded from 20 to 80+ entries; VIRAL_PATTERNS expanded from 6 to 14 patterns (milestone, vulnerability, discovery, industry_truth, process_reveal, replay_bait, community_love, curiosity_gap added); hookTemplates expanded to 10-12 per content type with genre awareness; body generators use 3-variant pools per content type; CTAs expanded to 10-12 per objective; generateVariants upgraded to 5 types (adding milestone/community variant).
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