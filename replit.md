# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is an AI-powered, full-stack TypeScript web application designed to empower music artists with comprehensive career management tools. It offers AI-assisted features for social media management, music distribution, analytics, a beat marketplace, career automation, press kit creation, playlist pitching, tour management, merch store integration, sync licensing, publishing rights, A&R submissions, sample clearances, music video production tracking, radio/blog pitching, fan campaigns, revenue intelligence, songwriting, project budget planning, and venue/booking CRM. The platform aims to streamline and optimize various aspects of an artist's career, leveraging AI models fine-tuned specifically for the music industry, with the ambition to become the leading platform for artist career development through intelligent automation and insights.

## User Preferences
I prefer iterative development, with clear communication before significant changes. Please prioritize stability and performance. Do not make changes to folder `AI training server/ai_model/` or file `server/services/hybridStorageService.ts` unless explicitly instructed. Ensure that all new features integrate seamlessly with the existing hybrid storage system.

## System Architecture
The Max Booster application uses a monorepo structure, separating concerns into `client/`, `server/`, `shared/`, `boosterstate/`, `server/pocket-dimension/`, and `AI training server/`. The UI/UX emphasizes a clean, responsive design and a Studio DAW-like interface with TopBar, LeftSidebar Browser, MainArea with view tabs (Timeline / Mixer / Node Graph / Flow), and RightSidebar Universal Inspector.

The core of the system is a "Triangle Architecture" data flow: Max Booster pushes all data exclusively to PDIM, MaxCore training server pulls training data from PDIM, and Max Booster pulls trained model weights from MaxCore for inference. PDIM serves as the ONLY unified storage backend, functioning as both a Redis-compatible layer and a persistent object storage system with level-9 Gzip compression and SHA-256 content-addressed deduplication.

