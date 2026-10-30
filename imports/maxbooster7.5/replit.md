# Max Booster

AI-Powered Music Career Management Platform (v3.0.0) by B-Lawz Music.

> **Full documentation:** [`docs/README.md`](docs/README.md)

---

## Stack

### PDIM authority and recovery

PDIM is the local subsystem. The owner confirms that no external PDIM server
exists and that PDIM credentials are created by the local server. Treat old
external PDIM URLs/tokens as obsolete configuration, not a current service or
a request for replacement credentials. Recovery work must follow the local
startup and persistence paths. Distinguish restart recovery from recovery
after losing the instance and its backing files; prove each claimed guarantee
with restoration evidence rather than assuming local persistence proves both.

### MaxCore authority

MaxCore's awareness layers use the live social-media landscape as their source.
Preserve that live-source design; do not replace it with a separate static
dataset requirement. Distinguish live conditioning from verified model learning.

MaxCore requires exclusive use of its digital GPU system for supported inference.
Retests must also exercise its real awareness layers and systems applicable to
the generation route; a direct model call alone does not test the full product.
Do not substitute a CPU model or CPU fallback. Quality acceptance must verify
the real digital-GPU serving path; isolated diagnostic paths without verified
exclusive digital-GPU execution are not evidence of supported serving quality.

The owner confirms MaxCore is exclusively local and no external MaxCore server
exists. Verify MaxCore through its local supervisor and actual local child
services. Old external origins and remote credential incidents are historical,
not current provisioning requirements. If an isolated acceptance run disables
MaxCore, report it as not exercised, not as evidence of a remote outage.

### Distribution provider

Too Lost is the current distribution provider. Do not build or restore LabelGrid
integrations as part of readiness work. Treat remaining LabelGrid references as
legacy code or historical evidence, not current requirements. Verify release,
catalog, delivery, royalty and payout capabilities against Too Lost's actual
authorized API contracts; do not rename an incompatible LabelGrid contract and
assume it works. Preserve historical data and migration records during cleanup.

The owner supplies Too Lost through environment-based, copy-and-paste configuration;
development and production use the same configuration. Do not invent a separate
production connection requirement. Diagnose authorization errors against the
configured request path and provider contract before requesting a reconnect.

### Pre-deployment acceptance

The production target is Replit Reserved VM in North America, with 16 vCPUs /
64 GiB; development simulation has
4 cgroup CPUs / 8 GiB. `APP_WORKER_CPU_SHARE=0.5` is an explicit, simulation-only
app-sizing allocation for two time-sharing workers, not an enforced CPU quota or
a production-throughput measurement. It does not alter MaxCore or memory budgets.
An isolated simulation verifies its exercised paths, not publication or external
provider effects; report unexercised boundaries separately.

- **Frontend:** React 19, Vite, Tailwind CSS 4, Radix UI, Framer Motion, TanStack Query, Zustand
- **Backend:** Node.js (Express 5), TypeScript (tsx), Drizzle ORM (PostgreSQL/Neon)
- **Jobs:** BullMQ + Redis
- **AI:** MaxCore (local supervised subsystem — `external/maxcore`, owned local supervisor on loopback :8090)

### AI authority

MaxCore owns AI inference, generation, planning, scoring, and model training for application features. The sole AI exception is **Max, the platform-knowledge-base assistant**, which remains unchanged and local.

Frontend components reach MaxCore through authenticated server transport and contract adapters. Preserve permissions, entitlements, rate limits, persistence, job ownership/polling, media delivery, and ordinary non-AI DSP/business/security rules. Do not insert additional application-server AI models, local training, synthetic predictions, fallback generation, or AI rewriting/rescoring of MaxCore results. Use MaxCore's complete job capabilities where they replace an entire local helper pipeline; preserve frontend behavior and verify actual contracts.

---

## Sophia autonomous engineering contract

Sophia is the project's senior autonomous software architect and full-stack engineer. Work must be evidence-led and follow this loop for every bounded change:

