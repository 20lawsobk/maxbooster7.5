# Max Booster - AI-Powered Music Career Management Platform

## Project Overview

Max Booster is a full-stack TypeScript web application for music artists. It provides AI-assisted tools for social media management, music distribution, analytics, beat marketplace, career automation, press kit builder, playlist pitching, shows/tour management, merch store, sync licensing, and publishing rights management.

**Author:** B-Lawz Music (blawzmusic@gmail.com)  
**Version:** 3.0.0  
**Production URL:** https://maxbooster.replit.app

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 7, TailwindCSS 4, Wouter (routing), Zustand (state), TanStack Query
- **Backend:** Express.js, TypeScript (tsx), Node.js 22
- **Database:** PostgreSQL via Neon (serverless), Drizzle ORM
- **State Store:** BoosterState (custom Rust-based WAL key-value store on port 9877)
- **Storage:** Hybrid — Replit Object Storage (hot tier) + Pocket Dimension (cold tier) + BoosterState
- **Build:** Vite for frontend, tsx/esbuild for server bundle

## Architecture

This is a monorepo with:
- `client/` - React frontend (served via Vite middleware in dev, static in prod)
- `server/` - Express backend with all API routes
- `shared/` - Shared TypeScript types and Drizzle schema
- `boosterstate/` - Rust WAL-based key-value store (pre-compiled binary in `target/debug/`)
- `ai_model/` - Python AI model components + weights
- `server/pocket-dimension/` - Custom compression/deduplication virtual storage engine
- `server/services/hybridStorageService.ts` - Unified hot/cold tier storage abstraction

The server serves the frontend via Vite middleware in development mode. Both frontend and backend run on **port 5000**.

## Storage System (Hybrid)

Three-layer hybrid storage:
1. **Replit Object Storage** (hot tier) — Recent files, active projects, frequently accessed. Uses `@replit/object-storage` package with `REPLIT_BUCKET_ID`.
2. **Pocket Dimension** (cold tier) — Archives, old versions, rarely accessed (30+ days idle). Streaming compression/deduplication with bracket-notation access.
3. **BoosterState** (metadata/queuing) — Rust WAL store used for social media queues, session data, and fast key-value lookups on port 9877.

Auto-tiering runs every 6 hours — files idle 30+ days or >50MB are moved to cold storage.

## Development

Start command: `npm run dev`

This starts:
1. `boosterstate` binary (Rust key-value store on port 9877)
2. Express server with Vite middleware on port 5000

## Production

Build: `npm run build`  
Start: `npm run start`

The build script auto-detects if pre-built client assets exist (skips Vite if so).

## Configured Environment Variables

