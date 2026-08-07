# Max Booster

AI-Powered Music Career Management Platform (v3.0.0) by B-Lawz Music.

> **Full documentation:** [`docs/README.md`](docs/README.md)

---

## Stack

- **Frontend:** React 19, Vite, Tailwind CSS 4, Radix UI, Framer Motion, TanStack Query, Zustand
- **Backend:** Node.js (Express 5), TypeScript (tsx), Drizzle ORM (PostgreSQL/Neon)
- **Jobs:** BullMQ + Redis
- **AI:** MaxCore (local supervised subsystem — `external/maxcore`, loopback :8090; `MAXCORE_LOCAL=0` for remote)

---

## How to Run

The main workflow is **"Start application"** — starts Redis then the Express + Vite dev server on port 5000.

```bash
npm run dev
```

Skips the optional Rust `boosterstate` sidecar if not compiled, then starts `server/index.ts` via `tsx`.

---

## Required Environment Variables

| Variable | Notes |
|---|---|
| `NEON_DATABASE_URL` | PostgreSQL (Neon) — the app's actual database |
| `SESSION_SECRET` | Set as a Replit Secret (min 32 chars) |

> ⚠️ `DATABASE_URL` (Replit-managed PostgreSQL) is a **different** database from `NEON_DATABASE_URL`. All schema/query work targets `NEON_DATABASE_URL`.

See `.env.example` for the full list of 300+ optional variables (Stripe, SendGrid, MaxCore, social OAuth, etc.). Features degrade gracefully when absent; AI features return 503 without MaxCore.

---

## Key Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start development server (Express + Vite HMR) |
| `npm run build` | Production build to `dist/` |
| `npm run check` | TypeScript check — server + client (split configs, OOM-safe) |
| `npm run check:server` | TypeScript check — server only |
| `npm run check:client` | TypeScript check — client only |
| `npm run lint` | ESLint (errors only) |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run verify:dependency-upgrades` | Exercise upgraded native, archive, spreadsheet, UUID, and storage dependencies |
| `npm run fix` | ESLint --fix + Prettier --write |
| `npm run db:push` | Sync Drizzle schema to NEON_DATABASE_URL |
| `node scripts/fix-all.mjs --phase <p>` | Resumable fix-all pipeline (ts-server/ts-client/verify/imports/schema/runtime/audit/lint/summary); state+reports in `reports/fix-all/`; exits 1 while work is outstanding |
| `npm run bootstrap:admin` | Create the initial admin user |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Preview blank / not loading | Restart "Start application" workflow; confirm port 5000 opened; check `server.allowedHosts: true` in `vite.config.ts` |
| `node_modules/.bin` missing | Run the inline Node script that reads each package's `bin` field and recreates symlinks manually (see Startup Note below) |
| `npm install` / `pnpm install` fails on `tar` | Platform-blocked package; local stub at `stubs/tar/` + `overrides.tar = "file:./stubs/tar"` handles it — delete `package-lock.json` before reinstall |
| Typecheck OOMs (`tsc` killed) | Never run monolithic `tsc`; use `npm run check` (split server/client configs); also clear `.cache/tsbuildinfo.*` before re-measuring |
| AI features return 503 | local MaxCore subsystem is starting/crashed — supervisor restarts it with backoff; fail-explicit behavior, not an app bug |
| Login / CSRF failures in curl | Pass the `csrf-token` cookie value as `X-CSRF-Token` header (double-submit pattern) |
| Beat cycle stuck as "running" | `recoverOrphanedCycles()` runs 75s after boot; or manually `UPDATE beatMoneyLoopCycles SET status='failed'` in DB |
| Storefront subdomain 404s | Row in `storefront_hosts` with `hostname=...` and `active=true` must exist |
| Social posts not sending | Check `socialAccounts.status` — OAuth token likely needs reconnection |
| Session not persisting | Verify `STORAGE_BEARER_TOKEN` + `STORAGE_HTTP_URL` env vars (not old `PDIM_*` names) |
| Duplicate server boot kills live beat cycle | `recoverOrphanedCycles()` excludes cycles started by the current process via `startedAt` cutoff — do not run two server processes simultaneously |

---

## Startup Note

On a fresh environment, `node_modules/.bin/` symlinks may be missing even if `node_modules/` exists. Fix: run the inline Node script that reads each package's `bin` field and creates symlinks manually. (pnpm and npm are blocked on `tar` by Replit's security policy on this project — the stub handles installs, but symlinks may still need manual creation.)

---

## Architecture at a Glance

```
React 19 (Vite) → Express 5 → Drizzle ORM → PostgreSQL (Neon)
                          ↓
                 MaxCore AI (local subsystem)
                 PDIM session store
                 Redis / BullMQ jobs
                 Stripe / SendGrid / Twilio
                 Social OAuth (IG/TikTok/Spotify/etc.)
```

Cloudflare Worker (`cf-subdomain-worker.js`) proxies `*.max-booster.com` to the Replit origin for artist storefront subdomains.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full diagram and request lifecycle.

---

## Documentation Map

| Topic | File |
|---|---|
| Architecture & request lifecycle | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| All API routes | [`docs/API.md`](docs/API.md) |
| Auth, CSRF, 2FA, RBAC | [`docs/AUTH.md`](docs/AUTH.md) |
| Database schema (all tables) | [`docs/DATABASE.md`](docs/DATABASE.md) |
| Server services | [`docs/SERVICES.md`](docs/SERVICES.md) |
| Beat Money Loop | [`docs/BEAT_MONEY_LOOP.md`](docs/BEAT_MONEY_LOOP.md) |
| External integrations | [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) |
| Frontend / React / PWA / DAW | [`docs/FRONTEND.md`](docs/FRONTEND.md) |
| Deployment & ops | [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) |
| Contributing & conventions | [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) |
| Security threat model | [`threat_model.md`](threat_model.md) |
| Design system | [`design_guidelines.md`](design_guidelines.md) |

---

## User Preferences

- Use pnpm for package installation (npm install can OOM on this large project)
- Run heavy installs via a Replit workflow, not ShellExec (detached bash gets reaped)
- `node_modules/.bin/` symlinks may need manual recreation if missing (see Startup Note above)
- Never run monolithic `tsc` — always use `npm run check` (split server/client configs)