Key architectural decisions include:
- All core AI/ML models are in-house, specifically fine-tuned for music artist use cases (e.g., Viral Scoring, Timing Optimization, Algorithm Intelligence) using industry-specific data. MaxCore (`secure-ai-forge.replit.app`) is the sole AI source across all endpoints.
- Microservices-like logical separation within the monorepo for scalability, designed for Replit Autoscale with PDIM (`pocketdimensionstorage.replit.app`) as the shared-state backend.
- Robust authentication with session fixation prevention, JWTs with refresh, and session heartbeat.
- Comprehensive workflow automations managed by `musicWorkflowAutomationService.ts`, and a Unified Content Orchestration System for all content generation.
- Custom in-house AI models exclusively used for Advertisement and Autopilot Systems, integrating an advanced AI Content Stack (v2, v3, v4) for social content and songwriting.
- A Multimodal Content Generation System via `server/services/multimodalGenerationService.ts` orchestrates text, image, audio, and video generation, all calling MaxCore.
- Video Generation Engine: `advancedVideoRendererService.ts` is MaxCore-only.
- Voice Synthesis Engine (`voiceSynthesisService.ts`) offering 14 distinct voice profiles using FFmpeg processing chains.
- Python Audio Analysis Engine using `librosa`, `soundfile`, `scipy`, `scikit-learn`, and `basic-pitch`.
- Beat Audio Separator (`server/services/audioSeparator.py` + `server/services/audioSeparatorService.ts`) for generating MP3s and frequency-band stems from uploaded WAV beats.
- Offline mode for app-wide context and background sync.
- Autopilot Learning Feedback Loop for recording performance patterns.
- Dedicated admin UI for financial configuration.
- `Chain Error Auto-Fixer` and `Platform Auto Error Fixer & Patcher` for system health and runtime patching.
- Profile Claiming System v2 for artist profile management.
- Per-Artist Storefront Deployment System for dynamic domain management and multi-tenant routing, including a `dns-os/` monorepo for a fully self-hosted DNS provider.
- Built-in Authoritative DNS Server (`server/services/dnsServer.ts`) using `dns2` for `maxboostermusic.com` subdomains.
- Built-in DNS Zone Manager (`server/routes/dnsManager.ts`) for users to manage custom domains and DNS records.
- Domain Registrar System (`server/routes/domainRegistrar.ts`, `server/services/domainRegistrarService.ts`): Full domain registrar experience backed by Namecheap reseller API, enabling artists to search, claim, and manage domains with automatic NS configuration.
- Advanced AI Routing through `unifiedAIController.generateContent()` to MaxCore.
- Seeded, deterministic outcomes for content generation, aesthetic elements, and AI decision-making, including UCB1 Multi-Armed Bandit for topic selection.
- Three-Tier Video Diffusion Architecture: Max Booster → MaxCore Rendering Engine relay (port 8000, DiT-24 + DigitalGPU) → MaxCore AI Content Gateway (port 8008, continuous self-training DiT-24 UNetV4 LITE) → MaxCore (`secure-ai-forge.replit.app`).
- Performance hardening features include pagination, composite DB indexes, Neon PostgreSQL, request correlation IDs, server-side in-memory API cache (30s TTL, per-user, per-query, globally wired via `cacheMiddleware` / `invalidateCacheOnMutation`), Brotli compression middleware (`server/middleware/brotliCompression.ts`), browser caching for media, i18n lazy-loading, IndexedDB async query-cache persister, non-blocking Google Fonts loading, DNS resource hints for Stripe/Sentry/Neon, and production static caching.
- Image upload canonical pattern: All image uploads use `uploadImageFile(file, '/api/storage/upload', 'file')` for general images, `POST /api/auth/avatar` (field: `avatar`) for avatars, rendered via `SafeImg` component.
- Beat marketplace cover art: Server endpoints (`POST /api/marketplace/upload`, `PUT /api/marketplace/listings/:id`) accept `artworkUrl` text field (pre-uploaded URL) as alternative to multipart file. Client uploads cover art immediately on file select (upload-on-select), stores server URL in separate state, passes URL at form submission.
- **Contracts DB Persistence**: Generated contracts are persisted in the `generated_contracts` PostgreSQL table (added to schema). `contractTemplateService` loads all contracts from DB on startup and upserts on every mutation (generate, sign, void, send, decline, update). The in-memory `Map` is kept as a fast cache; DB is the durable source. Route handlers for `/generate`, `/my-contracts`, `/my` call `waitForInit()` to ensure the DB is loaded before responding.
- Marketplace storefront custom-domain security audit resolutions for `server/routes/storefrontDomains.ts` involving ownership verification, authentication requirements for DNS status and host enumeration, and proper domain input validation.
- **Professional Artist Audit Fixes (2026-04)**: Comprehensive platform audit fixed: (1) Dashboard `socialReach` growth now computed from real DB analytics (30-60 day comparison); dashboard `recentActivity` now built from real projects/releases/shows sorted by timestamp. (2) Shows `PATCH /api/shows/:id` route added (client sent PATCH, server only had PUT); `status` field added to `createShowSchema`. (3) Fan Hub `/api/fan-hub/message` broadcast now actually sends emails via SendGrid to all subscribers in batches of 50 (fire-and-forget, respects circuit breaker). `emailService.send()` public method added. (4) Analytics dashboard: `streams.weekly` and `streams.monthly` now computed from daily DB data (no longer empty arrays); `streams.byTrack` populated from user releases with proportional stream distribution; `revenue.monthlyRevenue` and `revenue.yearlyRevenue` now from real DB queries. (5) Playlist Pitching `conversionRate` now counts both `accepted` AND `placed` statuses as successful conversions. (6) PressKit "Download Technical Rider" button now functional — downloads rider content as `.txt` file.

## External Dependencies
- **Frontend Frameworks**: React, Vite, TypeScript, TailwindCSS, Wouter, Zustand, TanStack Query.
- **Backend Frameworks**: Express.js, Node.js, tsx.
- **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
- **Storage / Queuing / Cache (unified)**: PDIM — Pocket Dimension (`pocketdimensionstorage.replit.app`).
- **Machine Learning**: `@tensorflow/tfjs`.
- **Payment Processing**: Stripe.
- **Email Delivery**: SendGrid.
- **Error Tracking**: Sentry.
- **Push Notifications**: Web Push, Desktop Push, Mobile Push (FCM v1 API / legacy FCM).
- **Music Integrations**: Spotify, LabelGrid.
- **Social Media OAuth Integrations**: Facebook, Instagram, Twitter/X, TikTok, YouTube, LinkedIn, Google, Threads.
- **Version Control**: GitHub.