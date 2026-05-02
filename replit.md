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
- Video Generation Engine, Voice Synthesis Engine, and Python Audio Analysis Engine for media processing.
- Beat Audio Separator for generating MP3s and frequency-band stems from uploaded WAV beats.
- Offline mode for app-wide context and background sync.
- Autopilot Learning Feedback Loop for recording performance patterns.
- Dedicated admin UI for financial configuration.
- `Chain Error Auto-Fixer` and `Platform Auto Error Fixer & Patcher` for system health and runtime patching.
- Profile Claiming System v2 for artist profile management.
- Per-Artist Storefront Deployment System for dynamic domain management and multi-tenant routing, including a `dns-os/` monorepo for a fully self-hosted DNS provider.
- Full DIY DNS Infrastructure including a standalone nameserver package (`dns-node/`), DNSSEC, GeoDNS + EDNS Client Subnet, multi-region nameservers, BGP Anycast, and an EPP Registrar Client.
- Built-in Authoritative DNS Server and DNS Zone Manager for user-managed custom domains and records.
- Domain Registrar System where Max Booster acts as the registrar, handling native domain registration, DNS zone creation, and delegation.
- Multi-Provider DNS Adapter supporting various commercial DNS providers (GoDaddy, Cloudflare, Namecheap, AWS Route 53, DigitalOcean, Porkbun).
- Domain Lifecycle Service for domain verification (NS delegation, CNAME, A record, TXT token) and auto-provisioning of CAA records.
- Domain Verification Worker for background polling of custom domains and health sweeps.
- DNS Propagation Check API for real-time propagation status from public DoH resolvers.
- Advanced AI Routing through `unifiedAIController.generateContent()` to MaxCore.
- Seeded, deterministic outcomes for content generation, aesthetic elements, and AI decision-making, including UCB1 Multi-Armed Bandit for topic selection.
- Three-Tier Video Diffusion Architecture: Max Booster → MaxCore Rendering Engine relay → MaxCore AI Content Gateway → MaxCore.
- Performance hardening features include pagination, composite DB indexes, Neon PostgreSQL, request correlation IDs, server-side in-memory API cache, Brotli compression, browser caching, i18n lazy-loading, IndexedDB async query-cache persister, non-blocking Google Fonts, and DNS resource hints.
- Canonical image upload patterns and specific handling for beat marketplace cover art.
- Generated contracts are persisted in the `generated_contracts` PostgreSQL table.
- Marketplace storefront custom-domain security audit resolutions for ownership verification and authentication.
- Storage quota system based on `user_storage_files` table, `mime_type`, and `subscription_tier`.
- Advertising autopilot performance endpoint computes ROI estimates.

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

## Gen Engine v2 — MaxCore Diffusion Stack (v3.0.0)

Production AI generation pipeline at `server/services/diffusion/gen_engine_v2/`.

### Modules
| File | Purpose |
|---|---|
| `ops.py` | GPU-aware primitives: `matmul_fwd`, `conv2d_fwd`, `softmax_fwd`, `silu_fwd`, `gn_fwd` — dispatches to `digitalgpu` singleton (CUDA/MPS) or falls back to NumPy |
| `unet_v5.py` | `UNetV5` — ~22.7M-param 4-level U-Net with v-prediction, cross-attention, temporal self-attention, skip-first decoder order. LITE config: 32×32×8 latent, channels [64,128,256,256] |
| `scheduler_v2.py` | `SchedulerV2` + `DPMSolver2M` + `KarrasSampler` — v-prediction, Karras sigmas, DPM-Solver-2M |
| `audio_synth_v2.py` | `AudioSynthV2` — Production music engine: Mode A (fast DSP, 20 genres, bandlimited oscillators, physically-modelled drums, chord pads, mastering chain, stereo 44.1kHz, ~500ms/3s), Mode B (HD + plate reverb + Haas), Mode C (MaxCore AI — always primary; submits async job, polls `/api/audio-job/:id`, parses key+BPM metadata; if audio file downloads → `backend=maxcore`; otherwise → MaxCore-guided DSP with key-correct chord progression → `backend=maxcore_guided`), Mode ABC/ALL/COMBINED/MAX (concurrent DSP+MaxCore, blended 55/45, re-mastered → `backend=dsp_ab+maxcore`). Key parser: 12 note names + major/minor → MIDI chord progressions. PyAV for MP3 decode. |
| `trainer_v5.py` | `TrainerV5` — joint VAE+UNet training via NumPy Adam |
| `ltx_adapter.py` | `LTXAdapter` — 3-tier backend cascade: MaxCore (trained 8TB model, primary) → LTX-2.3 (GPU) → UNetV5 (CPU fallback). Reads `AI_SERVER_URL`+`AI_SERVER_KEY`. |
| `api_server_v5.py` | Drop-in HTTP server for v4; adds `/generate/audio`, `/generate/video_hd`, `/generate/multimodal`. Video passes `genre` + MaxCore-specific fields to LTXAdapter. |
| `latent_encoder.py` | `VAELite` — 8-ch latent VAE with corrected `forward_train` (8-ch concat: `[z_sample | logvar]`) |
| `text_encoder_v3.py` | `TextEncoderV3` — transformer text encoder with fixed FFN backward |

