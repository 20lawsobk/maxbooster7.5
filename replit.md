# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is a comprehensive music career management platform with AI-powered features including a professional studio, social media management, analytics, marketplace, and distribution tools.

## Architecture

### Frontend
- **Framework**: React with Vite (TypeScript)
- **Styling**: Tailwind CSS
- **State Management**: Zustand, React Query
- **Routing**: Wouter
- **Location**: `client/` directory
- **Entry Point**: `client/index.html` -> `client/src/main.tsx`

### Backend
- **Framework**: Express.js (TypeScript)
- **Location**: `server/` directory
- **Entry Point**: `server/index.ts`
- **Port**: 5000 (serves both API and frontend via Vite middleware in dev)

### Rust Service (BoosterState)
- **Framework**: Axum (Rust)
- **Purpose**: High-performance KV store, sorted sets, queues, rate limiting (Redis-like)
- **Location**: `boosterstate/` directory
- **Port**: 9877 (localhost only)
- **Data**: `boosterstate-data/` directory (WAL files)

### Database
- **Type**: PostgreSQL (Neon serverless)
- **ORM**: Drizzle ORM
- **Schema**: `shared/schema.ts`
- **Config**: `drizzle.config.ts`
- **Push schema**: `npm run db:push`

### Shared Code
- **Location**: `shared/` directory
- **Contains**: Database schema, shared types

## Development

### Dev Command
```bash
npm run dev
```
This starts both the Rust BoosterState service and the Node.js server.

### Build
```bash
npm run build
```
Uses `script/build.ts` - builds Vite frontend and esbuild server bundle.

### Production
```bash
npm start
```

## Key Features
- AI Studio (music production)
- Social Media Management (multi-platform)
- Beat Marketplace
- Analytics Dashboard
- Music Distribution
- Advertising & Autopilot
- Subscription billing (Stripe)

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (required)
- `SESSION_SECRET` - Session encryption key (auto-generated in dev)
- `STRIPE_SECRET_KEY` - Stripe API key (optional, payment features)
- `STRIPE_PUBLISHABLE_KEY` - Stripe public key (optional)
- `SENDGRID_API_KEY` - Email delivery (optional)
- Various social media API keys (optional)

## Recent Changes
- 2026-02-12: Initial Replit setup - installed toolchains, provisioned database, pushed schema, configured workflow and deployment
- 2026-02-12: Fixed image rendering for files with spaces (URL-decoded paths in /objects/ route)
- 2026-02-12: Synced marketplace producer stats with real DB data (followers from storefrontFollows, sales from completed orders, ratings from storefrontRatings)
- 2026-02-12: Wired social interaction buttons (ForYouFeed like button, ProducerProfilePage follow/unfollow)
- 2026-02-12: Enhanced Stripe webhook: checkout.session.completed creates order records with idempotency checks
- 2026-02-12: Updated Stripe checkout URLs to use REPLIT_DEPLOYMENT_URL for production; sales counts filter completed orders only
