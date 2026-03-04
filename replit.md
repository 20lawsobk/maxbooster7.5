# Max Booster - AI-Powered Music Career Management Platform

## Overview

Max Booster is an AI-powered, full-stack TypeScript web application designed to empower music artists with comprehensive career management tools. It offers AI-assisted features for social media management, music distribution, analytics, a beat marketplace, career automation, press kit creation, playlist pitching, tour management, merch store integration, sync licensing, publishing rights, A&R submissions, sample clearances, music video production tracking, radio/blog pitching, fan campaigns, revenue intelligence, songwriting, project budget planning, and venue/booking CRM. The platform aims to streamline and optimize various aspects of an artist's career, leveraging AI models fine-tuned specifically for the music industry, with the ambition to become the leading platform for artist career development through intelligent automation and insights.

## User Preferences

I prefer iterative development, with clear communication before significant changes. Please prioritize stability and performance. Do not make changes to folder `ai_model/` or file `server/services/hybridStorageService.ts` unless explicitly instructed. Ensure that all new features integrate seamlessly with the existing hybrid storage system.

## System Architecture

The Max Booster application uses a monorepo structure, separating concerns into `client/` (React, Vite, TypeScript, TailwindCSS, Zustand, TanStack Query), `server/` (Express.js, TypeScript), `shared/` (TypeScript types, Drizzle ORM schema), `boosterstate/` (custom Rust WAL key-value store), and `server/pocket-dimension/` (custom virtual storage engine). The UI/UX emphasizes a clean, responsive design.

**Key Architectural Decisions:**

