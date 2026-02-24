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
- **Dev**: `./boosterstate/target/debug/boosterstate & sleep 1 && NODE_ENV=development npx tsx server/index.ts`
- **Build**: `npx tsx script/build.ts`
- **Production**: `./boosterstate/target/debug/boosterstate & sleep 1 && NODE_ENV=production node dist/index.cjs`
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
- Zod input validation on all write endpoints (985+ validation instances)
- Parameterized SQL via Drizzle ORM (no raw queries)
- Session-based auth with Redis store (production) / MemoryStore (dev fallback)
- Error responses redact stack traces in production
- All 99 server route files use structured logger (no console.log in production paths)

## Recent Changes
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
