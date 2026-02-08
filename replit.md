# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is an AI-powered platform designed for musicians, producers, and labels, offering a comprehensive solution for music career management. It integrates AI-assisted music production, global distribution, social media management, a beat marketplace, and advanced analytics. The platform's core purpose is to serve as a one-stop shop for artists to grow their careers, maximize market potential, and streamline operations from creative AI tools to performance tracking.

## User Preferences
I prefer clear and concise communication.
I value iterative development and frequent updates.
I like detailed explanations for complex features.
Do not make changes to folder `shared/`.
Do not make changes to file `shared/schema.ts`.
Prioritize robust, scalable, and secure solutions.
When making changes, always consider the impact on performance and user experience.
Always ask for confirmation before making significant architectural changes or adding new external dependencies.

## System Architecture
Max Booster employs a modern web stack consisting of a React 18 frontend with TypeScript, Vite, TailwindCSS, and shadcn/ui. The backend is built with Express.js in TypeScript. Data persistence is managed by PostgreSQL with Drizzle ORM. Session management, caching, queues, and distributed tasks are handled by BoosterState — a custom Rust-based WAL-backed sharded in-memory store (replaces Redis/BullMQ). The architecture is conceptually microservices-oriented, prioritizing robust error handling, scalability through asynchronous operations, and data integrity.

### UI/UX Decisions
The frontend uses shadcn/ui for a modern, accessible, and intuitive user experience. The design principles are inspired by professional DAWs like Studio One, featuring dynamic layout systems with `useDynamicLayout`, `useFluidLayout`, `DynamicGrid`, `DynamicFlex`, and `DynamicContainer` for responsive design across various screen sizes. The platform also supports Progressive Web App (PWA) features including an install banner, deep linking, and service worker caching.

### Technical Implementations
- **Professional DAW Engine Architecture**: A complete 10-engine DAW core (TransportEngine, TimelineEngine, AutomationEngine, RoutingEngine, MIDIEngine, NonDestructiveAudio, PluginStateManager, MusicalIntelligence, ProjectManager, DAWCore) provides sample-accurate timing, advanced editing, and comprehensive audio processing capabilities.
- **FlowState Studio**: A revolutionary unified DAW interface that combines all AI Studio features with an innovative UX. It features a 3D spatial workspace, GPU-accelerated spectral visualizers, adaptive UI modes (Create/Record/Mix/Master/Perform), an AI Co-Producer for context-aware suggestions, and real-time collaboration presence. It also includes comprehensive plugin and instrument browsers, a professional timeline ruler, and extensive keyboard shortcuts.
- **Video Creation**: Utilizes an in-house WebGL render engine for custom video generation with advanced visual effects.
- **Distribution**: Integrates with LabelGrid for global music distribution, Content ID, sync licensing, and automated royalty splits.
- **Social Media Management**: Provides tools for approval workflows, bulk scheduling, unified inbox, competitor benchmarking, and social listening via OAuth connections to various platforms.
- **Beat Marketplace**: Features license templates, customizable storefronts, producer analytics, and zero-commission checkout.
- **Analytics Dashboard**: Offers multi-platform data ingestion and analysis (Spotify, Apple Music, YouTube, TikTok, Instagram) for performance tracking and insights.
- **Payment & Billing**: Implements Stripe Connect for split payments, instant payouts, and automated invoicing.
- **User Retention**: Incorporates guided onboarding, progressive feature discovery, an achievement system, and an AI career coach.
- **Security Hardening**: Includes session fixation prevention, rate limiting, token encryption, and input validation.
- **KYC/Identity Verification**: Provides an end-to-end workflow for identity document submission.
- **HyperLearning Engine**: An AI-powered system for analyzing social media performance, identifying micro-patterns, and providing predictive modeling for content optimization.
- **Advanced AI Engines**: Custom-built, in-house AI engines providing GPT-5.2 level capabilities for text-to-music generation (Advanced Music AI Engine) and social media content creation with platform-specific optimization and audience psychology modeling (Advanced Social AI Engine).

## External Dependencies
- **Stripe**: Payment processing, including Stripe Connect.
- **SendGrid**: Transactional email delivery.
- **BoosterState**: Custom Rust-based in-memory store (WAL-backed, sharded) for session storage, caching, queues, rate limiting, and sorted sets. Binary at `boosterstate/target/release/boosterstate`, HTTP API on port 9877. Node.js client at `server/lib/boosterStateClient.ts`.
- **Sentry**: Error tracking and monitoring.
- **LabelGrid**: Music distribution, content ID, and sync licensing.
- **Replit Object Storage**: File asset storage.
- **Meta Graph API**: Unified Facebook and Instagram integration.
- **music-metadata library**: Audio metadata extraction.
- **Y.js**: Real-time collaboration in the AI Studio.
- **OAuth connections for Social Media Platforms**: Meta (Facebook + Instagram), Twitter/X, YouTube, Google, LinkedIn, Google Business, Threads, TikTok.