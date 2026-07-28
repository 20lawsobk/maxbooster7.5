# Deployment & Operations Guide

## Environments

| Environment | URL | Database | Notes |
|---|---|---|---|
| Development | `https://<repl>.replit.dev` | `NEON_DATABASE_URL` (shared) | Vite HMR, no SW caching |
| Production | `https://maxbooster.replit.app` | `NEON_DATABASE_URL` (shared) | Replit Autoscale |
| Custom domain | `https://max-booster.com` | Same | Cloudflare proxied |

> ⚠️ Dev and prod share the same Neon database. Schema changes pushed in dev affect production immediately.

---

## Starting the App

The Replit "Start application" workflow runs:
```bash
redis-server --daemonize yes --port 6379 --loglevel warning --save '' --appendonly no \
  && sleep 1 \
  && npm run dev
```

`npm run dev` expands to:
```bash
bash -c '([ -x ./boosterstate/target/debug/boosterstate ] && ./boosterstate/target/debug/boosterstate &); sleep 1 && NODE_ENV=development npx tsx server/index.ts'
```

- Starts the optional Rust `boosterstate` sidecar if compiled (gracefully skipped if not).
- Starts the Express+Vite server via `tsx`.

---

## Server Startup Sequence (`server/index.ts`)

1. Load config (`server/config/index.ts`) — validates all required env vars.
2. Connect to PostgreSQL (Neon primary + read replica).
3. Run startup probes (`server/startup-probes.ts`) — checks DB, Redis, PDIM.
4. Initialize session store (`PdimSessionStore`).
5. Mount global middleware stack (see [AUTH.md](AUTH.md)).
6. Register route groups (`server/routes.ts`).
7. Start Vite dev middleware (dev) or serve `dist/public` (prod).
8. Listen on port 5000.
9. Init admin (`server/init-admin.ts`) — seeds plugin catalog, ensures admin user exists.
10. Start background services (Beat Loop scheduler, BullMQ workers, evolution engine).
11. After 75s: `recoverOrphanedCycles()` — marks stale Beat Loop cycles as failed.

---

## Production Build

```bash
# Full production build
npm run build

# Includes:
#   1. security-fix.ts  — patches known-vulnerable dep patterns
#   2. build.ts         — Vite production build to dist/public/
#   3. TypeScript compilation

# Prune dev deps after build
npm run prune:deploy
```

The built frontend is served from `dist/public/` by Express's static middleware.

---

## Environment Variables

Set all secrets as **Replit Secrets** (never in `.env` files committed to git). See `.env.example` for the full list of 300+ variables.

### Required

| Variable | Notes |
|---|---|
| `NEON_DATABASE_URL` | PostgreSQL connection string (primary) |
| `SESSION_SECRET` | Min 32 chars — already set as Replit Secret |

### Important Optional

| Variable | Feature |
|---|---|
| `READ_REPLICA_URL` | PostgreSQL read replica for analytics |
| `REDIS_URL` | BullMQ job queues (default: localhost:6379) |
| `STORAGE_HTTP_URL` | PDIM session store URL |
| `STORAGE_BEARER_TOKEN` | PDIM auth token |
| `MAXCORE_API_KEY` | MaxCore AI server auth |
| `AI_SERVER_URL` | MaxCore base URL (default: secure-ai-forge.replit.app) |
| `STRIPE_SECRET_KEY` | Stripe billing |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook validation |
| `SENDGRID_API_KEY` | Transactional email |
| `TWILIO_ACCOUNT_SID` | SMS/2FA |
| `TWILIO_AUTH_TOKEN` | SMS/2FA |
| `TWILIO_VERIFY_SERVICE_SID` | SMS 2FA verification |
| `VAPID_PUBLIC_KEY` | Web Push notifications |
| `VAPID_PRIVATE_KEY` | Web Push notifications |
| `ADMIN_EMAIL` | Beat Money Loop admin account |

All social OAuth credentials follow the pattern:
`<PLATFORM>_CLIENT_ID`, `<PLATFORM>_CLIENT_SECRET`, `<PLATFORM>_CALLBACK_URL`

