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
- CSRF protection: Cookie-based tokens with `x-csrf-token` header on mutations, exempt paths for webhooks/health
- Helmet with CSP enabled via mandatory middleware
- Rate limiting via express-rate-limit
- Prototype pollution sanitization
- Zod input validation on all write endpoints (985+ validation instances)
- Parameterized SQL via Drizzle ORM (no raw queries)
- Session-based auth with Redis store (production) / MemoryStore (dev fallback)

## Recent Changes
- 2026-02-24: Production hardening - wired CSRF middleware, fixed 14 TypeScript errors, verified auth/security/error handling/runtime stability
- 2026-02-23: Initial Replit import and setup
