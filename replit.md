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

## Database

Uses Drizzle ORM with PostgreSQL. Schema in `shared/schema.ts`.  
To push schema changes: `npm run db:push`
