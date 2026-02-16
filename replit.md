# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is a comprehensive AI-powered music career management platform by B-Lawz Music. It provides professional tools for music production, social media management, beat marketplace, analytics, distribution, and autonomous marketing systems.

## Architecture
- **Frontend**: React + Vite (client/), served on port 5000
- **Backend**: Express.js (server/), served on same port 5000
- **State Engine**: Rust-based BoosterState service (boosterstate/) on port 9877 - acts as a fast KV store / Redis replacement
- **Database**: PostgreSQL via Drizzle ORM with Neon serverless driver
- **Storage**: Hybrid Storage System — Replit Object Storage (hot tier) + Pocket Dimension (cold tier) with auto-tiering, deduplication, and compression
- **Real-time**: WebSocket server for notifications and studio collaboration

## Project Structure
```
client/          - React frontend (Vite)
  src/
    components/  - UI components
    pages/       - Page components
    stores/      - Zustand state stores
    hooks/       - Custom React hooks
    i18n/        - Internationalization
server/          - Express backend
  api/           - API route handlers
  services/      - Business logic services
  middleware/    - Express middleware
  safety/        - Security middleware
  monitoring/    - Metrics and monitoring
  realtime/      - WebSocket servers
  config/        - Configuration
shared/          - Shared types and schema (Drizzle)
boosterstate/    - Rust KV store service
```

## Key Technologies
- React 18 + Wouter (routing) + TanStack Query
- Tailwind CSS 3 + Radix UI + Framer Motion
- Zustand (state management)
- Drizzle ORM + PostgreSQL
- Stripe (payments)
- SendGrid (email)
- TensorFlow.js (content analysis)
- Sharp (image processing)

## Development
- Dev command: `./boosterstate/target/release/boosterstate & sleep 1 && NODE_ENV=development npx tsx server/index.ts`
- Server binds to 0.0.0.0:5000
- Vite dev server runs in middleware mode through Express
- `allowedHosts: true` configured for Replit proxy compatibility

## Deployment
- Build: `npm run build` (runs esbuild for server + Vite for client)
- Start: `npm run start` (starts boosterstate + production Node.js server)
- Workflow: `npm run start` (build first, then start)
- Deployment target: VM (persistent WebSocket connections and background services)
- Deploy config: build=`npm run build`, run=`npm run start`

## Configured Services
- Stripe (payments, billing, webhooks)
- SendGrid (email delivery)
- Social APIs: Facebook, Instagram, Twitter, TikTok, YouTube, LinkedIn, Threads, Google Business
- Spotify API (streaming analytics)
- LabelGrid (music distribution)
- Sentry (error monitoring)
- Redis (caching)

## Environment Variables
- `VITE_STRIPE_PUBLIC_KEY` - Stripe publishable key for frontend payment elements
- `APP_URL` - Production URL (https://maxbooster.replit.app) for OAuth redirects and Stripe callbacks
- `DOMAIN` - Domain URL for social OAuth redirects
- All social API credentials configured (Facebook, Instagram, Twitter, TikTok, YouTube, LinkedIn, Threads, Google Business, Spotify)
- Stripe (publishable key, secret key, webhook secret)
- SendGrid API key (from addresses default to @maxbooster.ai subdomains)
- LabelGrid API token for distribution
- Sentry DSN for error monitoring
- Redis URL for caching
- Replit Object Storage bucket ID

## Email Domain
- All email sender addresses use `@maxbooster.ai` consistently (support, alerts, billing, notifications, etc.)
- Ensure `maxbooster.ai` domain is verified in SendGrid for email delivery

## Recent Changes
- 2026-02-16: AI Audio Metadata Auto-fill - Beat upload form now runs client-side audio analysis (Web Audio API) when a file is selected, auto-detecting BPM, musical key, genre, mood, and tags. Uses spectral analysis, autocorrelation BPM detection, and chroma-based key estimation. Genre/mood inferred from audio features (energy, danceability, spectral centroid, scale). Shows analyzing indicator and confidence score. Users can override any auto-filled value. Located in client/src/lib/audioAnalysisService.ts.
- 2026-02-16: Unified image upload pipeline - Marketplace cover art (upload & edit) and Storefront branding (logo, banner, avatar) now use storeUploadedFile() with full security validation (magic bytes, buffer checks), image processing (Sharp resizing, metadata stripping, format conversion), and standard storage URLs (/api/storage/file/...). Matches avatar upload method. Old /api/marketplace/cover/ proxy still serves legacy records.
- 2026-02-16: Express 5 compatibility fixes - req.query/req.params read-only (Object.assign in-place), path-to-regexp v8 optional params (:param? → {/:param}), named wildcards (* → /{*splat}). Node.js upgraded to v24, all deps updated (Tailwind v4, React 19, Vite 7).
- 2026-02-16: Hybrid Storage System activated - StorageService now delegates to HybridStorageService (Replit Object Storage hot tier + Pocket Dimension cold tier). All file operations (uploads, downloads, deletes) flow through hybrid system with intelligent tiering, content-hash deduplication, compression, and automatic cold storage migration every 6 hours. Storefront and all route-level storage updated. Legacy Replit-only keys still served via fallback.
- 2026-02-15: Fixed Redis config bug - server/config/defaults.ts now reads process.env.REDIS_URL instead of hardcoded undefined. Standardized all email domains to @maxbooster.ai (was mixed .com/.io/.ai). ADMIN_PASSWORD moved to encrypted secret.
- 2026-02-15: Configured production build/start scripts - workflow uses `npm run start` (production mode), deployment uses `npm run build` + `npm run start`. Fixed Vite circular chunk dependency by separating recharts into vendor-charts chunk. All secrets configured.
- 2026-02-13: Analytics auto-refresh system - Created useAnalyticsInvalidation hook with prefix-based predicate matching for all /api/analytics/ and /api/analytics-alerts/ query keys. Wired into all major mutations across Projects, Dashboard, Distribution, SocialMedia, Marketplace, Royalties, and Advertisement pages. Analytics dashboards now refresh automatically when users create/update data anywhere in the platform.
- 2026-02-13: Fixed storefront memberships bug - rewrote getCustomerMemberships query to use explicit JOINs instead of Drizzle ORM relations (which were undefined for customerMemberships table), fixed column name mismatch (priceCents vs price)
- 2026-02-13: Comprehensive platform testing - 138+ API endpoint tests passed across auth, payments, studio, marketplace, distribution, social, analytics, admin, security systems. All 14 frontend pages verified. 172 database tables healthy.
- 2026-02-13: Set VITE_STRIPE_PUBLIC_KEY, APP_URL, and DOMAIN environment variables - fixed payment page blocking issue and ensured OAuth redirects use correct production URL
- 2026-02-12: Initial Replit setup - installed Node.js 20, Rust stable, configured PostgreSQL, pushed DB schema, set all API credentials, fixed storage provider detection for Replit environment
