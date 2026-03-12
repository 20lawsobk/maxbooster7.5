# Max Booster - AI-Powered Music Career Management Platform

## Overview

Max Booster is an AI-powered, full-stack TypeScript web application designed to empower music artists with comprehensive career management tools. It offers AI-assisted features for social media management, music distribution, analytics, a beat marketplace, career automation, press kit creation, playlist pitching, tour management, merch store integration, sync licensing, publishing rights, A&R submissions, sample clearances, music video production tracking, radio/blog pitching, fan campaigns, revenue intelligence, songwriting, project budget planning, and venue/booking CRM. The platform aims to streamline and optimize various aspects of an artist's career, leveraging AI models fine-tuned specifically for the music industry, with the ambition to become the leading platform for artist career development through intelligent automation and insights.

## User Preferences

I prefer iterative development, with clear communication before significant changes. Please prioritize stability and performance. Do not make changes to folder `AI training server/ai_model/` or file `server/services/hybridStorageService.ts` unless explicitly instructed. Ensure that all new features integrate seamlessly with the existing hybrid storage system.

## System Architecture

The Max Booster application uses a monorepo structure, separating concerns into `client/`, `server/`, `shared/`, `boosterstate/`, `server/pocket-dimension/`, and `AI training server/`. The UI/UX emphasizes a clean, responsive design.

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
-   **Media-to-Content Analysis**: Analyzes URLs, audio files, and images to extract metadata and generate social media content using Python-based services.
-   **Video Generation Engine v3 — In-House Diffusion Model v4**: A text-to-video neural network built from scratch using pure NumPy, continuously self-improving. Features a 3.0M-parameter 4-level U-Net architecture with attention mechanisms and FiLM conditioning. Training data includes 602 prompts across 20 scene categories. Background self-training runs continuously.
-   **Veo-for-Music Full Training Pipeline**: Five-module training infrastructure for video generation, including `MaxBoosterSample` dataclass for unified data, `DatasetRegistry` for cataloging datasets, a progressive 30-day training curriculum, teacher-student knowledge distillation, and live milestone tracking.
-   **UNetV4 + v4 Training Engine**: Next-generation 463M-parameter text-to-video diffusion model architecture with a 5-level U-Net, depthwise-separable convolutions, and 32-head spatial + temporal attention. Includes a robust training loop with progressive phases and advanced loss functions.
-   **MaxCore DigitalGPU v2**: A domain-native compute engine and hardware accelerator design stack with LocalCPUBackend (NumPy+OpenBLAS), LocalGPUBackend (Numba JIT), GraphOptimizer with AutoTuner for performance, and MaxCoreTile + RTLGenerator for hardware simulation and SystemVerilog output.
-   **Read Replica Routing**: PostgreSQL read replica is used for analytical and dashboard reads.
-   **Silent Deployment System**: Self-evolution engine for silent deployments with rolling restarts and auto-rollback.
-   **Security Hardening**: Includes IDOR prevention, improved session cookie security, AI route rate limiting, Zod-validated input, authentication consistency, and SSRF protection.
-   **Content Generation Simulation**: `POST /api/social/ai/generate` now returns a `simulation` block with genre auto-detection, viral score, predicted engagement metrics, platform optimization data, and scheduling intelligence.
-   **AI Content Stack v2 (Max Quality Upgrade)**: Upgraded five in-house JS AI content generation services for maximum output quality, expanding hook options, CTAs, content quality strategies, viral scoring, and auto-post generation.
-   **AI Content Stack v4 (Generative + Adaptive Intelligence Upgrade)**: Activates Markov Generative Engine for novel sentence generation, Beam Search Candidate Selection for quality-biased content, and Per-Artist Engagement Feedback Loop for personalized pattern weighting.
-   **AI Content Stack v3 (Advanced Content Science Upgrade)**: Integrates research-based content science principles, including `CONTENT_FORMULA_LIBRARY`, `PSYCHOLOGICAL_TRIGGER_LAYERS`, `RELEASE_PHASE_MULTIPLIERS`, `PLATFORM_NATIVE_DNA`, `SELF_IDENTIFICATION_PHRASES`, and `EMOTIONAL_ARC_TEMPLATES` for more effective content.
-   **Performance Hardening**: Pagination, Redis query caching, composite DB indexes, Neon PostgreSQL, and request correlation IDs are implemented.
-   **Gamified Onboarding**: RPG-style "Choose Your Class" persona selector, animated XP bar, rank progression, and achievement pop-ups.
-   **Studio DAW UI/UX**: Customizable toolbar, resizable panels, platform-adaptive fullscreen mode, and Web Audio API integration.
-   **CI/CD**: GitHub Actions workflows automate builds for desktop (Linux, Windows, macOS) and mobile (Android, iOS) platforms.
-   **Python Audio Analysis Engine**: Utilizes `librosa`, `soundfile`, `scipy`, `scikit-learn`, and `basic-pitch` for server-side audio intelligence.
-   **Distribution Analytics**: Enhanced routes for `streams-revenue` and `analytics/growth` aggregate data from LabelGrid and `royaltyTransactions` table.
-   **Redis Stability**: Implemented `unhandledRejection` handlers to treat Redis timeouts and connection issues as non-fatal.
-   **Offline Mode**: `OfflineProvider` and `ConnectionStatusBar` enable app-wide offline context and background sync queue.
-   **Autopilot Learning Feedback Loop**: `autopilotLearningService.recordPerformance()` is called after successful auto-posts to learn timing/content patterns.
-   **Financial Config Admin UI**: Admin panel for editing DSP royalty rates, tax treaty withholding rates, and label settings.

## External Dependencies

-   **Frontend Frameworks**: React, Vite, TypeScript, TailwindCSS, Wouter, Zustand, TanStack Query.
-   **Backend Frameworks**: Express.js, Node.js, tsx.
-   **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
-   **Caching/Queuing/Sessions**: Redis.
-   **Object Storage**: Replit Object Storage, Pocket Dimension.
-   **Machine Learning**: `@tensorflow/tfjs-node`.
-   **Payment Processing**: Stripe.
-   **Email Delivery**: SendGrid.
-   **Error Tracking**: Sentry.
-   **Push Notifications**: Web Push Protocol.
-   **Music Integrations**: Spotify, LabelGrid.
-   **Social Media OAuth Integrations**: Facebook, Instagram, Twitter/X, TikTok, YouTube, LinkedIn, Google, Threads.
-   **Version Control**: GitHub.
-   **Search APIs**: Exa, Tavily.