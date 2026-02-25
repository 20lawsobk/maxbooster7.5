# Max Booster

AI-Powered Music Career Management Platform by B-Lawz Music.

## Architecture

- **Frontend**: React + TypeScript + Vite (served on port 5000 in dev via Express middleware)
- **Backend**: Express.js (Node.js/TypeScript via `tsx`)
- **Database**: PostgreSQL via Drizzle ORM (Neon serverless driver)
- **Build System**: Vite for frontend, `tsx` script for production bundling
- **State Management**: Zustand
- **Styling**: Tailwind CSS v4

## Key Files

- `server/index.ts` — Express server entry point, serves on port 5000
- `server/vite.ts` — Vite dev middleware setup for SSR-style serving
- `server/db.ts` — Drizzle ORM database setup (Neon/WebSocket)
- `server/routes.ts` — Route loader
- `server/config/defaults.ts` — Centralized config from environment variables
- `shared/schema.ts` — Drizzle schema definitions
- `client/src/App.tsx` — React app root
- `vite.config.ts` — Vite configuration
- `drizzle.config.ts` — Drizzle Kit config

## Development

```bash
NODE_ENV=development npx tsx server/index.ts
```

## Production Build

```bash
npm run build       # builds frontend to dist/public and bundles server to dist/index.cjs
node dist/index.cjs # runs production server
```

## Database

- Schema push: `npm run db:push`
- Uses `DATABASE_URL` environment variable (PostgreSQL)

## Environment Variables

Required:
- `DATABASE_URL` — PostgreSQL connection string
- `STRIPE_SECRET_KEY` — Stripe secret key (billing features)
- `STRIPE_PUBLISHABLE_KEY` — Stripe publishable key
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook secret
- `SENDGRID_API_KEY` — Email delivery

Optional (features degrade gracefully without):
- `SESSION_SECRET` — Session signing secret (auto-generated if not set in dev)
- `REDIS_URL` — Redis for production session store
- Social OAuth keys for Twitter, Facebook, Instagram, TikTok, YouTube, LinkedIn, etc.
- `LABELGRID_API_TOKEN` — Music distribution API
- `SENTRY_DSN` — Error monitoring

## Deployment

- Target: Autoscale
- Build: `npm run build`
- Run: `node dist/index.cjs`
