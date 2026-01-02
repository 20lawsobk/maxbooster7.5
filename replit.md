# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is an enterprise-level AI-powered music career management platform that integrates browser-based DAW capabilities, music distribution, a marketplace, social media management, and comprehensive analytics. It aims to empower artists and music professionals with AI-driven tools for growth and efficiency, all under the B-Lawz Music brand. The platform leverages AI to revolutionize music career management, providing innovative solutions for artists to manage their careers effectively and achieve market potential.

## User Preferences
- B-Lawz Music branding with custom anime character logo
- Modern dark/light theme support
- Professional enterprise UI design
- All dialog menus must have solid, non-transparent backgrounds

## System Architecture
Max Booster utilizes a hybrid rule-based and ML autopilot architecture for social media and advertising, combining deterministic rules with machine learning. It features 9 operational autonomous systems for 24/7 operations, content generation, and updates, along with a self-healing security system. The Advertisement Autopilot creates a "Personal Ad Network" from connected social media profiles for organic advertising. The platform includes a simulation environment for comprehensive testing across various scenarios.

**Key Features:**
-   **Authentication:** Session-based with bcrypt.
-   **Distribution:** DDEX packaging, ISRC/UPC generation, catalog imports.
-   **Storefront:** Marketplace listings, membership tiers, payment processing.
-   **Analytics:** AI-powered predictions, streaming/revenue tracking.
-   **Social Media:** Approval workflows, bulk scheduling, organic growth.
-   **Studio:** Browser-based DAW with comping, markers, plugins, stems, warping.
-   **Workspace:** Team collaboration, RBAC, SSO integration.
-   **Offline Mode:** Full offline support with project caching and sync for project editing, MIDI editing, audio playback, mixing, and plugin processing.
-   **P2P Marketplace Payments:** Peer-to-peer payment processing via Stripe Connect for seller onboarding, balance/earnings tracking, instant payouts, and split payments.
-   **Admin Controls:** Platform administration tools for system-wide settings, including a time-limited payment bypass.

**Technology Stack:**
-   **Frontend:** React, Vite, TailwindCSS, shadcn/ui.
-   **Backend:** Express.js with TypeScript.
-   **Database:** PostgreSQL with Drizzle ORM.

**Project Structure:**
-   `client/`: Frontend React application.
-   `server/`: Backend Express server.
-   `shared/`: Shared code including Drizzle database schema.
-   `uploads/`: User file uploads.

**AI Services API (100% in-house, no external API dependencies):**
-   **Content Generation:** `POST /api/ai/content/generate`
-   **Sentiment Analysis:** `POST /api/ai/sentiment/analyze`
-   **Recommendations:** `POST /api/ai/recommendations/get`
-   **Ad Optimization:** `POST /api/ai/ads/optimize`
-   **Social Media Predictions:** `POST /api/ai/social/predict`
-   **Time Series Forecasting:** `POST /api/ai/forecast`
-   **Analytics Intelligence:** `POST /api/ai/analytics/predict`, `GET /api/ai/insights`, `GET /api/ai/anomalies`, `POST /api/ai/churn/predict`, `POST /api/ai/revenue/forecast`
-   **Utility:** `POST /api/ai/hashtags/generate`, `POST /api/ai/toxicity/analyze`, `POST /api/ai/emotions/detect`, `GET /api/ai/trends`, `POST /api/ai/content/adapt`
-   **Monitoring:** `GET /api/ai/health`, `GET /api/ai/stats`, `GET /api/ai/models`, `GET /api/ai/models/:modelId/performance`

**VST/AU Plugin Bridge API:**
Supports external VST/AU plugins through a desktop app bridge with APIs for bridge management, plugin scanning & discovery, and plugin instance control (VST2, VST3, AU, AAX formats).

**Expanded Plugin Collection:**
Includes 40+ built-in audio plugins (20+ instruments and 20+ effects like Reverb, Delay, Compression, EQ, Distortion, Modulation, Utility).

## Development Setup

**Commands:**
- `npm run dev` - Start development server on port 5000
- `npm run build` - Build for production
- `npm run start` - Run production build
- `npx drizzle-kit push` - Push database schema changes

**Required Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection string (auto-configured)
- `STRIPE_SECRET_KEY` - Stripe secret API key
- `STRIPE_PUBLISHABLE_KEY` - Stripe publishable API key  
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `SENDGRID_API_KEY` - SendGrid API key for emails

**Optional Environment Variables:**
- `SESSION_SECRET` - Session encryption (auto-generated in dev)
- `REDIS_URL` - Redis for session store and queues
- `ADMIN_PASSWORD` - Bootstrap admin account password
- Social media API keys for platform integrations

## External Dependencies
-   **Payments:** Stripe (Connect for P2P marketplace)
-   **Email:** SendGrid
-   **Storage:** Replit Object Storage, AWS S3
-   **Queue Management:** BullMQ
-   **Image Processing:** Sharp
-   **Social Media Integrations:** Twitter, Facebook, Instagram, TikTok, YouTube, LinkedIn, Threads APIs
-   **Monitoring:** Redis
-   **Distribution:** LabelGrid API
-   **Error Tracking:** Sentry