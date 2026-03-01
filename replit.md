# Max Booster - AI-Powered Music Career Management Platform

## Replit Setup Notes

- **Node.js**: Requires Node.js 22+ (nodejs-22 module installed)
- **Workflow**: "Start application" runs `npm run dev` on port 5000 (webview)
- **Database**: PostgreSQL via Replit's built-in database (DATABASE_URL set)
- **Schema**: Pushed with `drizzle-kit push` - schema in `shared/schema.ts`
- **Dependencies**: Installed with `npm install --legacy-peer-deps`
- **Deployment**: Configured for autoscale, build=`npm run build`, run=`npm run start`
- **Optional services** (require API keys): Redis (REDIS_URL), Stripe, SendGrid, social OAuth providers

## Overview

Max Booster is an AI-powered, full-stack TypeScript web application designed to empower music artists with comprehensive career management tools. It offers AI-assisted features for social media management, music distribution, analytics, a beat marketplace, career automation, press kit creation, playlist pitching, tour management, merch store integration, sync licensing, publishing rights, A&R submissions, sample clearances, music video production tracking, radio/blog pitching, fan campaigns, revenue intelligence, songwriting, project budget planning, and venue/booking CRM. The platform aims to streamline and optimize various aspects of an artist's career, leveraging AI models fine-tuned specifically for the music industry. The project envisions becoming the go-to platform for artists looking to boost their careers through intelligent automation and insights.

## User Preferences

I prefer iterative development, with clear communication before significant changes. Please prioritize stability and performance. Do not make changes to folder `ai_model/` or file `server/services/hybridStorageService.ts` unless explicitly instructed. Ensure that all new features integrate seamlessly with the existing hybrid storage system.

## Performance Hardening (Current Session - March 2026)

### Pagination Applied to All List Endpoints
Every unbounded list query now uses `parsePaginationParams` middleware (MAX_PAGE_SIZE=500) or inline limits:
- `server/routes/merch.ts` — GET / (items) + GET /orders now paginated
- `server/routes/projectBudgets.ts` — GET / paginated; GET /:id/items paginated; PUT /:id uses `.omit({ userId: true })` to prevent ownership mutation; PUT /items/:id uses `.omit({ userId: true, budgetId: true })` to prevent both ownership and re-parenting attacks
- `server/routes/playlistPitching.ts` — GET / paginated; stats endpoint cached with 300s TTL + cache invalidation on POST, PUT, and DELETE (all mutations)
- `server/routes/customWorkflows.ts` — GET / paginated
- `server/routes/fanHub.ts` — GET /messages paginated; POST /message now uses COUNT aggregate (no full subscriber load)
- `server/routes/storefront.ts` — GET /:id/orders paginated; bogoPromotions queries limited to 100; license tiers limited to 20; cart checkout promos limited to 50
- `server/routes/marketplace.ts` — license templates query limited to 50

### Bug Fix: Playlist Pitching Create
Pre-existing bug fixed: `insertPlaylistPitchSchema.parse(req.body)` failed because `userId` was required in schema but not injected before parse. Fixed by injecting `userId: req.user!.id` before parsing. PUT route also now uses `.omit({ userId: true })` on partial schema.

### Redis Query Cache Added
Stats endpoints cached with `queryCache.getOrCompute` (300s TTL) + `queryCache.invalidate` on mutations:
- `fanCampaigns`, `venues`, `radioPitches`, `labelSubmissions`, `sampleClearances`, `musicVideos`, `songwriting`, `merch`, `projectBudgets`, `playlistPitching`

### Composite DB Indexes (50 indexes)
Migration script at `server/scripts/addCompositeIndexes.ts` created (userId, createdAt DESC) and (userId, status) composite indexes on all major user-owned tables. Column name corrections applied (storefront_orders→buyer_id/seller_id, notifications→is_read, distro_releases→artist_id). All indexes confirmed present in production DB via pg_indexes verification.

### Request Correlation IDs (End-to-End Tracing)
`requestIdMiddleware` (server/middleware/requestId.ts) registered as the first middleware in `registerRoutes`. Every request receives a UUID-based `X-Request-ID` / `X-Correlation-ID` header. Honors upstream IDs from load balancers. Propagates via AsyncLocalStorage so every `logger.*` call in any route handler automatically includes requestId and duration without manual threading. Infrastructure was already built (requestContext.ts + structuredLogger.ts) — this commit wires it live for all traffic.

## Security Hardening (Completed)

All route files migrated from broken `req.session.userId` pattern to Passport `req.user!.id` (requireAuth from `server/middleware/auth.ts`). Files fixed:

- `server/routes/labelSubmissions.ts` - ownership check on PUT/DELETE, Zod validation, try/catch
- `server/routes/musicVideos.ts` - same
- `server/routes/projectBudgets.ts` - same + budget line items ownership checks  
- `server/routes/radioPitches.ts` - same
- `server/routes/sampleClearances.ts` - same
- `server/routes/songwriting.ts` - same + ai-assist Zod validation
- `server/routes/venues.ts` - same
- `server/routes/fanHub.ts` - replaced local requireAuth with shared, Zod validation on all write routes, import size limit (1000/req)
- `server/routes/customWorkflows.ts` - Zod validation on create/update, trigger event allowlist
- `server/routes/helpDesk.ts` - ownership/validation fixes
- `server/routes/fanCampaigns.ts` - ownership/validation fixes
- `server/routes/merch.ts` - explicit field allowlist replacing body spread
- `server/routes/playlistPitching.ts` - session auth → passport auth, ownership enforced
- `server/routes/pressKit.ts` - session auth → passport auth, slug validation
- `server/routes/storage.ts` - all session.userId references replaced with req.user!.id

