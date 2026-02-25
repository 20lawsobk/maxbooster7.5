# Max Booster

AI-Powered Music Career Management Platform by B-Lawz Music.

## Architecture

- **Frontend**: React + TypeScript + Vite (built to `dist/public/`, served by Express in production)
- **Backend**: Express.js (Node.js/TypeScript), bundled to `dist/index.cjs` via esbuild
- **Database**: PostgreSQL via Drizzle ORM (Neon serverless driver)
- **Storage**: Hybrid — Replit Object Storage (hot tier, `@replit/object-storage`) + Pocket Dimension (cold tier, compressed)
- **State Engine**: BoosterState (Rust-based KV store with WAL, runs on port 9877)
- **Build System**: Vite (frontend) + esbuild (backend via `script/build.ts`)
- **State Management**: Zustand
- **Styling**: Tailwind CSS v4
- **Email**: SendGrid
- **Payments**: Stripe (live keys configured)
- **Monitoring**: Sentry

## Key Files

- `server/index.ts` — Express server entry point, serves on port 5000
- `server/vite.ts` — Vite dev middleware (dev mode only)
- `server/db.ts` — Drizzle ORM + Neon/WebSocket pool
- `server/routes.ts` — Route loader (dynamic import of all routes)
- `server/config/defaults.ts` — Centralized config from environment variables
- `server/services/storageService.ts` — Storage abstraction (Local/S3/Hybrid)
- `server/services/hybridStorageService.ts` — Hybrid storage (Replit hot + Pocket cold)
- `server/pocket-dimension/index.ts` — Pocket Dimension compressed storage engine
- `server/safety/index.ts` — Mandatory safety middleware (CSRF, rate limiting, helmet)
- `shared/schema.ts` — Drizzle schema definitions
- `client/src/App.tsx` — React app root
- `vite.config.ts` — Vite configuration (host: 0.0.0.0, port: 5000, allowedHosts: true)
- `script/build.ts` — Production build script (Vite frontend + esbuild backend)
- `drizzle.config.ts` — Drizzle Kit config

## Development

```bash
NODE_ENV=development npx tsx server/index.ts
```

## Production Build + Start

```bash
npm run build   # Builds frontend (Vite) + backend (esbuild) to dist/
npm run start   # Starts boosterstate + NODE_ENV=production node dist/index.cjs
```

The workflow uses: `npm run build && npm run start`

## Storage Configuration

The hybrid storage system is activated when `STORAGE_PROVIDER=replit`. It uses:
- **Hot tier**: `@replit/object-storage` with `REPLIT_BUCKET_ID`
- **Cold tier**: Pocket Dimension (compressed, chunked, content-addressed local storage)
- **Auto-tiering**: Files inactive for 30+ days are moved to cold tier every 6 hours

## Database

- Schema push: `npm run db:push`
- Uses `DATABASE_URL` environment variable (PostgreSQL / Neon)

## BoosterState

Custom Rust KV store with WAL (Write-Ahead Log) for job queues and session backing.
- Binary: `boosterstate/target/debug/boosterstate`
- Port: 9877 (set via `BOOSTERSTATE_PORT`)
- Secret: Set via `BOOSTERSTATE_SECRET`

## Environment Variables

All configured via Replit environment secrets. Key ones:
- `DATABASE_URL` — PostgreSQL connection (auto-provisioned)
- `STORAGE_PROVIDER=replit` — Activates hybrid storage
- `REPLIT_BUCKET_ID` — Replit Object Storage bucket ID
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` — Stripe live keys
- `SENDGRID_API_KEY` — Email delivery
- `REDIS_URL` — Production session store
- `SESSION_SECRET` — Session signing
- `SENTRY_DSN` — Error monitoring
- Social OAuth keys: Facebook, Google, Instagram, LinkedIn, TikTok, Twitter, YouTube, Threads, Spotify
- `BOOSTERSTATE_PORT=9877`, `BOOSTERSTATE_SECRET`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_USERNAME`
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — Web push notifications
- `APP_URL=https://maxbooster.replit.app`

## Deployment

- Target: Autoscale
- Build command: `npm run build`
- Run command: `npm run start`
