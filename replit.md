# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is a comprehensive music career management platform with AI-powered features including a professional studio, social media management, analytics, distribution, beat marketplace, and more.

## Architecture
- **Frontend**: React + Vite (TypeScript) in `client/`
- **Backend**: Express.js (TypeScript) in `server/`, served via `tsx` in dev and bundled with esbuild for production
- **State Service**: Rust-based key-value store (`boosterstate/`) on port 9877, used as a Redis replacement for sessions, queues, and caching
- **Database**: PostgreSQL via Drizzle ORM, schema in `shared/schema.ts`
- **Build**: Vite for frontend, esbuild for server bundling (`script/build.ts`)

## Storage Architecture
- **Hybrid Storage**: Two-tier system combining Replit Object Storage (hot tier) with Pocket Dimension (cold tier)
  - Hot Tier (Replit Object Storage): Active files, recent uploads, frequently accessed content
  - Cold Tier (Pocket Dimension): Archives, old versions, rarely accessed files (30+ days idle)
  - Features: Intelligent auto-tiering, content-hash deduplication, cross-user dedup, compression
  - API: `/api/hybrid-storage/` endpoints for upload, download, migrate, optimize, cleanup
  - Services: `hybridStorageService.ts` (main), `replitStorageService.ts` (Replit backend), `pocket-dimension/index.ts` (cold engine)
  - Each user gets a personal Pocket Dimension with encryption, versioning, and nested dimensions

## Project Structure
```
client/          - React frontend (Vite)
server/          - Express backend
  routes/        - API route handlers
  services/      - Business logic services
  safety/        - Security middleware
  monitoring/    - Metrics and alerting
  realtime/      - WebSocket services
  pocket-dimension/ - Pocket Dimension storage engine (cold tier)
shared/          - Shared types and DB schema
boosterstate/    - Rust KV store (Axum)
script/          - Build scripts
```

## Key Configuration
- Frontend dev server: port 5000 (via Express + Vite middleware in dev)
- BoosterState: port 9877 (localhost)
- Database: PostgreSQL via DATABASE_URL env var
- Drizzle config: `drizzle.config.ts`

## Development
- Dev command: `./boosterstate/target/release/boosterstate & sleep 1 && NODE_ENV=development npx tsx server/index.ts`
- Build: `npm run build` (builds both frontend and server)
- DB schema push: `npm run db:push`

## Required Environment Variables (for full functionality)
- `DATABASE_URL` - PostgreSQL connection string (auto-provisioned)
- `SESSION_SECRET` - Session encryption key (has dev fallback)
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` - Payment processing
- `SENDGRID_API_KEY` - Email delivery

## Optional Environment Variables
- `SENTRY_DSN` - Error tracking
- Various social media API keys (Twitter, Facebook, Instagram, TikTok, YouTube)
- `LABELGRID_API_TOKEN` - Distribution features
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` - Admin bootstrap
