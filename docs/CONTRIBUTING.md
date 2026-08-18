# Contributing & Developer Guide

## Prerequisites

- Node.js ≥ 22
- Redis (local: `redis-server`; Replit: started automatically by the workflow)
- PostgreSQL access via `NEON_DATABASE_URL`
- `SESSION_SECRET` (min 32 chars)

Optional for full feature set: Stripe, SendGrid, Twilio, social OAuth credentials, MaxCore API key.

---

## Getting Started

```bash
# Install dependencies (use pnpm — npm install can OOM on this large project)
pnpm install

# Start the app (Replit: just start the "Start application" workflow)
npm run dev
# Runs: redis-server, then tsx server/index.ts + Vite dev server on port 5000
```

Important install rules:
- Do not mix `npm install` and `pnpm install` in the same checkout.
- Use `pnpm install` for developer workflows (`lint`, `check`, `test`) so devDependencies and workspace overrides are present.
- If `pnpm` reports an override mismatch or `lint`/`check` start failing with missing tooling such as `eslint` or `vite/client`, wipe `node_modules` and reinstall with `pnpm install --no-frozen-lockfile`.
- Keep production-only `npm install --omit=dev` usage isolated to deployment packaging flows; it is not a valid setup for local validation.

### First-time setup
```bash
# Create the initial admin user
npm run bootstrap:admin

# Push schema to your Neon database
npm run db:push
```

---

## Scripts Reference

```bash
npm run dev            # Development server (Express + Vite HMR)
npm run build          # Production build to dist/
npm run check          # TypeScript: check both server + client (split configs)
npm run check:server   # TypeScript: server only
npm run check:client   # TypeScript: client only
npm run lint           # ESLint (errors only, --quiet)
npm run lint:fix       # ESLint auto-fix
npm run fix            # ESLint --fix + Prettier --write
npm run db:push        # Sync Drizzle schema to NEON_DATABASE_URL
npm run deploy         # Build + deploy to Replit
npm run audit          # npm audit fix
```

---

## TypeScript Configuration

Three configs exist to prevent OOM on the large monorepo:

| File | Covers | Use for |
|---|---|---|
| `tsconfig.json` | Everything (base) | Editor/IDE — never run this with `tsc` directly |
| `tsconfig.server.json` | `server/`, `shared/`, root `*.ts` | `npm run check:server` |
| `tsconfig.client.json` | `client/src/`, `shared/` | `npm run check:client` |

**Never run monolithic `tsc`** — it OOMs at ~4GB. Always use `npm run check` or the split configs.

Before measuring TS errors after large changes:
```bash
rm -f .cache/tsbuildinfo.server .cache/tsbuildinfo.client
npm run check
```

### Safe compiler options (currently enabled)
- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `moduleResolution: bundler`

### Intentionally NOT enabled (would add thousands of errors to existing codebase)
- `exactOptionalPropertyTypes` — deferred
- `noUncheckedIndexedAccess` — deferred

---

## ESLint Configuration

`eslint.config.js` — ESLint v10 flat config.

### Hard errors (block CI)
- `no-eval`, `no-implied-eval`, `no-new-func`, `no-script-url` — code injection prevention
- `no-division-by-zero/no-division-by-zero` — custom rule
- TypeScript strict recommended rules (no-unsafe-optional-chaining, etc.)

### Warnings (visible but non-blocking)
- `no-console` (allow warn/error)
- `@typescript-eslint/no-unused-vars`
- `eqeqeq`

### Excluded from linting
Scripts (`scripts/`), build output (`dist/`, `build/`), generated code (`**/__generated__/`), and the legacy diffusion service (`server/services/diffusion/`).

---

## Code Organization Conventions

### Route handlers
- One file per domain in `server/routes/`.
- Admin routes in `server/routes/admin/`.
- Handlers validate input with Zod, call a service or `storage` method, return typed JSON.
- Never call `db` directly from a route — go through `storage.*` or a service.

### Services
- Pure business logic — no Express types (no `req`/`res`).
- `requireMaxCore` middleware in the route, not in the service.
- All `optimize*` methods return `boolean` to enable honest applied-count reporting.