---

## Database Operations

```bash
# Push schema changes to Neon
npm run db:push

# This runs: npx drizzle-kit push
# Targets NEON_DATABASE_URL
```

For production migrations:
```bash
# Generate migration SQL
npx drizzle-kit generate

# Review, then apply to Neon directly
psql $NEON_DATABASE_URL -f migrations/<timestamp>_<name>.sql
```

### Create admin user
```bash
npx tsx server/scripts/bootstrap-admin.ts
# or:
npm run bootstrap:admin
```

---

## Cloudflare Worker (Subdomain Proxy)

Deploy `cf-subdomain-worker.js` to Cloudflare Workers for `*.max-booster.com`:

1. Sign up at cloudflare.com and add `max-booster.com` as a site.
2. Update nameservers to Cloudflare's.
3. Add DNS records (proxied):
   - `A @ 34.111.179.208`
   - `A * 34.111.179.208`
4. Create Worker: Workers & Pages → Create Worker → paste `cf-subdomain-worker.js` → Deploy.
5. Add trigger route: `*.max-booster.com/*`
6. SSL/TLS: set to "Full".

The worker:
- Validates hostname against `HOST_RE` allow-list (421 on unknown hosts).
- Rewrites hostname to `max-booster.com`, passes `X-Forwarded-Host`.
- Adds HSTS, `X-Content-Type-Options`, CSP fallback headers.
- Caches static assets (JS/CSS/images) at edge for 24h.

---

## Mobile App (Capacitor)

```bash
# Build web assets first
npm run build

# Sync to native platforms
npx cap sync

# iOS (requires macOS + Xcode)
npx cap open ios

# Android (requires Android Studio)
npx cap open android
```

Config: `capacitor.config.json`
- `cleartext: false` — HTTPS enforced.
- `androidScheme/iosScheme: "https"` — secure WebView scheme.
- `allowNavigation`: only `maxbooster.replit.app` and `*.max-booster.com`.

---

## PM2 (AI Server Box)

The external Windows AI server (`D:/ai_server`) is managed by PM2 via `ecosystem.config.js`:

```bash
# Start all processes in production mode
pm2 start ecosystem.config.js --env production

# View logs
pm2 logs

# Monitor
pm2 monit

# Save process list (auto-restart on reboot)
pm2 save && pm2 startup
```

### One-time log rotation setup
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

Hardened settings applied to all processes: `max_memory_restart`, `restart_delay: 5s`, exponential backoff, `min_uptime/max_restarts`. Cloudflared gets `max_restarts: 50` (never give up on the tunnel).

---

## Health Checks

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/admin/system-health` | Admin | All services status |
| `GET /api/ai/health` | Session | MaxCore reachability |
| `GET /api/webhooks/stripe/health` | None | Stripe webhook receiver |

### Manual health checks
```bash
# App
curl https://maxbooster.replit.app/api/admin/system-health \
  -H "Authorization: Bearer <token>"

# MaxCore
curl https://secure-ai-forge.replit.app/api/health
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Preview blank in Replit | Restart "Start application" workflow; check `server.allowedHosts: true` in vite.config.ts |
| `node_modules/.bin` symlinks missing | Run inline Node script to recreate from package `bin` fields |
| `npm install` fails with tar error | Delete `package-lock.json`; local stub at `stubs/tar/` handles it |
| Typecheck OOMs | Use `npm run check` (split configs); never run monolithic `tsc` |
| AI endpoints return 503 | MaxCore is down/sleeping — expected; not an app bug |
| Login fails with CSRF error | Pass `csrf-token` cookie value as `X-CSRF-Token` header |
| Beat cycle stuck as "running" | Wait for `recoverOrphanedCycles()` at 75s after boot, or manually update DB |
| Storefront subdomain 404s | Check `storefront_hosts` table — hostname row with `active=true` must exist |
| Social posts not sending | Check `socialAccounts.status` — OAuth token may need reconnection |
| Session not persisting | Verify `STORAGE_BEARER_TOKEN`/`STORAGE_HTTP_URL` (not the old `PDIM_*` vars) |
