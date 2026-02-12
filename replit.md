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

## Production URL
- https://maxbooster.replit.app

## SEO Configuration
- Full Open Graph meta tags with image dimensions and alt text
- Twitter Cards (summary_large_image) with creator/site handles
- JSON-LD structured data: WebApplication, Organization, BreadcrumbList
- Dynamic sitemap.xml (queries DB for active beats and storefronts)
- robots.txt (allows public pages, disallows /api/, /admin, /dashboard)
- Server-side dynamic OG meta injection for shared beat/storefront URLs
- Canonical URLs pointing to maxbooster.replit.app
- PWA manifest with shortcuts, icons, and app identity

## Recent Changes
- 2026-02-12: Initial Replit setup - installed toolchains, provisioned database, pushed schema, configured workflow and deployment
- 2026-02-12: Fixed image rendering for files with spaces (URL-decoded paths in /objects/ route)
- 2026-02-12: Synced marketplace producer stats with real DB data (followers from storefrontFollows, sales from completed orders, ratings from storefrontRatings)
- 2026-02-12: Wired social interaction buttons (ForYouFeed like button, ProducerProfilePage follow/unfollow)
- 2026-02-12: Enhanced Stripe webhook: checkout.session.completed creates order records with idempotency checks
- 2026-02-12: Updated Stripe checkout URLs to use REPLIT_DEPLOYMENT_URL for production; sales counts filter completed orders only
- 2026-02-12: Fixed producer card field name mismatch (backend name/avatarUrl → frontend displayName/avatar); enriched beat listings with producer name, avgRating, genre, mood, tempo from metadata; fixed share button to use beat-specific URLs; added rating error handling
- 2026-02-12: Beat license system: license tiers CRUD API, Stripe checkout with license data, license agreement generation/download, rich Purchases tab UI with artwork/badges/viewer modal
- 2026-02-12: Eliminated all Math.random() mock data from server routes: social search uses real socialCampaigns DB queries, analytics scores use deterministic stream-based calculations, marketplace producer analytics use proper windowed period-over-period order queries, studio mix/master LUFS derived from compression/EQ/limiter settings, audio analysis uses format-based LUFS estimation, export file sizes calculated from track×duration×format, plugin checks validate against known plugin list, collaboration conflict detection inspects real state
- 2026-02-12: SECURITY: Moved 30 API keys/credentials from plain env vars to encrypted secrets
- 2026-02-12: Centralized getBaseUrl() helper (REPLIT_DEPLOYMENT_URL → REPLIT_DEV_DOMAIN → localhost) replacing all localhost:5000 and example.com fallbacks across 7 files
- 2026-02-12: Eliminated Math.random() mock data from 5 service files (advancedAnalytics, aiInsights, cohortAnalytics, aiMusic, advancedSocialAI) with deterministic hash-based calculations
- 2026-02-12: Maxed out SEO: comprehensive meta tags, JSON-LD structured data, dynamic sitemap.xml, robots.txt, server-side OG meta injection for shareable pages with XSS-safe escaping
- 2026-02-12: Made marketplace publicly browsable: removed auth from /api/marketplace/beats, /producers, /producers/:id; fixed sitemap /auth→/login and listings.isPublished filter; implemented demo mode with isDemo session flag + blockDemoWrite middleware; marketplace UI shows browse/producers tabs for all visitors, seller tabs hidden for non-auth users