### DAW Timeline Clip Width Fix (April 2026)
- **Root cause**: `AIAudioGenerator.generateFromText` was using the text-parsed tempo (e.g., 140 BPM for trap genre) instead of the client's transport tempo. This caused generated clips to have the wrong duration relative to the DAW's bar grid (e.g., 8 bars at 140 BPM = ~13.7s, which on a 120 BPM timeline reads as ~6.8 bars instead of 8).
- **Fixes applied**:
  1. `shared/ml/audio/AIAudioGenerator.ts`: Added `tempo?: number` to `TextGenerationInput`; `generateFromText` now uses `input.tempo || parsed.params.tempo` so the client's tempo takes precedence.
  2. `server/services/aiAudioGeneratorService.ts`: Added `tempo` to `TextToAudioRequest`; passes it through to `generateFromText`.
  3. `server/routes/studioGeneration.ts`: Passes `validatedData.tempo` to `generateFromText` (was missing before).
  4. `client/src/components/studio/AIMusicGenerator.tsx`: Added `initialTempo` prop so both DAWs can initialize the generator with the current transport tempo.
  5. `client/src/components/studio/UltimateDAW.tsx` and `StudioOneDAW.tsx`: Pass `transport.tempo` as `initialTempo` to `AIMusicGenerator`.
  6. `client/src/hooks/useProjectSync.ts`: Expanded clip duration auto-detect to also run for clips with `duration < 2` seconds (not just `<= 0`), correcting wrong values stored from previous tempo mismatches.
  7. `client/src/components/studio/StudioOneDAW.tsx`: Fixed `onTrackGenerated` handler to actually add generated clips to the timeline (previously only showed a toast).

## Scale Hardening — 90M User Readiness (May 2026)

All gaps identified and resolved in this session:

### Database Indexes (Migration 0016)
- Added 38 indexes across 14 previously under-indexed tables (each had only PK):
  - `tracks` → (project_id), (project_id, created_at)
  - `social_accounts` → (user_id), (platform, user_id), (user_id, is_active)
  - `social_metrics` → (campaign_id), (campaign_id, metric_at), (variant_id)
  - `audit_logs` → (user_id), (user_id, created_at), (action), (created_at)
  - `earnings` → (user_id), (user_id, created_at), (user_id, platform), (release_id)
  - `lyrics` → (project_id unique)
  - `assets` → (project_id), (owner_id), (owner_id, created_at), (kind)
  - `clips` → (track_id), (asset_id)
  - `collaborators` → (user_id), (release_id), (track_id), (email)
  - `distro_releases` → (artist_id), (artist_id, created_at), (release_date)
  - `distro_tracks` → (release_id), (release_id, track_number)
  - `royalty_splits` → (listing_id), (recipient_id)
  - `webhook_events` → (processed, created_at), (event_type), (provider)
  - `notifications` → compound (user_id, read, created_at) covering index

### WebSocket Connection Limits
- `/ws` notification server: global cap 50k, per-user cap 5 connections
- `/ws/studio` collab server: global cap 10k, per-user cap 10 connections
- Per-user count tracked in `userConnectionCount` Map with proper connect/disconnect accounting
- Over-limit upgrades rejected with 429/503 + Retry-After before incurring auth cost

### Rate Limiter Production Bypass Fix
- All 10 individual rate limiters previously checked only `NODE_ENV !== 'production'`
- Added `isProductionEnv()` helper: `NODE_ENV === 'production' || !!REPLIT_DEPLOYMENT`
- Ensures rate limiting always fires on Replit Autoscale even if NODE_ENV is misconfigured

### Admin Export Pagination Cap
- `/api/admin/users/export` reduced from 5,000 rows/page to 500

### Security.txt (Responsible Disclosure)
- `/.well-known/security.txt` route added (industry-standard for large platforms)
- Static file also written to `client/public/.well-known/security.txt`

### Architecture Notes
- `digitalgpu` singleton: `server/services/digitalgpu.py` — GPU forward, NumPy backward always.
- Decoder order: concat skip (same resolution) → ResBlocks + attention → upsample (standard U-Net).
- Upsampler chain: `dec3_up(chs[3]→chs[3])`, `dec2_up(chs[2]→chs[1])`, `dec1_up(chs[1]→chs[0])`.
- MaxCore Diffusion Gateway workflow runs `api_server_v5.py` on port 8008 (LITE mode).
- Audio Mode A: fully vectorized harmonic summation (NumPy outer-product, no Python loops). 20 genre profiles, 12 mood modifiers, 16-step drum sequencer, chord progressions, sub-bass, ADSR envelopes, soft-knee limiter.
- Video backend priority: MaxCore (`/api/generate-video`) → LTX-2.3 → UNetV5. MaxCore returns async `video_url`; the TypeScript `advancedVideoRendererService` handles polling/proxy.