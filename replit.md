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
-   **Advertisement and Autopilot Systems**: Exclusively use custom in-house AI models and connected social profiles, avoiding traditional ad platform integrations.
-   **Read Replica Routing**: PostgreSQL read replica is used for analytical and dashboard reads, offloading the primary database.
-   **Silent Deployment System**: A self-evolution engine triggers silent deployments with rolling cluster restarts and auto-rollback on degradation.
-   **Security Hardening**: Includes IDOR prevention, improved session cookie security, AI route rate limiting, Zod-validated input for autopilot preferences (POST/PATCH with allowlisting to prevent mass assignment), authentication consistency, and SSRF protection. Internal IPs are whitelisted from rate limiters and the self-healing security engine to prevent false blocks of internal tools and Replit infrastructure.
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