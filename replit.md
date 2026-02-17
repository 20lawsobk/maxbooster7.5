# Max Booster

## Overview
AI-Powered Music Career Management Platform by B-Lawz Music. Full-stack web application with React frontend, Express backend, PostgreSQL database, and a Rust-based in-memory key-value store (BoosterState).

## Tech Stack
- **Frontend**: React 19 + Vite 7 + TailwindCSS 4 + Radix UI + Framer Motion
- **Backend**: Express.js (TypeScript) with session-based auth
- **Database**: PostgreSQL via Drizzle ORM
- **State Cache**: Rust BoosterState service (in-memory KV store on port 9877)
- **Routing**: Wouter (client-side)
- **State Management**: TanStack React Query + Zustand
- **Internationalization**: i18next

## Project Structure
```
client/           - React frontend (Vite dev server)
  src/            - Source code (components, hooks, pages, contexts)
server/           - Express backend (API routes, middleware, services)
shared/           - Shared types and Drizzle schema
boosterstate/     - Rust KV store microservice (optional, has graceful fallbacks)
assets/           - Static assets (icons, images)
migrations/       - Drizzle database migrations
```

## Key Configuration
- **Port**: Application serves on port 5000 (both API and frontend)
- **Vite**: Configured with `allowedHosts: true` and `host: 0.0.0.0` for Replit proxy compatibility
- **Database**: Uses `DATABASE_URL` environment variable (Replit PostgreSQL)
- **Schema Push**: `npx drizzle-kit push`

## Scripts
- `npm run dev` - Development server (BoosterState + Express + Vite HMR)
- `npm run build` - Production build (Vite frontend + esbuild server)
- `npm run start` - Production start
- `npm run db:push` - Push database schema changes

## Workflow
- **Start application**: Runs debug BoosterState binary + Express dev server with Vite middleware

## Deployment
- **Target**: Reserved VM (8 vCPU / 32 GiB RAM)
- **Build**: `npm run build` (Cargo release build + Vite frontend + esbuild server bundle)
- **Run**: `npm run start` (BoosterState release binary + Node.js production server)

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (required)
- `SESSION_SECRET` - Session encryption key (auto-generated)
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` - Stripe payment (optional for dev)
- `SENDGRID_API_KEY` - Email delivery (optional for dev)
- Various social media API keys (optional)

## Recent Changes (Feb 2026)
- **TikTok OAuth**: Uses TIKTOK_CLIENT_KEY1/SECRET1 as primary, removed sandbox entry
- **Threads OAuth**: Uses `app_id` parameter + `force_authentication=1` for proper auth redirect
- **ProducerProfile**: Real beat artwork, audio playback, and ratings from API (not mock data)
- **StorefrontBuilder**: Fixed color branding sync with nested colors/fonts/layout object structure
- **Database indexes**: Added partial index on user_storage_files.deleted_at and composite index on autopilot_learning_data(created_at, engagement_rate)
- **Security**: Auth responses redact sensitive tokens (twoFactorSecret, passwordResetToken, emailVerificationToken)
- **Marketplace**: Cart modal with Stripe checkout; storefront queries use isPublished not status column
- **Route ordering**: DELETE /api/notifications/clear-all registered before DELETE /api/notifications/:id
