# Max Booster - AI-Powered Music Career Management Platform

## Overview

Max Booster is an AI-powered, full-stack TypeScript web application designed to empower music artists with comprehensive career management tools. It offers AI-assisted features for social media management, music distribution, analytics, a beat marketplace, career automation, press kit creation, playlist pitching, tour management, merch store integration, sync licensing, publishing rights, A&R submissions, sample clearances, music video production tracking, radio/blog pitching, fan campaigns, revenue intelligence, songwriting, project budget planning, and venue/booking CRM. The platform aims to streamline and optimize various aspects of an artist's career, leveraging AI models fine-tuned specifically for the music industry, with the ambition to become the leading platform for artist career development through intelligent automation and insights.

## User Preferences

I prefer iterative development, with clear communication before significant changes. Please prioritize stability and performance. Do not make changes to folder `AI training server/ai_model/` or file `server/services/hybridStorageService.ts` unless explicitly instructed. Ensure that all new features integrate seamlessly with the existing hybrid storage system.

**Agent reminder:** At the end of every task, record the full play-by-play (what was built, files changed, test baseline) in `.local/agent-notes.md`, and add only durable lessons/conventions to the concise "Recent Hardening — Lessons & Conventions" section below. Keep this file an overview + pointers, not a changelog — full detail lives in `.local/agent-notes.md`, git history, and `.agents/memory/`.

## System Architecture

The Max Booster application uses a monorepo structure, separating concerns into `client/`, `server/`, `shared/`, `boosterstate/`, `server/pocket-dimension/`, and `AI training server/`. The UI/UX emphasizes a clean, responsive design and a Studio DAW-like interface with TopBar, LeftSidebar Browser, MainArea with view tabs (Timeline / Mixer / Node Graph / Flow), and RightSidebar Universal Inspector.

The core of the system is a "Triangle Architecture" data flow: Max Booster pushes all data exclusively to PDIM, MaxCore training server pulls training data from PDIM, and Max Booster pulls trained model weights from MaxCore for inference. PDIM serves as the ONLY unified storage backend, functioning as both a Redis-compatible layer and a persistent object storage system with level-9 Gzip compression and SHA-256 content-addressed deduplication.

Key architectural decisions include:

- All core AI/ML models are in-house, specifically fine-tuned for music artist use cases (e.g., Viral Scoring, Timing Optimization, Algorithm Intelligence) using industry-specific data. MaxCore (`secure-ai-forge.replit.app`) is the sole AI source across all endpoints.
- Microservices-like logical separation within the monorepo for scalability, designed for Replit Autoscale with PDIM (`pocketdimensionstorage.replit.app`) as the shared-state backend.
- Robust authentication with session fixation prevention, JWTs with refresh, and session heartbeat.
- Comprehensive workflow automations managed by `musicWorkflowAutomationService.ts`, and a Unified Content Orchestration System for all content generation.
- Custom in-house AI models exclusively used for Advertisement and Autopilot Systems, integrating an advanced AI Content Stack (v2, v3, v4) for social content and songwriting.
- A Multimodal Content Generation System via `server/services/multimodalGenerationService.ts` orchestrates text, image, audio, and video generation, all calling MaxCore. This includes a Video Generation Engine, Voice Synthesis Engine, and Python Audio Analysis Engine for media processing, along with a Beat Audio Separator for generating MP3s and frequency-band stems from uploaded WAV beats.
- Offline mode for app-wide context and background sync.
- Autopilot Learning Feedback Loop for recording performance patterns.
- Dedicated admin UI for financial configuration.
- `Chain Error Auto-Fixer` and `Platform Auto Error Fixer & Patcher` for system health and runtime patching.
- Profile Claiming System v2 for artist profile management.
- Per-Artist Storefront Deployment System for dynamic domain management and multi-tenant routing, including a full DIY DNS Infrastructure (`dns-os/`, `dns-node/`) with DNSSEC, GeoDNS, BGP Anycast, EPP Registrar Client, and an Authoritative DNS Server. This also features a Domain Registrar System and a Multi-Provider DNS Adapter supporting various commercial DNS providers.
- Advanced AI Routing through `unifiedAIController.generateContent()` to MaxCore, using seeded, deterministic outcomes for content generation, aesthetic elements, and AI decision-making (including UCB1 Multi-Armed Bandit for topic selection).
- Three-Tier Video Diffusion Architecture: Max Booster → MaxCore Rendering Engine relay → MaxCore AI Content Gateway → MaxCore.
- Performance hardening features include pagination, composite DB indexes, Neon PostgreSQL, request correlation IDs, server-side in-memory API cache, Brotli compression, browser caching, i18n lazy-loading, IndexedDB async query-cache persister, non-blocking Google Fonts, and DNS resource hints.
- Canonical image upload patterns and specific handling for beat marketplace cover art.
- Generated contracts are persisted in the `generated_contracts` PostgreSQL table.
- Storage quota system based on `user_storage_files` table, `mime_type`, and `subscription_tier`.
- Advertising autopilot performance endpoint computes ROI estimates.
- AI generation pipeline (`server/services/diffusion/gen_engine_v2/`) includes GPU-aware primitives (`ops.py`), `UNetV5` for image generation, `SchedulerV2` with `DPMSolver2M` and `KarrasSampler`, `AudioSynthV2` for music engine (DSP and MaxCore AI modes), `TrainerV5`, `LTXAdapter` for a 3-tier backend cascade, and `api_server_v5.py`.

