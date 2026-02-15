# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is a comprehensive AI-powered music career management platform by B-Lawz Music. It provides professional tools for music production, social media management, beat marketplace, analytics, distribution, and autonomous marketing systems.

## Architecture
- **Frontend**: React + Vite (client/), served on port 5000
- **Backend**: Express.js (server/), served on same port 5000
- **State Engine**: Rust-based BoosterState service (boosterstate/) on port 9877 - acts as a fast KV store / Redis replacement
- **Database**: PostgreSQL via Drizzle ORM with Neon serverless driver
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
- Build: `cd boosterstate && cargo build --release && cd .. && npm run build`
- Start: `./boosterstate/target/release/boosterstate & sleep 3 && NODE_ENV=production node dist/index.cjs`
- Deployment target: VM (persistent WebSocket connections and background services)

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

## Recent Changes
- 2026-02-13: Analytics auto-refresh system - Created useAnalyticsInvalidation hook with prefix-based predicate matching for all /api/analytics/ and /api/analytics-alerts/ query keys. Wired into all major mutations across Projects, Dashboard, Distribution, SocialMedia, Marketplace, Royalties, and Advertisement pages. Analytics dashboards now refresh automatically when users create/update data anywhere in the platform.
- 2026-02-13: Fixed storefront memberships bug - rewrote getCustomerMemberships query to use explicit JOINs instead of Drizzle ORM relations (which were undefined for customerMemberships table), fixed column name mismatch (priceCents vs price)
- 2026-02-13: Comprehensive platform testing - 138+ API endpoint tests passed across auth, payments, studio, marketplace, distribution, social, analytics, admin, security systems. All 14 frontend pages verified. 172 database tables healthy.
- 2026-02-13: Set VITE_STRIPE_PUBLIC_KEY, APP_URL, and DOMAIN environment variables - fixed payment page blocking issue and ensured OAuth redirects use correct production URL
- 2026-02-12: Initial Replit setup - installed Node.js 20, Rust stable, configured PostgreSQL, pushed DB schema, set all API credentials, fixed storage provider detection for Replit environment
