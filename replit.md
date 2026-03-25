# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is an AI-powered, full-stack TypeScript web application designed to empower music artists with comprehensive career management tools. It offers AI-assisted features for social media management, music distribution, analytics, a beat marketplace, career automation, press kit creation, playlist pitching, tour management, merch store integration, sync licensing, publishing rights, A&R submissions, sample clearances, music video production tracking, radio/blog pitching, fan campaigns, revenue intelligence, songwriting, project budget planning, and venue/booking CRM. The platform aims to streamline and optimize various aspects of an artist's career, leveraging AI models fine-tuned specifically for the music industry, with the ambition to become the leading platform for artist career development through intelligent automation and insights.

## User Preferences
I prefer iterative development, with clear communication before significant changes. Please prioritize stability and performance. Do not make changes to folder `AI training server/ai_model/` or file `server/services/hybridStorageService.ts` unless explicitly instructed. Ensure that all new features integrate seamlessly with the existing hybrid storage system.

## Replit Environment Setup
- **Node.js**: 22 (required — project uses Node 22+ APIs)
- **Package Manager**: npm (with `legacy-peer-deps=true` in `.npmrc`)
- **Workflow**: "Start application" runs `NODE_ENV=development npx tsx server/index.ts` on port 5000 (webview)
- **Deployment**: Autoscale — build: `npm run build`, run: `bash start.sh`
- **Key Fix Applied**: Added ESM-compatible `__dirname` shim to `server/static.ts` (project uses `"type": "module"` so `__dirname` is not natively available in server files)
- **Optional services not configured in dev**: Redis/REDIS_URL (falls back to in-memory), Stripe keys (optional for payments), ADMIN_EMAIL (admin init skipped without it)

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
- **Pocket Dimension Storage Bubbles**: All major storage paths route through dedicated PDIM pockets with level-9 Gzip compression and SHA-256 content-addressed deduplication.
- **Hybrid Storage System**: All storage operations are routed entirely through PDIM as the sole backend, with `HybridStorageService` providing a tiered API.
- **AI Model Fine-Tuning**: All core AI/ML models are in-house, specifically fine-tuned for music artist use cases (e.g., Viral Scoring, Timing Optimization, Algorithm Intelligence) using industry-specific data. No external AI APIs are used.
- **Microservices-like Structure**: Services are logically separated within the monorepo.
- **Scalability**: Designed for Replit Autoscale with PDIM as the shared-state backend.
- **Robust Authentication**: Implements session fixation prevention, JWTs with refresh, and session heartbeat.
- **Comprehensive Workflow Automations**: 21 automation templates across five career phases, managed by `musicWorkflowAutomationService.ts`.
- **Advertisement and Autopilot Systems**: Exclusively use custom in-house AI models and connected social profiles.
- **AI Content Stack**: Multiple versions (v2, v3, v4) integrate advanced content science principles, generative engines (Markov), and adaptive intelligence (Beam Search, Per-Artist Engagement Feedback Loop) for social content generation and songwriting assistance.
- **Video Generation Engine**: An in-house text-to-video neural network (UNetV4 + v4 Training Engine) built with NumPy, featuring continuous self-training.
- **MaxCore DigitalGPU v2**: A domain-native compute engine and hardware accelerator design stack for optimized performance.
- **Read Replica Routing**: PostgreSQL read replica for analytical and dashboard reads.
- **Silent Deployment System**: Self-evolution engine for silent deployments with rolling restarts and auto-rollback.
- **Security Hardening**: Includes IDOR prevention, improved session cookie security, AI route rate limiting, Zod-validated input, authentication consistency, and SSRF protection.
- **Performance Hardening**: Pagination, Redis query caching, composite DB indexes, Neon PostgreSQL, and request correlation IDs.
- **Reliability Fixes**: Various background service safeguards and fallbacks.
- **Gamified Onboarding**: RPG-style persona selector, XP system, and achievements.
- **Studio DAW UI/UX**: Customizable toolbar, resizable panels, and Web Audio API integration.
- **CI/CD**: GitHub Actions workflows for desktop and mobile platforms.
- **Python Audio Analysis Engine**: Utilizes `librosa`, `soundfile`, `scipy`, `scikit-learn`, and `basic-pitch` for server-side audio intelligence (requires local Python 3.11 setup).
- **Distribution Analytics**: Aggregates data from LabelGrid and royalty transactions.
- **Offline Mode**: `OfflineProvider` and `ConnectionStatusBar` for app-wide offline context and background sync.
- **Autopilot Learning Feedback Loop**: `autopilotLearningService.recordPerformance()` for learning timing/content patterns.
- **Admin Functionality**: Dedicated admin UI for financial configuration.
- **Error Handling and Fixing**: `Chain Error Auto-Fixer` and `Platform Auto Error Fixer & Patcher` provide reactive and proactive system health monitoring and runtime patching.

## External Dependencies
- **Frontend Frameworks**: React, Vite, TypeScript, TailwindCSS, Wouter, Zustand, TanStack Query.
- **Backend Frameworks**: Express.js, Node.js, tsx.
- **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
- **Storage / Queuing / Cache (unified)**: PDIM — Pocket Dimension (`pocketdimensionstorage.replit.app`).
- **Machine Learning**: `@tensorflow/tfjs-node`.
- **Payment Processing**: Stripe (requires STRIPE_SECRET_KEY env var).
- **Email Delivery**: SendGrid.
- **Error Tracking**: Sentry.
- **Push Notifications**: Web Push Protocol.
- **Music Integrations**: Spotify, LabelGrid.
- **Social Media OAuth Integrations**: Facebook, Instagram, Twitter/X, TikTok, YouTube, LinkedIn, Google, Threads.
- **Version Control**: GitHub.
- **Search APIs**: Exa, Tavily.