-   **Hybrid Storage System**: A three-tier approach for data storage: Replit Object Storage (hot tier), Pocket Dimension (cold tier for archival with compression/deduplication), and BoosterState (Rust WAL store for metadata, sessions, and queues).
-   **AI Model Fine-Tuning**: All core AI/ML models are developed in-house and specifically fine-tuned for music artist use cases (e.g., Viral Scoring, Timing Optimization, Algorithm Intelligence) using industry-specific data. No external AI APIs are used.
-   **Microservices-like Structure**: Services are logically separated within the monorepo to manage complexity.
-   **Scalability**: Designed for Replit Autoscale with Redis for shared state across replicas.
-   **Robust Authentication**: Implements session fixation prevention, JWT bearer tokens with refresh capabilities, and session heartbeat.
-   **Comprehensive Workflow Automations**: 21 automation templates across five career phases, managed by `musicWorkflowAutomationService.ts` with CRUD, event dispatching, and cron scheduling.
-   **Advertisement and Autopilot Systems**: Exclusively use custom in-house AI models and connected social profiles, avoiding traditional ad platform integrations. The `CreativeVariantGenerator` Bulk Generate tab is wired to `POST /api/advertising/generate-content` (uses `unifiedAIController`). Advertising autopilot routes (`/start`, `/stop`, `/configure`, `/status`) are fully implemented and return `isRunning`, `config`, and `modelStatus` fields.
-   **Songwriting AI Assist**: `POST /api/songwriting/ai-assist` uses `unifiedAIController.generateContent()` to generate lyric suggestions, rhyme words, and mood-aware chord progressions (no longer static lookups).
-   **Social Content Generation**: `POST /api/social/ai/generate` uses `unifiedAIController.generateContent()` and returns structured `hook`, `body`, `cta`, `hashtags` fields displayed in the `ContentGenerator` component.
-   **Social Autopilot**: `POST /api/autopilot/start|stop|configure` persist config via `storage.saveAutopilotConfig()` and trigger the live `AutopilotEngine` instance via `promotionalToolsService.getAutopilotForUser()`.
-   **Video Generation (FFmpeg)**: `POST /api/social/generate-video` and `POST /api/advertising/generate-video` try the Python AI service first, then fall back to `server/services/videoGeneratorService.ts` — a Node.js FFmpeg renderer that uses `unifiedAIController` for script content (hook/body/CTA) and FFmpeg's `drawtext`/`drawbox` filters to produce real MP4 files saved to `uploads/videos/` (served as static). FFmpeg is available at `/nix/store/.../bin/ffmpeg`. DejaVu fonts at `/usr/share/fonts/truetype/dejavu/`. Python AI model (`ai_model/`, port 9878) requires `torch`/`fastapi`/`uvicorn` which are NOT installed — FFmpeg is the active renderer.
-   **Read Replica Routing**: PostgreSQL read replica is used for analytical and dashboard reads, offloading the primary database.
-   **Silent Deployment System**: A self-evolution engine triggers silent deployments with rolling cluster restarts and auto-rollback on degradation.
-   **Security Hardening**: Includes IDOR prevention, improved session cookie security, AI route rate limiting, Zod-validated input for autopilot preferences (POST/PATCH with allowlisting to prevent mass assignment), authentication consistency, and SSRF protection. Internal IPs are whitelisted from rate limiters and the self-healing security engine to prevent false blocks of internal tools and Replit infrastructure.
-   **Self-Healing Security Engine (Optimized)**: Brute-force threshold raised from 5 to 20 per 5-min window (real-world SaaS standard). DDoS threshold raised from 100 to 500 per 10 seconds. Threat score decay is now adaptive — low-threat events decay 5x faster (2-min half-life) to reduce false positives for legitimate users; high-threat events (0.7+) decay slowly (10-min half-life). Action thresholds raised: block at 0.95 (was 0.9), rate-limit at 0.85 (was 0.7), alert at 0.7 (was 0.5). Session endpoints (refresh-token, /me, heartbeat) with browser User-Agents are skipped entirely from threat analysis. Injection attacks (SQL, command, XXE) still trigger immediate block at any confirmed level.
-   **Rate Limit Optimization**: Login: 50/15min (was 5). 2FA: 15/5min (was 5). Register: 10/hr. AI generation: 500/hr (was 100). Strict auth limiter: 200/15min (was 50). Auth `strict` limiter now exempts session maintenance endpoints. Both `scalableRateLimiter.ts` and `globalRateLimiter.ts` skip session endpoints from their counting windows.
-   **Content Generation Simulation (Real-Life Parameters)**: `POST /api/social/ai/generate` now returns a `simulation` block with: genre auto-detection (hip-hop, r&b, pop, electronic, afrobeats, latin, country, rock, jazz) from topic text; viral score (0-100) based on hashtag count, caption length, emoji use, genre, and platform reach multiplier; predicted engagement metrics (likes, comments, shares, reach, engagement rate) calibrated to 2024 industry benchmarks (Instagram 1.22%, TikTok 5.69%, YouTube 4.1%, LinkedIn 5.4%); platform optimization data (ideal hashtag count, ideal caption length, optimal vs current comparison); scheduling intelligence (best posting time for current day, peak days, algorithm signals, recommended content formats). Minimum 420ms processing time simulates real LLM latency. Accepts `genre`, `artistName`, and `trackTitle` as additional inputs.
-   **Performance Hardening**: Pagination, Redis query caching, composite DB indexes, Neon PostgreSQL, and request correlation IDs are implemented. New production-scale indexes added: `social_accounts(is_active, token_expires_at)` to eliminate the recurring slow query (250-280ms/minute) from the token refresh monitor; `social_accounts(user_id)`, `social_accounts(platform, user_id)`, `autopilot_preferences(user_id)`, `autopilot_preferences(is_active)` for autopilot scheduler performance.
-   **Gamified Onboarding**: The user onboarding wizard is fully gamified with an RPG-style "Choose Your Class" persona selector, an animated XP bar (700 XP total across 4 steps), rank progression system (Newcomer → Rising Artist → Pro Creator → Legend), animated achievement pop-ups on step completion, confetti celebration on finish, and a dark music-themed UI using framer-motion transitions throughout.
-   **Studio DAW UI/UX**: Features a customizable toolbar, resizable panels (Editor, Mixer, Lyrics), platform-adaptive fullscreen mode, and comprehensive audio device management with Web Audio API integration. Mobile-specific UI components (`MobileLyricsPanel`, `MobileAudioDialog`) are implemented for touch-friendly interactions.
-   **CI/CD**: GitHub Actions workflows automate builds for desktop (Linux, Windows, macOS) and mobile (Android, iOS) platforms, supporting both debug and release builds, and GitHub Release creation.

## External Dependencies

-   **Frontend Frameworks**: React 19, Vite 7, TypeScript, TailwindCSS 4, Wouter, Zustand, TanStack Query.
-   **Backend Frameworks**: Express.js, Node.js 22, tsx.
-   **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
-   **Caching/Queuing/Sessions**: Redis.
-   **Object Storage**: Replit Object Storage.
-   **Payment Processing**: Stripe.
-   **Email Delivery**: SendGrid.
-   **Error Tracking**: Sentry.
-   **Push Notifications**: Web Push Protocol.
-   **Music Integrations**: Spotify, LabelGrid.
-   **Social Media OAuth Integrations**: Facebook, Instagram, Twitter/X, TikTok, YouTube, LinkedIn, Google, Threads.
-   **Version Control**: GitHub (for CI/CD).
-   **Search APIs**: Exa, Tavily.