**Pattern used in all fixed routes**: `requireAuth` middleware + `req.user!.id` + Zod schema validation on input + ownership `AND userId` in all WHERE clauses for mutations + full try/catch with logger.error in catch + 201 status on creates + 404 when resource not found (not leaking existence).

## System Architecture

The Max Booster application is structured as a monorepo, separating concerns into distinct directories:
- `client/`: React frontend, built with Vite, TypeScript, TailwindCSS, Wouter for routing, Zustand for state management, and TanStack Query for data fetching. The UI/UX emphasizes a clean, responsive design suitable for creative professionals.
- `server/`: Express.js backend, handling all API routes, written in TypeScript.
- `shared/`: Contains shared TypeScript types and Drizzle ORM schema for consistent data definitions across frontend and backend.
- `boosterstate/`: A custom Rust-based Write-Ahead Log (WAL) key-value store, pre-compiled for performance. It's used for per-replica session data, social media queues, and fast key-value lookups.
- `ai_model/`: Python AI model components and weights.
- `server/pocket-dimension/`: A custom virtual storage engine providing streaming compression and deduplication for cold-tier storage.
- `server/services/hybridStorageService.ts`: Manages the abstraction layer for the hybrid storage solution.

The server serves the frontend using Vite middleware in development and as static assets in production. Both frontend and backend operate on **port 5000**.

**Key Architectural Decisions:**
- **Hybrid Storage System**: A three-tier approach for data storage:
    1.  **Replit Object Storage (hot tier)**: For frequently accessed and recent files, utilizing `@replit/object-storage`.
    2.  **Pocket Dimension (cold tier)**: For archival and rarely accessed data, employing custom compression/deduplication.
    3.  **BoosterState (metadata/queuing)**: A Rust WAL store for session data, queues, and fast lookups.
- **AI Model Fine-Tuning**: All core AI/ML models are specifically fine-tuned for music artist use cases using 2024-2026 data. This includes models for Viral Scoring, Timing Optimization, Algorithm Intelligence, Customer Health Scoring, and Discovery Algorithms, with specific genre multipliers and platform-specific weighting.
- **Microservices-like Structure**: Within the monorepo, services are logically separated (e.g., `musicWorkflowAutomationService.ts`, `storefrontService.ts`) to manage complexity.
- **Scalability**: Designed for Replit Autoscale, supporting up to 10 replicas with 6 workers per replica, leveraging Redis for shared state (sessions, queues, pub/sub) across replicas.
- **Robust Authentication**: Implements session fixation prevention, a JWT bearer token system for mobile API clients with refresh tokens and full revocation capabilities, and a session heartbeat mechanism.
- **Comprehensive Workflow Automations**: Features 21 automation templates across five career phases (Creation, Pre-Release, Release Day, Post-Release, Revenue), managed by `musicWorkflowAutomationService.ts` with CRUD, event dispatching, and cron scheduling.
- **Advertisement and Autopilot Systems**: Exclusively use custom in-house AI models and connected social profiles to eliminate ad spend, avoiding traditional ad platform integrations.
- **Read Replica Routing**: Production environments utilize a PostgreSQL read replica for analytical and dashboard reads to offload the primary database, while critical write operations and authentication queries are directed to the primary DB.

## External Dependencies

- **Frontend Frameworks**: React 19, Vite 7, TypeScript, TailwindCSS 4, Wouter, Zustand, TanStack Query.
- **Backend Frameworks**: Express.js, Node.js 22, tsx.
- **Database**: PostgreSQL (via Neon serverless), Drizzle ORM.
- **Caching/Queuing/Sessions**: Redis (for sessions, rate limits, BullMQ queues, pub/sub).
- **Object Storage**: Replit Object Storage.
- **Payment Processing**: Stripe (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`).
- **Email Delivery**: SendGrid (`SENDGRID_API_KEY`).
- **Error Tracking**: Sentry (`SENTRY_DSN`).
- **Push Notifications**: Web Push Protocol (using VAPID keys).
- **Music Integrations**:
    - Spotify (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`)
    - LabelGrid (`LABELGRID_API_TOKEN`) for music distribution.
- **Social Media OAuth Integrations**:
    - Facebook (`FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`)
    - Instagram (`INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`)
    - Twitter/X (`TWITTER_CLIENT_ID`, `TWITTER_API_SECRET`)
    - TikTok (`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`)
    - YouTube (`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`)
    - LinkedIn (`LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`)
    - Google (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
    - Threads (`THREADS_APP_ID`, `THREADS_APP_SECRET`)
- **Version Control**: GitHub (`GITHUB_PAT`) for CI/CD.