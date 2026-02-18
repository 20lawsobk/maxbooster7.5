# Max Booster

## Overview
AI-Powered Music Career Management Platform by B-Lawz Music. A full-stack application with React frontend, Express backend, Rust state management service (BoosterState), and PostgreSQL database.

## Project Architecture

### Tech Stack
- **Frontend**: React + TypeScript + Vite + TailwindCSS
- **Backend**: Express.js (TypeScript) with tsx
- **State Service**: Rust (BoosterState) - in-memory KV store with WAL on port 9877
- **Database**: PostgreSQL via Drizzle ORM (Neon serverless driver)
- **Styling**: TailwindCSS v4
- **UI Components**: Radix UI, shadcn/ui pattern
- **Routing**: Wouter
- **State Management**: Zustand, React Query

### Directory Structure
```
├── client/           # React frontend (Vite)
│   └── src/          # React components, pages, hooks
├── server/           # Express backend
│   ├── routes/       # API route handlers
│   ├── services/     # Business logic services
│   ├── middleware/    # Express middleware
│   ├── safety/       # Security middleware
│   └── realtime/     # WebSocket services
├── shared/           # Shared types and schema (Drizzle)
├── boosterstate/     # Rust in-memory state service
│   └── src/          # Rust source files
├── assets/           # Static assets
├── migrations/       # Drizzle database migrations
└── script/           # Build scripts
```

### Key Configuration
- **Frontend Dev Server**: Vite on port 5000 (proxied through Express in dev)
- **Backend**: Express on port 5000
- **BoosterState**: Rust service on port 9877 (localhost)
- **Database**: PostgreSQL via DATABASE_URL env var
- **Build**: `cargo build` for Rust + `tsx script/build.ts` for Node

### Development Workflow
- Dev: `./boosterstate/target/debug/boosterstate & sleep 2 && NODE_ENV=development npx tsx server/index.ts`
- In dev mode, Vite is used as middleware in Express
- In production, static files are served from `dist/public`

### Deployment
- Build: `cargo build --release` + `npx tsx script/build.ts`
- Run: `./boosterstate/target/release/boosterstate & sleep 3 && NODE_ENV=production node dist/index.cjs`
- Target: autoscale

## Recent Changes
- 2026-02-18: Production-readiness fixes:
  - Fixed distribution releases route to query correct table (`distroReleases` not `releases`)
  - Fixed HyperFollow analytics route ordering to prevent route parameter conflict
  - Added missing `/api/social/schedule-post` POST endpoint for post scheduling
  - Added missing `/api/social/calendar/:postId/publish` POST endpoint for post publishing
  - Added missing `/api/social/hashtags/trending` GET endpoint for trending hashtags
  - Added XSS sanitization (HTML tag stripping) to profile update endpoint
  - Scoped post publish update query by both postId and userId for security
  - Comprehensive endpoint validation: 30+ endpoints verified across all 9 major feature areas
- 2026-02-17: Initial Replit setup - installed Node.js 20, Rust stable, PostgreSQL, npm dependencies. Built Rust service, pushed DB schema, configured workflow and deployment.