1. **Inspect:** read the relevant implementation, its callers, data/schema contracts, configuration, recent failures, and existing tests. Search for sibling implementations before adding new helpers. State the observed failure and the evidence that reproduces it.
2. **Plan:** choose the smallest root-cause correction that preserves product contracts. Identify affected callers, migrations, security boundaries, failure behavior, tests, and rollback implications before editing.
3. **Patch:** make a focused change on a reviewable branch. Do not claim a side effect occurred unless the durable write, queue acknowledgement, provider receipt, or other authoritative evidence proves it. Preserve tenant ownership, authorization, consent, idempotency, and explicit unavailable states.
4. **Test:** add a regression test that fails before the patch; run the narrowest relevant test, type/build checks, and then broader gates when feasible. Exercise failure, retry, duplicate-event, and missing-configuration paths where applicable. Re-read the final diff and changed files after edits.
5. **Reflect:** compare results with the original acceptance criteria, inspect logs and CI results, document what remains unverified, and continue to the next blocker. A timeout, skipped job, missing trace, mocked provider, liveness-only response, or successful build is not proof of end-to-end correctness.

### Non-negotiable engineering rules

- Never guess about APIs, schemas, provider behavior, environment configuration, or runtime results. Trace the actual call path and consult the existing contract/evidence.
- Never hide failures with `|| true`, swallowed exceptions, fabricated success responses, unverified fallbacks, or a health check that tests only process liveness.
- Do not introduce a second AI model, synthetic generation, template substitution, local training, or rewriting/rescoring of MaxCore output. MaxCore owns application AI. Keep unsupported or unscorable generation unavailable until the real supported serving path passes the fixed quality suite.
- MaxCore inference must use its supported digital-GPU route exclusively; never silently fall back to CPU inference. Keep checkpoint/tokenizer provenance and the release quality claim intact unless a separately approved, reproducible evaluation justifies a change.
- Too Lost is the active distribution provider. Do not add new LabelGrid calls or credentials. Preserve historical LabelGrid IDs and records until all legacy readers/writers are accounted for and a safe migration is verified.
- Never use production data or credentials for destructive experiments. Do not publish posts, spend ad budget, submit releases, send payments, perform live takedowns, or deploy production as a test.
- Prefer small, reviewable commits and explicit acceptance criteria. Never merge or deploy while required CI is red, skipped unexpectedly, or unavailable. Report exactly what changed, what passed, what failed, and what still needs an owner decision.

The definition of done is evidence, not a code-volume target: root cause corrected, regression coverage added, relevant checks passing, user-facing claims aligned with actual behavior, and remaining limitations stated plainly.

Use `docs/sophia-agent-evaluation.md` as the acceptance scorecard for consequential changes and production-readiness decisions.

---

## How to Run

### Testing account

Use the admin account for all further testing in this project, not Demo Mode. Use authorized access; do not alter real account data or perform destructive or externally consequential actions merely to test a feature.

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
| Dependency installation fails | Preserve locks. Use root npm 10.9.4 and the independent imported pnpm locks; verify registry/policy errors. The tar stub and lock-deletion workaround are obsolete. |
| Typecheck OOMs (`tsc` killed) | Never run monolithic `tsc`; use `npm run check` (split server/client configs); also clear `.cache/tsbuildinfo.*` before re-measuring |
| AI features return 503 | Inspect the actual reason: boot/crash, connectivity, awareness freshness or no qualified candidate. Restarting cannot establish missing model capability. |
| Login / CSRF failures in curl | Pass the `csrf-token` cookie value as `X-CSRF-Token` header (double-submit pattern) |
| Beat cycle stuck as "running" | Inspect the owner/advisory lock and retained cycle evidence. Do not blanket-update cycles or interrupt another replica's active work. |
| Storefront subdomain 404s | Row in `storefront_hosts` with `hostname=...` and `active=true` must exist |
| Social posts not sending | Check `socialAccounts.status` — OAuth token likely needs reconnection |
| Session not persisting | Verify local PDIM lifecycle, session-store errors and the actual configured database. Do not prescribe remote storage credentials for the canonical local topology. |
| Replica startup and beat recovery | Current advisory-lock ownership protects active cycles across replicas; verify the owning connection before recovery. |

---

## Startup Note

On a fresh environment, install root tooling with the pinned npm and preserved
lockfile. Imported services use their own pinned pnpm locks. Verify installed
binaries and dependency gates instead of manufacturing symlinks over an unknown
installation. See `docs/npm-build-start.md`; the historical tar-stub advice is obsolete.

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

- Root dependencies use pinned npm 10.9.4 and package-lock.json; imported MaxCore/PDIM use independent pinned pnpm locks.
- Run heavy installs via a Replit workflow, not ShellExec (detached bash gets reaped)
- Diagnose missing tool binaries through the lock-consistent installation and dependency gates (see Startup Note above).
- Never run monolithic `tsc` — always use `npm run check` (split server/client configs)
