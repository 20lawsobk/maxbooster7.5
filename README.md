# Max Booster

Max Booster is an all-in-one platform for independent music artists: AI-assisted
music creation and studio tools, distribution to streaming platforms, a
storefront and marketplace for beats and merch, social promotion, and the
operational systems (billing, payouts, analytics) that tie them together.

The codebase is a TypeScript monorepo: an Express API server, a React client,
and shared schema/types. It deploys on **Replit** (VM deployment) with **Neon
Postgres** as the database.

## Stack

- **Runtime:** Node.js 22 (pinned; `start.sh` locates or provisions the right
  binary — it verifies Node by executing it, not by stat-ing paths, because
  the deployment container lazy-loads filesystem layers)
- **Server:** Express + Drizzle ORM, session auth, early `/api/health`
  fast-path registered before session/PDIM middleware so health checks answer
  instantly regardless of load
- **Client:** React + Vite, React Query, Tailwind
- **Database:** Neon Postgres (`DATABASE_URL`); schema in `shared/schema.ts`,
  pushed with `npm run db:push`
- **Cache / state:** Redis-compatible layer (`REDIS_URL`); the Pocket
  Dimension (PDIM) subsystem implements Redis-level behavior internally —
  Redis-level semantics are PDIM's domain, not the app server's
- **Payments:** Stripe (checkout, subscriptions, webhooks, merchant
  settlement, payouts)
- **Media/AI:** Python services invoked from the server (audio analysis,
  MaxCore generation); the "digital GPU" is a software compute domain — the
  `.cu` kernel files are the contract and the Python layer is the backend, so
  CUDA-written kernels run without physical GPU hardware

## Quick start

```bash
npm install
cp .env.example .env   # fill in REQUIRED values
npm run dev            # bash scripts/start-dev.sh
```

The server binds `0.0.0.0:$PORT`. `GET /api/health` returns service health.

## Environment

`.env.example` documents every variable (256 entries): copy it to `.env` and
fill in values. Variables marked **REQUIRED** make the server refuse to start
when missing; everything else degrades gracefully. Core requirements:

- `DATABASE_URL` — Neon Postgres connection string
- `PORT` — listen port (platform-provided on Replit)
- Stripe keys for billing/payouts; `REDIS_URL` for the cache layer

Never commit a real `.env`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (client + server) |
| `npm run start` | Production start via `start.sh` |
| `npm run check` | TypeScript check (server + client configs) |
| `npm test` | Unit test suite (Vitest) |
| `npm run lint` | ESLint (errors only) |
| `npm run db:push` | Push Drizzle schema to the database |

## Testing

- `npm test` — the unit suite (150 files) covering routes, services, the
  commerce/webhook honesty contracts, PDIM recovery simulations, and the
  endpoint audit
- `npm run test:integration` — integration config
- `npm run test:smoke` — post-deployment smoke tests
- Simulations run **inside Dev only**: production-fidelity, disposable, and
  never touching deployment APIs or production data (`npm run simulate:*`)

## Repository tooling

- `npm run readiness-gauge -- --profile generic` — production-readiness gauge:
  15 runnable checks (typecheck, unit tests, lint, secrets scan, dependency
  audit, production build, env config, health/port contracts, README, and
  more) with industry profiles (generic, fintech, healthcare, ecommerce, saas,
  media) and weighted GO / CONDITIONAL GO / NO GO verdicts. See
  `scripts/readiness-gauge/READINESS_GAUGE.md`.
- `npm run change-compare` — before/after comparison of any two repo states
  (ref→ref, ref→worktree, ref→staged) with semantic TypeScript diffs and
  breaking-change heuristics. See `scripts/change-compare/CHANGE_COMPARE.md`.
- `node scripts/audit-endpoints.mjs --static` — audits client `/api/*` calls
  against the mounted server route graph; output in `reports/`.

## Deployment

Deploy path is **Dev → production-fidelity simulations in Dev → production**
on Replit (VM). There is no separate staging environment. The production run
command is `bash start.sh`; the build produces `dist/` and prunes dev
dependencies. `replit.nix` provides zstd, redis, postgresql_17, and ffmpeg.

Deployment is operated from Replit; do not deploy from a local checkout.
