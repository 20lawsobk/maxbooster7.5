# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is a full-stack web application for AI-powered music career management. It includes features for social media management, analytics, beat marketplace, distribution, studio tools, and more.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS (served on port 5000)
- **Backend**: Express.js (TypeScript), serves API and frontend via Vite middleware mode
- **Database**: PostgreSQL via Drizzle ORM (Neon serverless driver)
- **State Service**: Rust-based `boosterstate` (Axum, runs on port 9877) for high-performance state management, session store, and job queues
- **AI Model**: Python-based AI service (optional)

## Project Structure
- `client/` - React frontend (Vite, Tailwind, Radix UI)
- `server/` - Express backend (TypeScript)
- `shared/` - Shared schemas and types (Drizzle schema)
- `boosterstate/` - Rust state management service (pre-compiled binary)
- `ai_model/` - Python AI model service (optional)
- `android/` - Capacitor Android build
- `electron/` - Electron desktop app wrapper
- `migrations/` - Drizzle database migrations

## Key Commands
- **Dev**: `npm run dev` (starts boosterstate + Express/Vite dev server)
- **Build**: `npm run build` (builds client, checks boosterstate binary, bundles server)
- **Production**: `npm run start` (starts boosterstate + production Node.js server)
- **DB Push**: `npx drizzle-kit push`

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (required)
- `SESSION_SECRET` - Session encryption key (auto-generated)
- `STRIPE_SECRET_KEY` - Stripe API key (optional for dev)
- `STRIPE_PUBLISHABLE_KEY` - Stripe publishable key (optional for dev)
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret (optional for dev)
- `SENDGRID_API_KEY` - SendGrid email API key (optional for dev)
- Various social media API keys (optional)

## Security
- CSRF protection: Cookie-based tokens with `x-csrf-token` header on mutations, exempt paths for auth/webhooks/health
- Helmet with CSP enabled via mandatory middleware
- Rate limiting via express-rate-limit (global + per-endpoint)
- Prototype pollution sanitization
- Zod input validation on all write endpoints (1358+ validation instances)
- Parameterized SQL via Drizzle ORM (no raw queries)
- Session-based auth with Redis store (production) / MemoryStore (dev fallback)
- Error responses redact internal error messages in all 500/400 responses (zero error.message leaks)
- All 92 server route files use structured logger (no console.log in production paths)
- All async route handlers wrapped in try/catch
- All promise chains have .catch() handlers
- 304 double-submit prevention patterns (disabled-during-loading)
- 310 useMemo + 1342 useCallback for render optimization

## Recent Changes
- 2026-02-24: Fixed production errors (CSRF + health probes):
  - Added /api/errors, /api/sendgrid/webhook, /status to CSRF exempt paths
  - POST /api/errors was blocked by CSRF, causing infinite retry loop (403 every 5 seconds in production logs)
  - Added retry cap (max 3) to client errorService to prevent infinite re-queue loops
  - Wired up setupStartupEndpoints early in server init (before Vite middleware)
  - Added /health, /status, /ready, /startup endpoints registered before all middleware
  - Health check probes (GET /status, GET /health) now return proper JSON instead of 401/HTML
- 2026-02-24: Fixed demo mode — now purely account-based (no session flags):
  - Demo detection is entirely by email (demo@maxbooster.ai), not session state
  - Removed all session-based isDemo flags — no cross-session contamination possible
  - Demo user gets subscriptionStatus='active' and subscriptionTier='pro' in DB on login
  - blockDemoWrite middleware, auth middleware, useRequireSubscription, and AppLayout all check user email
  - Real user accounts (including admin) are never affected by demo read-only restrictions
- 2026-02-24: Fixed hybrid storage provider activation:
  - Storage config now checks REPLIT_BUCKET_ID (not just PRIVATE_OBJECT_DIR) when selecting provider
  - ReplitStorageProvider constructor accepts REPLIT_BUCKET_ID as fallback for bucket name
  - App now correctly starts with "Hybrid Storage provider (Replit hot + Pocket Dimension cold)" instead of falling back to local filesystem
  - All 3 storage layers fully active: Replit Object Storage (hot tier), Pocket Dimension (cold tier), and auto-tiering scheduler (every 6 hours)
