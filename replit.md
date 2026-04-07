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
- Performance hardening features like pagination, Redis query caching, composite DB indexes, Neon PostgreSQL, and request correlation IDs.
- Reliability fixes with background service safeguards and fallbacks.
- Gamified onboarding with RPG-style persona selector, XP system, and achievements.
- Python Audio Analysis Engine using `librosa`, `soundfile`, `scipy`, `scikit-learn`, and `basic-pitch`.
- Offline mode for app-wide context and background sync.
- Autopilot Learning Feedback Loop for recording performance patterns.
- Dedicated admin UI for financial configuration.
- `Chain Error Auto-Fixer` and `Platform Auto Error Fixer & Patcher` for system health and runtime patching.
- Profile Claiming System v2 for artist profile management.
- Per-Artist Storefront Deployment System for dynamic domain management and multi-tenant routing.
- Advanced AI Routing through `unifiedAIController.generateContent()` to MaxCore.
- Seeded, deterministic outcomes for content generation, aesthetic elements, and AI decision-making, including UCB1 Multi-Armed Bandit for topic selection.
- Parallelization of database operations using `Promise.allSettled`.
- Veo Quality Gate for content quality.
- Caffeine Mode for dynamic adjustment of quality gates and learning cycles.
- Local Audio Generation using FFmpeg `aevalsrc` and TTS via `flite` as fallback.
- Audio & Video UX Overhaul with improved loading states and generation progress.
- AI Generation Speed & Power Optimizations including platform constraint validation, parallelized DB queries, `ultrafast` FFmpeg preset, and in-memory content cache.
- MaxCore (`secure-ai-forge.replit.app`) and PDIM (`pocketdimensionstorage.replit.app`) are guaranteed to be always running and reliable. MaxCore is the sole video generation source; local FFmpeg/`videoGeneratorService` fallback is strictly prohibited.

## Three-Tier Video Diffusion Architecture

**Architecture**: Max Booster → Local DiT-24 Relay (port 8008) → MaxCore (`secure-ai-forge.replit.app`)

The DiT-24 relay server (`server/services/diffusion/api_server_v4.py`) is the central video generation router:

- **Untrained state**: transparently relays all `/generate-video` requests to MaxCore
- **Trained state**: runs local DiT-24 inference (UNetV4 LITE, ~17.5M params, 96×96, NumPy CPU-native)
- **Training**: continuously trains from MaxCore's 9TB+ corpus using `train_v4()` in `trainer.py`

### Key Diffusion Components
- `server/services/diffusion/api_server_v4.py` — FastAPI relay server (port 8008); endpoints: `/generate`, `/generate-video`, `/train`, `/health`, `/memory/status`, `/train/simulator/status`
- `server/services/diffusion/trainer.py` — `train_v4()` with AdvancedMemoryLayer + YE replay engine
- `server/services/diffusion/time_simulator.py` — Year-Equivalent Throughput Engine (142M YE-steps/min target, 1 real minute = 1 simulated training year)
- `server/services/diffusion/advanced_memory.py` — AdvancedMemoryLayer (EpisodicStore, PromptIndex, GradientMemory, SessionRegistry)
- `server/services/creativeModelService.ts` — Stage 6 tries DiT-24 relay first, falls back to MaxCore direct

### Year-Equivalent (YE) Engine Constants
- Target: `_YEAR_EQUIV_STEPS_PER_MINUTE = 142,009,200`
- Burst weight: 6 steps/event, Replay weight: 12 steps/frame, Interp weight: 3 steps/pair
- Post-epoch replay: up to 500 cycles × 16-frame batch to close YE deficit

### Training State
- `_model_trained = True` after `weights_v4.npz` loaded or first training epoch completes
- Relay auto-switches from MaxCore passthrough to local inference when trained

## External Dependencies
- **Frontend Frameworks**: React, Vite, TypeScript, TailwindCSS, Wouter, Zustand, TanStack Query.
- **Backend Frameworks**: Express.js, Node.js, tsx.
- **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
- **Storage / Queuing / Cache (unified)**: PDIM — Pocket Dimension (`pocketdimensionstorage.replit.app`).
- **Machine Learning**: `@tensorflow/tfjs-node`.
- **Payment Processing**: Stripe.
- **Email Delivery**: SendGrid.
- **Error Tracking**: Sentry.
- **Push Notifications**: Web Push, Desktop Push, Mobile Push (FCM v1 API / legacy FCM).
- **Music Integrations**: Spotify, LabelGrid.
- **Social Media OAuth Integrations**: Facebook, Instagram, Twitter/X, TikTok, YouTube, LinkedIn, Google, Threads.
- **Version Control**: GitHub.
- **Search APIs**: Exa, Tavily.