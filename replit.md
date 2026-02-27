# Max Booster - AI-Powered Music Career Management Platform

## Project Overview

Max Booster is a full-stack TypeScript web application for music artists. It provides AI-assisted tools for social media management, music distribution, analytics, beat marketplace, and career automation.

**Author:** B-Lawz Music (blawzmusic@gmail.com)  
**Version:** 3.0.0

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 7, TailwindCSS 4, Wouter (routing), Zustand (state), TanStack Query
- **Backend:** Express.js, TypeScript (tsx), Node.js 22
- **Database:** PostgreSQL via Neon (serverless), Drizzle ORM
- **State Store:** BoosterState (custom Rust-based WAL key-value store on port 9877)
- **Build:** Vite for frontend, tsx for server-side TypeScript

## Architecture

This is a monorepo with:
- `client/` - React frontend (served via Vite middleware in dev)
- `server/` - Express backend with all API routes
- `shared/` - Shared TypeScript types and schema
- `boosterstate/` - Rust WAL-based key-value store (pre-compiled binary in `target/debug/`)
- `ai_model/` - Python AI model components

The server serves the frontend via Vite middleware in development mode. Both frontend and backend run on **port 5000**.

## Development

Start command: `npm run dev`

This starts:
1. `boosterstate` binary (Rust key-value store on port 9877)
2. Express server with Vite middleware on port 5000

## Environment Variables Required

- `DATABASE_URL` - PostgreSQL connection string (Neon/Replit database)
- `SESSION_SECRET` - Session signing secret (auto-set)

Optional (features will be degraded without them):
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` - Payment processing
- `SENDGRID_API_KEY` - Email delivery
- `REDIS_URL` - Session store and pub/sub (falls back to in-memory)
- Social API keys for OAuth: Twitter, Facebook, Instagram, TikTok, YouTube, LinkedIn, Threads

## Database

Uses Drizzle ORM with PostgreSQL. Schema in `shared/schema.ts`.

To push schema changes: `npm run db:push`

## Key Fixes Applied During Import

1. Upgraded Node.js from 20 to 22 (required by project dependencies)
2. Cleared corrupted temp node_modules directories before install
3. Installed npm dependencies with `--ignore-scripts`
4. Pushed database schema and created indexes
5. Created placeholder ML weights files (`ai_model/weights/social_base.json`, `ai_model/weights/advertising_base.json`) to skip memory-intensive TF.js training on startup
6. Removed `process.exit(1)` from Vite error logger (was crashing server on non-fatal icon resolution warnings)
7. Cleared Vite cache to resolve stale dependency pre-bundling errors

## Production Deployment

Build: `npm run build`  
Start: `npm run start`

Production requires Stripe and SendGrid keys for full functionality.