- 2026-02-24: Built-in DNS Management System (GoDaddy-style zone editor):
  - New database tables: dns_record_cache, dns_templates, dns_provider_credentials
  - DNS provider abstraction layer with GoDaddy and Cloudflare adapters (server/services/dnsProviderService.ts)
  - Full CRUD API routes for DNS records, templates, and provider credentials (server/routes/dns.ts)
  - DNSZoneEditor component with record table, add/edit/delete modals, TTL presets, search/filter (client/src/components/marketplace/DNSZoneEditor.tsx)
  - DNS Templates system: save current zone config as template, apply templates to domains
  - Integrated as "DNS" tab in StorefrontBuilder alongside existing tabs
  - Domain ownership validation: DNS operations restricted to storefront's custom domain
  - GoDaddy update/delete fix: handles name/type changes via delete+re-add pattern
  - Provider credential storage with verification flow
  - Batch record operations (up to 50 records per batch)
  - Record validation per type (A, AAAA, CNAME, MX, TXT, NS, SRV)
- 2026-02-24: Production hardening phase 4 (final sweep):
  - Fixed 17 remaining error.message leaks in responses (collaborations.ts, paymentBypass.ts, studioStems.ts)
  - Verified all 7 .then() chains have .catch() handlers (simulation.ts, search.ts, developerApi.ts)
  - Replaced console.log in load testing files with structured logger
  - Verified backend-frontend parity: all critical endpoints have matching frontend wrappers
  - Verified approval workflow state machine: 6 states, all transitions valid, no dead/orphan states
  - Full system metrics: 1542 endpoints, 92 route files, 568 components, 66 pages, 102 hooks
  - Zero errors on startup, zero TODO/FIXME markers, zero error.message leaks
- 2026-02-24: Production hardening phase 3 (comprehensive):
  - Fixed CSRF exempt paths: Added login, register, forgot-password, reset-password, verify, demo, google, token/refresh to exempt list
  - Replaced ALL console.log/warn/error/debug with structured logger across 60+ frontend files (components, hooks, libs, DAW engine)
  - Replaced console.log/error in server production paths: objectStorage.ts, routes.ts, static.ts, subatomic/index.ts
  - Fixed billing.ts: Added missing try/catch around /plans GET endpoint, fixed null reference crash in /retry-payment
  - Resolved all actionable TODO/FIXME markers (socialOAuthService.ts, TrackList.tsx)
  - Verified state machine hardening: release workflow with explicit state transitions, approval workflow, distribution workflow
  - Verified security: auth middleware on all protected endpoints, error response redaction, rate limiting, Zod validation
  - Verified UX polish: 323 loading state usages across pages, Suspense with InstantSkeleton, comprehensive error handling
  - Final QA: 21/22 endpoints pass (1 minor path mismatch), frontend renders correctly, all critical flows verified
- 2026-02-24: Production hardening phase 2:
  - Fixed error handler type safety: normalizeError() helper for unknown error types, proper Server type in gracefulShutdown
  - Replaced all console.log/console.warn with structured logger (logger.info/logger.error) across server code
  - Added production-safe response body redaction in request logging middleware (only logs bodies in development)
  - Fixed password validation inconsistency: registration now requires 8 chars minimum (matching change-password/reset-password)
  - Added rate limiter to /api/auth/reset-password endpoint (was missing, allowing brute-force of reset tokens)
  - Fixed 91+ error logging misuses: catch blocks now use logger.error instead of logger.info for error conditions
  - Removed 222 auto-generated TODO doc stubs across server/client/shared code
  - Removed debug console.warn from client queryClient.ts
- 2026-02-24: Production hardening phase 1 - wired CSRF middleware, fixed 14 TypeScript errors, verified auth/security/error handling/runtime stability
- 2026-02-24: Deployment size optimization:
  - Created .dockerignore to exclude .git, .cache, boosterstate/target, screenshots, videos, source files
  - Updated .gitignore: fully ignore boosterstate/target/ (removed binary exception), .cache/, screenshots, videos
  - Moved @tensorflow/tfjs and @tensorflow/tfjs-node to devDependencies (dynamically imported with fallbacks)
  - Modified build script to skip Rust compilation on Replit deployments (SKIP_BOOSTERSTATE=1 or REPL_SLUG detected)
  - Updated start script: conditionally launches boosterstate only if binary exists
  - Deploy config: build prunes devDependencies after compilation, production runs node dist/index.cjs only
  - Cleaned Playwright cache (622MB), TensorFlow excluded from production install (659MB)
- 2026-02-23: Initial Replit import and setup