All production credentials are configured. Key variables:

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe payment processing (live) |
| `STRIPE_PUBLISHABLE_KEY` | Stripe frontend key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |
| `SENDGRID_API_KEY` | Email delivery |
| `REDIS_URL` | Redis session store + pub/sub |
| `REPLIT_BUCKET_ID` | Replit Object Storage bucket |
| `STORAGE_PROVIDER` | Set to `replit` (hybrid mode) |
| `BOOSTERSTATE_SECRET` | BoosterState auth secret |
| `BOOSTERSTATE_PORT` | 9877 |
| `SENTRY_DSN` | Error tracking |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Push notifications |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify integration |
| `LABELGRID_API_TOKEN` | Music distribution (LabelGrid) |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | Facebook OAuth |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | Instagram OAuth |
| `TWITTER_CLIENT_ID` / `TWITTER_API_SECRET` | Twitter/X OAuth |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | TikTok OAuth |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` | YouTube OAuth |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | LinkedIn OAuth |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `THREADS_APP_ID` / `THREADS_APP_SECRET` | Threads OAuth |
| `SESSION_SECRET` | Session signing secret |
| `DATABASE_URL` | Primary PostgreSQL (Neon) |
| `DATABASE_REPLICA_URLS` | Read replica PostgreSQL |
| `GITHUB_PAT` | GitHub access token |
| `Admin_Email` | blawzmusic@gmail.com |
| `APP_URL` | https://maxbooster.replit.app |

## Stripe Products (Live)

- Monthly: `price_1SEWW4GIdnrORdO6gJkLUYf6` ($49/mo)
- Yearly: `price_1SEWW5GIdnrORdO6N8PyilTm` ($468/yr)
- Lifetime: `price_1SEWW5GIdnrORdO6CL86RYTb` ($699)

## Storefront Membership Subscription Flow

Fan-facing subscription via Stripe Checkout:
1. Fan clicks "Subscribe Now" on a storefront membership tier
2. `POST /api/storefront/subscribe/:tierId` creates a Stripe Checkout Session (mode: subscription)
3. Fan is redirected to Stripe-hosted payment page
4. On success, Stripe fires `checkout.session.completed` webhook
5. Webhook (`server/routes/webhooks/stripe.ts`) detects `metadata.type === 'storefront_membership'` and creates the `customer_memberships` record
6. Fan is redirected back to the storefront with `?membership=success`

Artist-side tier creation:
- Creating a membership tier in StorefrontBuilder automatically creates a Stripe Price via `storefrontService.createMembershipTier`
- The `stripe_price_id` is stored on `membership_tiers` table (added in schema alongside `current_subscribers`, `sort_order`)
- Cancel flow: `storefrontService.cancelMembership` sets `cancel_at_period_end: true` on the Stripe subscription

## Distribution Platforms

97 platforms seeded including Spotify, Apple Music, TikTok, Instagram, YouTube, Amazon Music, Deezer, Tidal, Pandora, SoundCloud, and 87 more global platforms.

## Key Fixes Applied During Import

1. Upgraded Node.js from 20 to 22
2. Cleared corrupted temp node_modules directories
3. Installed npm dependencies with `--ignore-scripts`
4. Pushed database schema
5. Created placeholder ML weights files to skip TF.js training on startup
6. Removed `process.exit(1)` from Vite error logger
7. Cleared Vite cache

## Bug Fixes (Post-Launch)

- **Streak hardcoding**: Added `threshold` field to `week_streak` (7) and `month_streak` (30) — and all other non-binary achievements — in `DEFAULT_ACHIEVEMENTS` (`server/routes/onboarding.ts`). The `maxProgress` field now uses `achievement.threshold ?? 1` instead of a per-ID ternary.
- **Build script**: Rewrote `scripts/build-apps.ts` — eliminated double `buildWebAssets()` calls in `buildDesktopAndMobile()`, replaced `setupCapacitor()` overwrite with `validateCapacitorConfig()` (never touches existing `capacitor.config.ts`), made `ensureCapacitorInstalled()` actually install packages, added platform fallback error in `buildDesktop()`, consolidated aliases (`all`, `both`, `desktop-mobile` → `buildAll()`).
- **Electron version**: `electron/main.js` now reads `APP_VERSION` from `package.json` via `fs.readFileSync` instead of the hardcoded string `'3.0.0'`.
- **Stripe auto-price**: Subscribe route auto-creates a Stripe price if `stripePriceId` is missing, then persists it.
- **Redis session fallback**: Production no longer exits on Redis failure — falls back to memory store with a warning.

## Auth System Fixes

### Session Security
- **Session fixation prevention**: All 6 login handlers (register, login, demo login, Google OAuth, post-payment existing user, post-payment new user) now call `req.session.regenerate()` before setting `req.session.userId`. This creates a new session ID on every login, preventing session fixation attacks.

### JWT Bearer Token System (for mobile API clients)
- **Added `jwt_tokens` DB table**: Stores issued access tokens with `userId`, `accessToken`, `expiresAt`, `revoked`, `revokedAt`, `revokedReason`
- **Added `refresh_tokens` DB table**: Stores refresh tokens with `userId`, `token` (unique), `expiresAt`, `revoked`, `revokedAt`, `revokedReason`
- **Implemented 8 missing storage methods** in `DatabaseStorage`: `createJWTToken`, `verifyJWTToken`, `revokeJWTToken`, `revokeAllJWTTokensForUser`, `createRefreshToken`, `getRefreshToken`, `revokeRefreshToken`, `revokeAllRefreshTokensForUser` — these were called by `jwtAuthService.ts` but didn't exist, causing runtime crashes on any Bearer token request
- **JWT token revocation on logout**: `POST /api/auth/logout` now revokes all JWT tokens for the user and clears the session cookie

### Session Heartbeat
- **Added `POST /api/auth/refresh-token` endpoint**: Validates the session and returns `{ success: true, expiresAt }`. Used by the frontend to keep sessions alive.
- **Mounted `TokenRefreshHandler` in App.tsx**: Pings `/api/auth/refresh-token` every 5 minutes while a user is logged in, and on tab focus changes. Sessions no longer silently expire while the app is open.

## Database

Uses Drizzle ORM with PostgreSQL. Schema in `shared/schema.ts`.  
To push schema changes: `npm run db:push`

## Feature Map (All Integrated Tabs)

### Distribution Page
- Overview, Releases, Artist Profiles, New Release, Quality Check, Codes, Scheduling, Splits, Earnings, Takedowns, Rights, HyperFollow, Analytics, Platforms, Transfer, Submission Status, Content ID, Outcomes
- **Playlist Pitching** tab (pitch campaigns to curators)
- **Shows / Booking** tab (live show management + venue CRM via `/api/venues`)
- **Sync Licensing** tab (pitch music to film/TV/ads)
- **A&R Submissions** tab (label/publisher/management submissions via `/api/label-submissions`)
- **Sample Clearance** tab (track sample usage, clearance status via `/api/sample-clearances`)
- **Music Videos** tab (video production tracker via `/api/music-videos`)

### Social Media Page
- Overview, Connect, Content Queue, Schedule, AI Generator, Autopilot, Analytics, Content Calendar, Bulk Tools, Approvals, Unified Inbox, Social Listening, Press Kit
- **Radio & Press** tab (radio/DJ/blog/podcast outreach tracker via `/api/radio-pitches`)
- **Fan Campaigns** tab (fan email campaigns with templates via `/api/fan-campaigns`)

### Royalties Page
- Overview, Statements, Splits, Publishing, Forecast, Payouts
- **Tax & Revenue Intelligence** tab (IRS quarterly schedule, deductions checklist, revenue stream classification)

### Projects Page
- Overview, Beats, Samples, Studio Sessions, Collaboration
- **Songwriting** tab (sessions, lyrics, built-in AI rhyme finder + chord progressions via `/api/songwriting`)
- **Budget Planner** tab (project budgets, line items, expense tracking via `/api/project-budgets`)

### Advertisement Page
- Overview, Campaigns, Autopilot, Analytics, Audiences, Creatives, Automation
- **Press Kit / EPK** tab (professional bio, links, assets for media/booking)

### Workflow Automations Page (`/workflow-automations`)
- Full `AppLayout` with sidebar navigation
- **Stats dashboard**: Active count, Total Runs, Success Rate, Last Run — powered by `GET /api/music-workflow-automations/stats`
- **4 Tabs**: Overview (phase summary cards + progress bars + how-it-works guide), Automations (all 21 templates by phase), Run History (execution logs with template names), Schedule (upcoming scheduled runs + event-triggered list)
- **21 automation templates** across 5 career phases:
  - Creation: Track Upload Analysis, Auto-Prompt PRO Track Registration, Collaboration Alert
  - Pre-Release: Release Countdown Posts, Pre-Save Campaign, Distribution Submitted Notify, Press Release Generator, Mix Ready Checklist
  - Release Day: Release Day Social Blast, Release Day Newsletter, Release Day Push Notify, Auto-Update Social Bios
  - Post-Release: Weekly Performance Digest, Streaming Milestone Celebrate, Playlist Placement Alert, Low Engagement Rescue, Multi-Platform Caption Repurposer
  - Revenue: Beat Sale Thank You, Royalty Collection Reminder, Venue Booking Follow-Up, Auto-Pitch New Tracks for Sync
- **Service**: `server/services/musicWorkflowAutomationService.ts` — full CRUD, event dispatcher, cron scheduler (weekly digest + monthly royalty check)

### New DB Tables Added
`labelSubmissions`, `radioPitches`, `venueContacts`, `projectBudgets`, `budgetLineItems`, `sampleClearances`, `musicVideoProductions`, `songwritingSessions`, `fanCampaigns`

### Design Constraint
The Advertisement and Autopilot systems use **custom in-house AI models + connected social profiles** to negate ad spend entirely. Do NOT add ad budgets, ad spend tracking, or native ad platform integrations to those sections.
