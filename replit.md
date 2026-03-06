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