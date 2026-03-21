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
-   **Pocket Dimension Storage Bubbles**: All major storage paths route through dedicated PDIM pockets with level-9 Gzip compression and SHA-256 content-addressed deduplication.
-   **Hybrid Storage System**: All storage operations are routed entirely through PDIM as the sole backend, with `HybridStorageService` providing a tiered API.
-   **AI Model Fine-Tuning**: All core AI/ML models are in-house, specifically fine-tuned for music artist use cases (e.g., Viral Scoring, Timing Optimization, Algorithm Intelligence) using industry-specific data. No external AI APIs are used.
-   **Microservices-like Structure**: Services are logically separated within the monorepo.
-   **Scalability**: Designed for Replit Autoscale with PDIM as the shared-state backend.
-   **Robust Authentication**: Implements session fixation prevention, JWTs with refresh, and session heartbeat.
-   **Comprehensive Workflow Automations**: 21 automation templates across five career phases, managed by `musicWorkflowAutomationService.ts`.
-   **Advertisement and Autopilot Systems**: Exclusively use custom in-house AI models and connected social profiles.
-   **AI Content Stack**: Multiple versions (v2, v3, v4) integrate advanced content science principles, generative engines (Markov), and adaptive intelligence (Beam Search, Per-Artist Engagement Feedback Loop) for social content generation and songwriting assistance.
-   **Video Generation Engine**: An in-house text-to-video neural network (UNetV4 + v4 Training Engine) built with NumPy, featuring continuous self-training.
-   **MaxCore DigitalGPU v2**: A domain-native compute engine and hardware accelerator design stack for optimized performance.
-   **Read Replica Routing**: PostgreSQL read replica for analytical and dashboard reads.
-   **Silent Deployment System**: Self-evolution engine for silent deployments with rolling restarts and auto-rollback.
-   **Security Hardening**: Includes IDOR prevention, improved session cookie security, AI route rate limiting, Zod-validated input, authentication consistency, and SSRF protection.
-   **Performance Hardening**: Pagination, Redis query caching, composite DB indexes, Neon PostgreSQL, and request correlation IDs.
-   **Gamified Onboarding**: RPG-style persona selector, XP system, and achievements.
-   **Studio DAW UI/UX**: Customizable toolbar, resizable panels, and Web Audio API integration.
-   **CI/CD**: GitHub Actions workflows for desktop and mobile platforms.
-   **Python Audio Analysis Engine**: Utilizes `librosa`, `soundfile`, `scipy`, `scikit-learn`, and `basic-pitch` for server-side audio intelligence (requires local Python 3.11 setup).
-   **Distribution Analytics**: Aggregates data from LabelGrid and royalty transactions for `streams-revenue` and `analytics/growth`.
-   **Offline Mode**: `OfflineProvider` and `ConnectionStatusBar` for app-wide offline context and background sync.
-   **Autopilot Learning Feedback Loop**: `autopilotLearningService.recordPerformance()` for learning timing/content patterns.
-   **Admin Functionality**: Dedicated admin UI for financial configuration, enhanced admin account privileges (lifetime access, priority in request queue), and improved admin routes for analytics and activity.
-   **Error Handling and Fixing**: `Chain Error Auto-Fixer` and `Platform Auto Error Fixer & Patcher` provide reactive and proactive system health monitoring and runtime patching.
-   **Comprehensive Parsing/Scraping**: Upgraded parsers for Apple iTunes, Deezer, JioSaavn, MusicBrainz, Audiomack, and numerous DSPs, along with an improved distribution webhook handler and ReleaseStatusDashboard.
-   **DSP Profile Hub**: Replaced "Auto Artist Sync" scanning model with a DSP portal ownership/claiming paradigm. The `AutoArtistSync.tsx` component was fully rewritten to show 8 DSP portal rows (Spotify for Artists, Apple Music for Artists, Amazon Music for Artists, YouTube OAC, Deezer for Creators, Tidal, Pandora, SoundCloud) with claimed/unclaimed status, claim action buttons, and 4 collapsible informational sections. Backend: `artistProfileService.ts` `profileHub()` method + `GET /api/artist-profiles/:id/profile-hub` route. ArtistProfileManager create dialog updated to "Create Profile" button and DSP Hub guidance text.

## External Dependencies
-   **Frontend Frameworks**: React, Vite, TypeScript, TailwindCSS, Wouter, Zustand, TanStack Query.
-   **Backend Frameworks**: Express.js, Node.js, tsx.
-   **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
-   **Storage / Queuing / Cache (unified)**: PDIM — Pocket Dimension (`pocketdimensionstorage.replit.app`).
-   **Machine Learning**: `@tensorflow/tfjs-node`.
-   **Payment Processing**: Stripe.
-   **Email Delivery**: SendGrid.
-   **Error Tracking**: Sentry.
-   **Push Notifications**: Web Push Protocol.
-   **Music Integrations**: Spotify, LabelGrid.
-   **Social Media OAuth Integrations**: Facebook, Instagram, Twitter/X, TikTok, YouTube, LinkedIn, Google, Threads.
-   **Version Control**: GitHub.
-   **Search APIs**: Exa, Tavily.

## Comprehensive Audit Fixes (March 2026)
A three-agent audit identified and resolved the following issues:

### Backend Bug Fixes
- **`server/index.ts`**: Removed duplicate `express.urlencoded({ extended: false })` call that was overriding the `{ extended: true, limit: '200mb' }` setting, breaking large form uploads.
- **`server/middleware/auth.ts`**: Extracted shared JWT bearer-token resolution into private `resolveJwtUser()` helper — eliminates duplicated verification logic between `requireAuth` and `requireAuthOnly`.
- **`server/routes/distribution.ts`**: Fixed three `file.filename` usages that returned `undefined` with `multer.memoryStorage()`. Track audio and HyperFollow header images are now properly uploaded to Pocket Dimension via `storageService.uploadFile()` before storing the URL.
- **`server/services/stripeService.ts`**: Replaced two `storage.getAllUsers()` calls (loads entire user table into memory) with direct indexed DB queries on `users.stripeCustomerId` — O(N) → O(1) lookup using the existing `users_stripe_customer_id_idx` index.
- **`server/routes/auth.ts`**: Fixed `trusted: false` hardcode in session list — now reads the actual `trusted` column value from the DB.
- **`server/routes/artistProfiles.ts`**: Added guard to check `spotifyArtistUri.startsWith('spotify:artist:')` before string replacement to avoid stripping valid bare IDs.

### Frontend Fixes
- **`client/src/App.tsx`**: Wrapped the main router in `<ErrorBoundary>` so any unhandled render crash shows the custom error UI instead of a blank white screen.
- **`client/src/pages/Distribution.tsx`**: Added `isLoading: statsLoading` to the playlist pitching stats query and render `'—'` placeholders during load instead of misleading zeroes.
- **`client/src/components/studio/UltimateDAW.tsx`**: Added `.catch()` handlers to both `forceSave()` call sites (Ctrl+S shortcut and Save button) so users are notified when a project save fails instead of silently discarding the error.