## External Dependencies

- **Frontend Frameworks**: React, Vite, TypeScript, TailwindCSS, Wouter, Zustand, TanStack Query.
- **Backend Frameworks**: Express.js, Node.js, tsx.
- **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
- **Storage / Queuing / Cache (unified)**: PDIM — Pocket Dimension (`pocketdimensionstorage.replit.app`).
- **Machine Learning**: `@tensorflow/tfjs`.
- **Payment Processing**: Stripe.
- **Email Delivery**: Resend (`RESEND_API_KEY`), verified sender domain `max-booster.com`, from `noreply@max-booster.com`. SendGrid deprecated (permanently quota-locked). Note: Resend is email-only — it does NOT send SMS.
- **SMS Delivery**: Twilio with a provisioned phone number. Configured secrets (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_PHONE_NUMBER`) put phone verification on the Twilio **Verify** path; `/sms/confirm` validates the user's code via Twilio `verificationChecks` (never a locally stored code).
- **Error Tracking**: Sentry.
- **Push Notifications**: Web Push, Desktop Push, Mobile Push (FCM v1 API / legacy FCM).
- **Music Integrations**: Spotify, LabelGrid.
- **Social Media OAuth Integrations**: Facebook, Instagram, Twitter/X, TikTok, YouTube, LinkedIn, Google, Threads.

## Recent Hardening — Lessons & Conventions

Durable lessons and conventions only. Full per-task play-by-play is in `.local/agent-notes.md` and git history; cross-session pointers are in `.agents/memory/`.

### Autonomy honesty (Self-Evolution & Beat Money Loop)

- **Honest "applied/completed" rule:** an autonomous status of applied/completed must gate on a real side-effect a live consumer actually reads — never on category membership or merely reaching the end of a function. The Self-Evolution Engine previously wrote dead `.ts` files nothing imported and reported `completed`; Beat Money Loop reported `completed` with `campaignId=NONE`. Both replaced with real, reversible behavior.
- **Self-Evolution applied-registry:** `server/services/evolutionRegistry.ts` is a bounded, reversible registry that live subsystems read. `apply()` returns `applied=true` ONLY when the category is consumed AND the sanitized payload carries a field in `EFFECTIVE_FIELDS` (a field a consumer reads today). Rollback = `deactivateAll()` (in-process, no restart). Adding a field to `EFFECTIVE_FIELDS` is only honest once a live consumer genuinely reshapes output from it.
- **Knobs wired end-to-end:** posting-time (`optimalHours`), content (`variantCount`/`visualPriority`), hashtag/caption/CTA, and posting-format/engagement-targeting all affect real output. Wire guidance once at the shared `advancedSocialAIService.generateAdvancedContent` chokepoint so autopilot AND content-quality/scheduled posts are covered; it stays idempotent for autopilot (which already passes explicit values). A deterministic post-process guard backs every MaxCore hint so a knob can never silently no-op.
- **Two generation chokepoints, not one:** the artist-facing manual "generate a post" flows route through `unifiedAIController.generateContent`, NOT `generateAdvancedContent` — so guidance must be wired in BOTH. posting-format/engagement is mirrored there via a private `applyPostingOptimization(platform, callerContentType)` (objective→engagement on `engagementTargeting==='high'`; `contentFormatPriority`→contentType only when caller unpinned; lookup keyed by the raw artist-facing platform, not the threads→instagram alias). Caveat: that controller historically DROPPED `contentType` entirely (never forwarded to MaxCore), so wiring a knob there required also forwarding the effective `content_type`/`objective` into the infer payload — biasing in-memory alone would silently no-op.
- **Campaign activation:** create ad campaigns as `draft` — `activateCampaign` rejects already-active campaigns and flips draft→active itself on a successful post.
- **Admin Autonomy UI:** show honest applied-vs-advisory counts and which knobs are live; derive "what's live" from the registry's active entries so the view tracks rollbacks for free (never cache a separate copy that can drift).
- **Regression discipline:** a "consumed category" guarantee is not proven until a test drives the REAL consumer and asserts the effective field reaches the downstream call — registry-level `apply()=true` is necessary but not sufficient.

### Data, routing & auth

- **App DB = `NEON_DATABASE_URL`, NOT Replit's managed `DATABASE_URL`.** The runtime pool resolves `NEON_DATABASE_URL || DATABASE_URL`; `NEON_DATABASE_URL` is a shared (dev+prod) self-managed Neon DB. `executeSql`/Publish/managed-DB diff operate on a DIFFERENT database. ALL schema/data work and "is it in prod?" checks MUST target `NEON_DATABASE_URL`.
- **Storefront routing:** every active storefront domain MUST upsert `storefront_hosts` (the multi-tenant router reads only that table) — `storefront_domains` is bookkeeping only. A "live" domain that skips the host row 404s.
- **Admin route gating:** routes aren't role-gated in `App.tsx`; every `/admin*` page must self-gate with `useRequireAdmin` (not `useRequireAuth`). Sidebar `adminOnly` only hides links.
- **SMS verification:** Twilio Verify owns its code — confirm via `verificationChecks`, never a locally stored code; return dev `devCode` only when no SMS was sent AND `NODE_ENV !== 'production'`.

### Autopilot & AI

- **UCB1 bandit:** seed arms from a static default set unioned with history and force-explore untried arms, or it locks to one arm and never converges.
- **Publish-context recovery:** capture context after the queue `shift()`, store it durably, and do NOT delete on consume (analysis jobs retry) — bound by cap-eviction instead. Timing insights must use the real posted hour, not analysis-time.
- **MaxCore reachability:** only suppress endpoints on 404/405 (absent); 5xx/3xx return null without suppressing, so transient training-load 503s don't log false "unreachable".
- **MaxCore-only routing:** content/variant/advertising generation use MaxCore exclusively; the Python sidecar is retained only for audio analysis, MIDI transcription, and cinematic video templates.

### Infrastructure & environment

- **typecheck OOM/starvation:** a monolithic `tsc --noEmit` consumes ~4GB and OOMs, starving tsx and crashing the app at boot. Gate is now split into `tsconfig.server.json` + `tsconfig.client.json` (each ~3.46GB standalone) with build-info in `.cache/` (NOT `node_modules`, which `npm install` wipes). Run the `typecheck` workflow **standalone** (`npm run check`) — never alongside the running app (memory is additive → OOM). `tsgo` (`@typescript/native-preview`, TS7) is installed as opt-in `check:fast` but its full check OOMs on this repo, so tsc-split stays the gate; revisit as TS7 matures. `baseUrl`/`downlevelIteration` removed from `tsconfig.json` (TS7-incompatible; safe — see `.agents/memory/typecheck-oom.md`).
- **PDIM tuning** (see `.agents/memory/` for detail): gap floor = `clusterWorkers × 4ms`; direct calls use N round-robin parallel lanes with global AIMD state; passive geometric decay gated only on 429-recency (not queue depth); a dedicated script chain keeps Lua Workers off the direct-call queue; the distributed rate-limiter coalesces with an L1 cache (it was the dominant direct caller). PermanentFixer caps restored gap at 400ms so the startup queue drains fast.
- **OAuth log redaction:** scrub `access_token`/`refresh_token`/`id_token` (and `client_secret` in URLs) before logging in `socialOAuth.ts`.
- **Plugin catalog:** seed via `storage.seedPluginCatalog()` (the path wired from `init-admin`); built-in parameter/preset enrichment is additive and gates on a `_rev` marker (bump `MANIFEST_REV` to force re-upsert). Drizzle silently drops writes to non-existent columns.
- **Version control:** GitHub.