### Database access
- Only `server/storage.ts` (`DatabaseStorage`) reads/writes the DB directly.
- Auth-sensitive reads always use the primary `db` (not `dbRead`) to avoid replica lag.
- All methods wrap calls in `_retryQuery()` for transient connection errors.

### Error handling
```ts
// Always check instanceof before falling back to 500:
try {
  await callMaxcore(...)
} catch (err) {
  if (err instanceof AIUnavailableError) return res.status(503).json({ error: err.message });
  return res.status(500).json({ error: "Internal server error" });
}
```

### Additive optional fields
```ts
// ✅ Correct — doesn't add undefined-valued keys
const payload = { name, ...(bio ? { bio } : {}) };

// ❌ Wrong — adds undefined-valued key
const payload = { name, bio: bio ?? undefined };
```

---

## Database Conventions

- Schema defined in `shared/schema.ts` only.
- After adding a table or column: `npm run db:push` (dev) or generate+apply a migration (prod).
- Column type is `risk` in `audit_logs`, not `severity`.
- Every active storefront subdomain must have a row in `storefront_hosts` with `active = true`.
- When adding optional fields to a `jsonb` column, check that the actual Neon DB column exists before adding to the Drizzle schema (TS2339 "property X on drizzle row" could mean unbuilt feature, not just type drift).

---

## Common Gotchas

### PDIM tokens
`PDIM_BEARER_TOKEN`/`PDIM_HTTP_URL` (legacy) ≠ `STORAGE_BEARER_TOKEN`/`STORAGE_HTTP_URL` (current). Reconciled once in `pdimEnvFix.ts`. Never add per-call-site reconciliation — it drifts again.

### MaxCore auth
Send only `Authorization: Bearer <token>`. Adding `X-API-Key` or `X-Admin-Key` causes 401 on every call, surfaces as "MaxCore returned no content".

### Beat loop title
Take only the **first line** of MaxCore's title response. Multi-line or mid-word truncation has been a recurring bug.

### Campaign activation
`activateCampaign` rejects campaigns not in `draft` status. Always create campaigns as `draft`, then call activate. Never create directly as `active`.

### `distributionService.ts` import
```ts
import { storage as baseStorage } from "../storage.js";
// NOT: import { storage } from "../storage.js"
```

### Codemod debris patterns to watch for
- `?.` accidentally inserted into SQL string literals (breaks the query string).
- `let _x` / bare `x =` broken variable renames.
- Floating statements with throwing sub-expressions (side-effect code erroneously simplified).

---

## Testing

```bash
# Unit tests (Vitest)
npx vitest run

# Type-check first (catches many bugs without running code)
npm run check

# End-to-end (Playwright-based, against running app)
# See testing skill for full instructions
```

---

## Security Checklist (before merging)

- [ ] No `eval`, `new Function`, `setTimeout(string)` — enforced by ESLint
- [ ] New public routes: rate limiting applied?
- [ ] New routes touching user data: ownership check (`userId === req.user.id`)?
- [ ] New admin routes: `requireAdmin` middleware applied?
- [ ] New DB query by ID: filters by `userId` unless intentionally cross-tenant?
- [ ] New external HTTP call: URL is not user-controlled (SSRF prevention)?
- [ ] New secrets: added as Replit Secrets, not hardcoded?
- [ ] MaxCore calls: use `requireMaxCore` middleware + `aiErrorStatus()` in catch?

---

## Documentation

All docs live in `docs/`. Update the relevant file when changing the system:

| File | When to update |
|---|---|
| `docs/ARCHITECTURE.md` | Major structural changes |
| `docs/API.md` | New or changed routes |
| `docs/AUTH.md` | Auth/session/CSRF/2FA changes |
| `docs/DATABASE.md` | Schema changes |
| `docs/SERVICES.md` | New or changed services |
| `docs/BEAT_MONEY_LOOP.md` | Beat Loop behavior changes |
| `docs/INTEGRATIONS.md` | External integration changes |
| `docs/FRONTEND.md` | Client architecture changes |
| `docs/DEPLOYMENT.md` | Deploy/ops process changes |
| `threat_model.md` | New attack surface, new mitigations |
| `design_guidelines.md` | Design system changes |
| `replit.md` | Quick-start / troubleshooting |
| `.agents/memory/MEMORY.md` | Non-obvious lessons for the AI agent |
