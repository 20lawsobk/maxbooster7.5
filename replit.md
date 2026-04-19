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
- Contracts DB Persistence: Generated contracts are persisted in the `generated_contracts` PostgreSQL table. `contractTemplateService` loads all contracts from DB on startup and upserts on every mutation.
- Marketplace storefront custom-domain security audit resolutions involving ownership verification, authentication requirements for DNS status and host enumeration, and proper domain input validation.
- Storage quota system queries real `user_storage_files` table, sums `size_bytes` per user, grouped by `mime_type`, and enforces limits based on `subscription_tier` (free=5GB, pro=50GB, studio=200GB, enterprise=1TB).
- Advertising autopilot performance endpoint computes ROI estimates from real data based on active campaign count and industry averages, labeled as estimates.

## Production Readiness Audit History

| Round | Commit | Key Deliverables |
|-------|--------|-----------------|
| R2 | 887ca6fa | JWT hardening, CSRF, refund tx, backup OOM guard, audit_logs DB, pino redact, bcrypt-12, ESLint v9, Dependabot, web-vitals |
| R3 | 0645720b | 399 ESLint errors → 0; 26 real bugs fixed; `/ready` probe via `runAllProbes()`; react-hooks plugin |
| R4 | 62c0064a | FK constraints (7 tables), `server/config/env.ts` (Zod), 45/45 unit tests, bcrypt cost 10→12 in `init-admin.ts`, CI test gate |
| R5 audit | d665f5b5 | Comprehensive 20-dimension audit: deps, auth, secrets, DB, health, CSP, Electron, FastAPI, bundle, observability, CI, 2FA, backup, rate limits — baseline captured, no fixes applied |
| R6 | 32c867c1 | 133 FK indexes applied live, CSP unsafe-eval removed, HSTS enabled, login rate limit 50→10, OAuth state secret prod guard, Electron sandbox: true, FastAPI CORS wildcard replaced, DNS LIMIT 500 |

**GitHub remote**: `https://github.com/20lawsobk/maxbooster7.5.git`  
**Branch**: `main`  
**Latest commit**: `32c867c1` (R6)

### R6 Details (current)
- **FK indexes** (`server/migrations/r6_fk_indexes.sql`): 133 `CREATE INDEX IF NOT EXISTS` statements applied live for all `user_id`, `storefront_id`, `volume_id`, `pocket_id` FK columns across 124 tables — eliminates seq-scans on every per-user query
- **CSP**: removed `'unsafe-eval'` from `scriptSrc` in `server/safety/mandatoryMiddleware.ts`; Stripe.js does not require it
- **HSTS**: added `hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }` to helmet config
- **Login rate limit**: `server/middleware/rateLimiter.ts` auth.login.max 50→10 per 15-min window
- **OAuth state HMAC**: `server/routes/socialOAuth.ts` throws at startup in production if neither `SESSION_SECRET` nor `SECRET_KEY` is set
- **Electron sandbox**: `electron/main.js` `sandbox: false` → `true`; preload only uses `contextBridge` + `process.platform/versions`, both available in sandboxed context
- **FastAPI CORS**: `server/services/diffusion/api_server_v4.py` `allow_origins=['*']` replaced with env-driven list via `DIFFUSION_ALLOWED_ORIGINS` or fallback to `APP_URL`/`DOMAIN`; methods restricted to GET/POST
- **DNS query guard**: `server/routes/dnsManager.ts` unbounded `SELECT * FROM dns_zone_records` given `LIMIT 500`

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