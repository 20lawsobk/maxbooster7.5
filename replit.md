# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is a comprehensive AI-powered platform designed to empower musicians, producers, and labels with tools for music production, distribution, social media management, a beat marketplace, and advanced analytics. Its core purpose is to streamline the music career management process, offering features from AI-assisted audio creation to global distribution and detailed performance tracking. The platform aims to be a one-stop solution for artists looking to grow their careers and maximize their market potential.

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
Max Booster is built with a modern web stack, featuring a React 18 frontend with TypeScript, Vite, TailwindCSS, and shadcn/ui for a consistent and responsive user interface. The backend is an Express.js application also written in TypeScript, ensuring type safety across the full stack. Data persistence is handled by PostgreSQL with Drizzle ORM, and Redis Cloud is used for session management and distributed tasks.

### UI/UX Decisions
The frontend leverages shadcn/ui components to provide a modern and accessible user experience. Design patterns focus on intuitive workflows for music production, social media scheduling, and data visualization in dashboards. Specific UI components include an AI Studio with real-time spectral processing, Studio One-style DAW elements, and advanced search filters for the marketplace. The platform aims for a clean, professional aesthetic.

### Technical Implementations
- **AI Studio**: Features real-time spectral editing, advanced modulation capabilities, analog warmth processing, and real-time collaboration. It supports plugin hosting and integrates with professional audio services for LUFS normalization, streaming target compliance, and audio metadata extraction.
- **Video Creation**: An in-house WebGL render engine allows for custom video generation with various shaders, audio visualizers, lyric engines, and text animators. It supports promo templates and automatic optimization for different social media platforms.
- **Distribution**: Integrates with LabelGrid for global music distribution, offering SLA tracking, Content ID registration, sync licensing opportunities, and automated royalty splits. It maintains a local DSP catalog and validates releases against platform-specific requirements.
- **Social Media Management**: Provides approval workflows, bulk scheduling, a unified inbox, competitor benchmarking, and social listening tools, with OAuth connections to major social platforms. Token management includes encryption, proactive refreshing, and revoked token detection.
- **Beat Marketplace**: Features license templates, customizable storefront themes, advanced search functionalities, and producer analytics. It supports zero-commission checkout via Stripe Connect.
- **Analytics Dashboard**: Offers multi-platform data ingestion (Spotify, Apple Music, YouTube, TikTok, Instagram), playlist tracking, trigger city detection, cross-platform performance comparison, and an alert system for key milestones.
- **Payment & Billing**: Implements Stripe Connect for split payments and instant payouts with risk assessment, a comprehensive ledger, automated PDF invoicing, and robust refund/dispute handling.
- **User Retention**: Incorporates features like a "First Week Success Path" for guided onboarding, progressive feature discovery, an achievement system, an AI career coach, revenue forecasting, and a release countdown hub.
- **Security Hardening**: Includes comprehensive security measures such as session fixation prevention, password change session invalidation, circuit breakers for external services, webhook idempotency, rate limiting, token encryption, input validation, and robust error handling across all modules.

### System Design Choices
- **Microservices-oriented (conceptual)**: The backend is structured into distinct services (e.g., distributionService, competitorBenchmarkService) to encapsulate business logic and promote maintainability.
- **Robust Error Handling**: Implementations include try-catch wrappers for user input, retries for external API rate limits (e.g., LabelGrid), circuit breakers for critical services, and comprehensive validation at various layers.
- **Scalability**: Utilizes Redis for session and queue management, and asynchronous file operations to prevent blocking. Memory safeguards and timeouts are implemented for audio processing.
- **Data Integrity**: Drizzle ORM with strict schema validation ensures data consistency, complemented by comprehensive input validation for all API endpoints.

## External Dependencies
- **Stripe**: For payment processing, including Stripe Connect for split payments and instant payouts.
- **SendGrid**: For transactional email delivery, including weekly insights emails.
- **Redis Cloud**: Used for session storage, caching, and managing distributed tasks like rate limiting.
- **Sentry**: For error tracking and monitoring.
- **LabelGrid**: Integrated for music distribution, content ID, and sync licensing services.
- **Replit Object Storage**: Utilized for storing file assets.
- **Social Media APIs**: Integrations with Twitter, Facebook, Instagram, TikTok, YouTube, and LinkedIn for social media management features.
- **music-metadata library**: For audio metadata extraction.
- **Y.js**: For real-time collaboration features in the AI Studio.