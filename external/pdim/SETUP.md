# PDIM (Pocket Dimension Storage) — Setup & Operations Guide

> **Scope of this document.** Every claim below was verified by reading the
> actual files in `external/pdim` and the Max Booster `server/` tree. Paths,
> env-var names, ports, and the boot blocker are quoted from source, not
> assumed. Where a command was run to confirm behaviour, that is stated
> explicitly.

---

## 1. What PDIM is in this project

PDIM is a **Redis-compatible storage engine** with a custom durability
backbone (the "Pocket Fabric", including Reed–Solomon erasure coding). It
exposes a JSON-over-HTTP "exec" protocol that speaks the Redis command surface.

**History / current state:**

- PDIM was formerly a **separate Replit app** served at
  `pocketdimensionstorage.replit.app`. That deployment is **retired**.
- It is now **internalized inside Max Booster**. The main app no longer depends
  on the external host being reachable.
- The Max Booster app embeds a **local in-process PDIM exec server** at
  `server/lib/localPdimServer.ts`, listening on **port `5556`**
  (`const LOCAL_PORT = 5556;`). It speaks the same protocol the PDIM client
  expects:
  - **Endpoint:** `POST /api/redis/instances/:id/exec`
  - **Base URL (local):** `http://127.0.0.1:5556/api/redis/instances/local/exec`
  - **Body:** `{ "cmd": "COMMAND", "args": ["arg1", "arg2", ...] }`
  - **Reply:** JSON — the Redis command result.
  - Backed by an in-memory `Map` with TTL, persisted to
    `./data/local-pdim-store.json` every 30 s so data survives restarts.
  - Supports Strings, Hashes, Sets, Sorted Sets, Lists, Streams
    (BullMQ-compatible), plus `PING`, `DEL`, `EXISTS`, `EXPIRE`, `KEYS`,
    `FLUSHDB`, and native `EVAL` for three known Lua scripts (sliding-window
    rate limiter, distributed-lock release, feature-event buffer flush).
    Unknown scripts throw so callers fall back.

This `external/pdim` directory is the **imported standalone PDIM source** (the
original separate app), preserved as a pnpm monorepo. It is *not* what runs in
production today (the embedded `localPdimServer.ts` is). It is kept for
reference, testing (erasure coding, smoke/load), and as the canonical
implementation of the full engine.

### Repository layout (verified)

`external/pdim` is a **pnpm workspace** (`pnpm-workspace.yaml`). Packages:

| Path                          | Package name                | Role                                   |
| ----------------------------- | --------------------------- | -------------------------------------- |
| `artifacts/api-server`        | `@workspace/api-server`     | The standalone PDIM HTTP server        |
| `artifacts/dashboard`         | `@workspace/dashboard`      | Vite/React admin dashboard             |
| `artifacts/mockup-sandbox`    | `@workspace/mockup-sandbox` | UI mockup sandbox                      |
| `lib/db`                      | `@workspace/db`             | Drizzle schema + pg pool               |
| `lib/api-zod`                 | `@workspace/api-zod`        | Shared Zod schemas                     |
| `lib/api-spec`                | `@workspace/api-spec`       | API spec                               |
| `lib/api-client-react`        | `@workspace/api-client-react` | React client                         |
| `scripts`                     | `@workspace/scripts`        | smoke/load test, patent generator      |

`pnpm-workspace.yaml` globs: `artifacts/*`, `lib/*`, `lib/integrations/*`,
`scripts`. It also defines a **catalog** (pinned versions referenced as
`catalog:` in package.json files, e.g. `drizzle-orm`, `zod`, `tsx`,
`@types/node`).

The repo enforces pnpm: the root `package.json` `preinstall` script deletes any
`package-lock.json`/`yarn.lock` and **fails the install unless the user agent is
`pnpm/*`**. `.npmrc` sets `auto-install-peers=false` and
`strict-peer-dependencies=false`. Installed tooling in this container: pnpm
`10.26.1`, Node `v20.20.0`.

---

## 2. The standalone api-server: how it is supposed to boot

**Entry point:** `artifacts/api-server/src/index.ts`.

**Scripts** (`artifacts/api-server/package.json`):

```jsonc
"dev":   "UV_THREADPOOL_SIZE=16 NODE_ENV=development NODE_OPTIONS=--max-old-space-size=8192 tsx ./src/index.ts",
"start": "UV_THREADPOOL_SIZE=16 NODE_OPTIONS=--max-old-space-size=8192 node --max-old-space-size=8192 dist/index.cjs",
"build": "tsx ./build.ts",
"typecheck": "tsc -p tsconfig.json --noEmit"
```

Key boot facts, from `src/index.ts`:

- **`PORT` is required.** If `process.env.PORT` is missing the process throws
  `PORT environment variable is required but was not provided.` (lines 36–40).
  A non-numeric / non-positive value throws `Invalid PORT value: "..."`.
- **`~8 GB default heap.** Both `dev` and `start` set
  `NODE_OPTIONS=--max-old-space-size=8192` (and `start` also passes
  `--max-old-space-size=8192` to `node` directly). This is intentional — see
  the memory constraint warning in §7 for this workspace.
- **Cluster mode via `CLUSTER_WORKERS`.** `NUM_WORKERS = Number(CLUSTER_WORKERS ?? 0)`.
  - `CLUSTER_WORKERS=0` (or unset) → **standalone** mode: one process owns state
    and serves HTTP (the default branch, `src/index.ts` ~line 267).
  - `CLUSTER_WORKERS=N > 0` → **cluster** mode: the primary initializes all state
    and services, forks N workers that only serve HTTP and delegate to the
    primary over IPC, and respawns dead workers. Only worker 1 runs the
    stay-alive pings.
- **Lua worker threads via `LUA_WORKER_THREADS`.** The Lua pool size is
  `Math.min(Number(LUA_WORKER_THREADS ?? 2), 8)`
  (`src/workers/lua-pool.ts`) — defaults to 2, capped at 8. Lua runs through
  `wasmoon` inside Node `worker_threads`.
- **Startup order (standalone/primary), from `startStateServices()`:**
  1. `initializeFabric()` — the Pocket Fabric must be live first because the
     Redis layer persists snapshots through it.
  2. `redisManager.bootstrapSystemInstances()` (see §4).
  3. `redisManager.initialize()` — warms up instances from the DB.
  4. Register warmed instances with the stay-alive service.
  5. `luaPool.start()`.
  6. `autoPushService.start()`, dataset discovery/download recovery,
     `healthMonitor.start(...)`, `eventLoopWatchdog.start()`.
  - Init is retried up to **5 times** with exponential back-off
    (`MAX_INIT_ATTEMPTS = 5`, base 2 s).
- **HTTP server timeouts:** `keepAliveTimeout = 65_000`, `headersTimeout =
  66_000`, `timeout = 60_000`.
- **Resilience:** `unhandledRejection` and `uncaughtException` are caught and
  logged (the process survives; the health monitor repairs affected services).
  Graceful shutdown on `SIGTERM`/`SIGINT` flushes all Redis stores to PDIM.

**How the original deployment launched it** (`.replit`, for reference):

```sh
# Production (deployment.run):
while true; do PORT=8080 pnpm --filter @workspace/api-server run start; sleep 3; done
# Dev workflow:
PORT=3000 pnpm --filter @workspace/api-server run dev   # api-server
PORT=5000 ... @workspace/dashboard run dev              # dashboard
```

**Build** (`build.ts`): esbuild bundles `src/index.ts` → `dist/index.cjs`
(CJS, minified, `NODE_ENV=production`) with an allowlist of deps to bundle and
everything else marked external. `start` runs the bundle.

---

## 3. Current known blocker: standalone boot fails with `ERR_MODULE_NOT_FOUND`

**Symptom (reproduced in this workspace).** Running the server directly fails
immediately at import time:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@workspace/db'
  imported from .../external/pdim/artifacts/api-server/src/redis/manager.ts
```

(Reproduced with `PORT=5599 NODE_OPTIONS=--max-old-space-size=1024 npx tsx ./src/index.ts`.)

**Root cause.** The workspace dependencies are **not installed**. Confirmed:

- `external/pdim/node_modules` — **absent**.
- `external/pdim/artifacts/api-server/node_modules` — **absent**.

`src/redis/manager.ts` imports `@workspace/db` (and the server also imports
`@workspace/api-zod`), which are `workspace:*` dependencies resolved by pnpm.
Without an install there are no symlinks for the workspace packages nor for the
third-party deps (`express`, `drizzle-orm`, `wasmoon`, `@replit/object-storage`,
`@msgpack/msgpack`, `multer`, `compression`, `cors`, `cookie-parser`, `zod`,
etc.), so module resolution fails at the first workspace import.

**What a future operator must install to make it bootable.**

1. **Install the whole workspace from the repo root** (pnpm links workspace
   packages and fetches catalog/third-party deps). Because the root
   `preinstall` hook rejects non-pnpm agents, you must use pnpm:

   ```sh
   cd external/pdim
   pnpm install                 # installs ALL workspace packages + deps
   ```

   > This is the correct/complete fix — the api-server depends on the workspace
   > packages `@workspace/db` and `@workspace/api-zod`, which only exist as
   > links after a full workspace install. A per-package install is **not**
   > sufficient on its own because pnpm resolves `workspace:*` and the shared
   > `catalog:` versions at the workspace level.

2. **Provision `DATABASE_URL`.** `@workspace/db` (`lib/db/src/index.ts`) throws
   at import if `DATABASE_URL` is unset:
   `DATABASE_URL must be set. Did you forget to provision a database?` It opens
   a `pg` pool against that URL. Push the schema before first boot:

   ```sh
   cd external/pdim
   DATABASE_URL=postgres://... pnpm --filter @workspace/db run push
   ```

3. **Then boot** (see §7 for the mandatory heap cap in this workspace):

   ```sh
   cd external/pdim
   PORT=3000 pnpm --filter @workspace/api-server run dev
   # or a production build:
   pnpm --filter @workspace/api-server run build
   PORT=8080 pnpm --filter @workspace/api-server run start
   ```

> **Disk/memory note.** A full `pnpm install` of this monorepo (React/Vite
> dashboard, drizzle-kit, esbuild, etc.) is large. `pnpm-lock.yaml` is ~228 KB
> and the workspace pins many native packages (esbuild, tailwind oxide,
> lightningcss, rollup) — though `overrides` strip the non-target platform
> binaries. If you only need the api-server and its tests, you still must run a
> full workspace install so the `workspace:*` links resolve.

---

## 4. System instances & bootstrap tokens

`src/redis/manager.ts` defines the always-present **system instances**
(`SYSTEM_INSTANCES`), each bootstrapped from an env-var token:

| Instance ID (fixed)          | Name                    | Token env var      |
| ---------------------------- | ----------------------- | ------------------ |
| `22c8e6d237afe8ae41541f87`   | `max-booster-agent`     | `AGENT_TOKEN`      |
| `f26378c8b4faf9f237a0f816`   | `max-booster-training`  | `TRAINING_API_KEY` |

`bootstrapSystemInstances()` reads `process.env[tokenEnv]` for each. **If the
env var is unset it logs a warning and skips that instance** (it does not
fail):

```text
[RedisManager] Bootstrap: env var AGENT_TOKEN not set — skipping max-booster-agent
```

For each present token it upserts a row into `redisInstances`
(`id`, `name`, `token`, `pocketId=id`, `isActive:true`), updating the token on
conflict. So to have the agent/training instances active on boot you must set
**`AGENT_TOKEN`** and/or **`TRAINING_API_KEY`**.

---

## 5. Environment variables

| Variable              | Where read                                 | Effect / default |
| --------------------- | ------------------------------------------ | ---------------- |
| `PORT`                | `src/index.ts`                             | **Required.** HTTP listen port; throws if missing/invalid. |
| `CLUSTER_WORKERS`     | `src/index.ts`                             | `0`/unset = standalone; `N>0` = cluster with N HTTP workers. |
| `LUA_WORKER_THREADS`  | `src/workers/lua-pool.ts`, `index.ts`      | Lua worker-thread count; default `2`, capped at `8`. |
| `NODE_OPTIONS`        | `package.json` scripts                     | Sets `--max-old-space-size=8192` (~8 GB heap) by default. Override to cap heap. |
| `UV_THREADPOOL_SIZE`  | `package.json` scripts                     | `16` in dev/start. |
| `PDIM_PUBLIC_HOST`    | `src/redis/manager.ts`                     | Overrides the **host** in generated connection URLs. Default `127.0.0.1:${PORT ?? 5556}`. Scheme is `http` when host starts with `127.0.0.1`, else `https`. |
| `PDIM_APP_URL`        | `src/routes/index.ts`, `src/services/stayAliveService.ts` | Root `/` redirects here (default `https://maxbooster.replit.app/`). Also the preferred public URL for external heartbeats. **Now `https://maxbooster.replit.app`.** |
| `FABRIC_BACKEND`      | `src/pocket-dimension/fabric/index.ts`, `.../control/AutoClusterManager.ts` | `replit-object-storage` makes new/seeded fabric nodes persist chunks in Replit Object Storage; anything else = local `pocket-dimension` disk backend (default). |
| `AGENT_TOKEN`         | `src/redis/manager.ts`                     | Bearer token for the `max-booster-agent` system instance. |
| `TRAINING_API_KEY`    | `src/redis/manager.ts`                     | Bearer token for the `max-booster-training` system instance. |
| `DATABASE_URL`        | `lib/db/src/index.ts`                       | **Required** by `@workspace/db`; throws at import if unset. |
| `REPLIT_DOMAINS`      | `src/services/stayAliveService.ts`          | Used for the external heartbeat URL only when it is a stable `*.replit.app` domain (`*.replit.dev` is ignored). |

**Connection URL construction** (`src/redis/manager.ts`):

```ts
const PRODUCTION_HOST = process.env["PDIM_PUBLIC_HOST"] ?? `127.0.0.1:${process.env["PORT"] ?? "5556"}`;
const HTTP_SCHEME = PRODUCTION_HOST.startsWith("127.0.0.1") ? "http" : "https";
buildConnectionUrl(token, id) => `pdim://${token}@${PRODUCTION_HOST}/api/redis/instances/${id}`
buildHttpUrl(id)             => `${HTTP_SCHEME}://${PRODUCTION_HOST}/api/redis/instances/${id}`
```

So with no overrides and `PORT=5556`, HTTP URLs default to
`http://127.0.0.1:5556/api/redis/instances/<id>` — matching the embedded local
server. Set `PDIM_PUBLIC_HOST` only if PDIM is ever exposed on a public host
again (which flips the scheme to `https`).

---

## 6. Authentication

- PDIM uses **per-instance bearer tokens**. Each `redisInstances` row carries a
  `token`; API requests authenticate with `Authorization: Bearer <token>` for
  the target instance (see the smoke test's HTTP helper, which sends
  `headers["Authorization"] = \`Bearer ${token}\``).
- System-instance tokens come from `AGENT_TOKEN` / `TRAINING_API_KEY` (§4).
- **On the Max Booster side**, the token used to talk to PDIM is
  **`STORAGE_BEARER_TOKEN`** (validated in `server/safety/envValidation.ts`,
  read into `config.storageBearerToken` in `server/config/index.ts`).
  `server/lib/pdimEnvFix.ts` reconciles credential drift: if
  `STORAGE_HTTP_URL` + `STORAGE_BEARER_TOKEN` point at the same instance as the
  legacy `PDIM_*` vars but the token differs, it overwrites the stale
  `PDIM_EXEC_URL`/`PDIM_HTTP_EXEC_URL`/`PDIM_EXEC_TOKEN`/`PDIM_BEARER_TOKEN`/
  `POCKET_DIMENSION_KEY` with the `STORAGE_*` pair before any client reads them.
  This module must be the first import in `server/index.ts`.

---

## 7. Memory constraints in this workspace ⚠️

The default heap for the api-server is **~8 GB**
(`NODE_OPTIONS=--max-old-space-size=8192`). This container has **only ~2.7 GB
free RAM** (observed via `free -h`: total 7.8 Gi, ~2.1 Gi free + ~1 Gi
buff/cache available). **Booting with the default heap will over-commit.**

**Always cap the heap** when running anything here:

```sh
# Boot the server with a safe heap cap (overrides the 8 GB default):
cd external/pdim
PORT=3000 NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @workspace/api-server run dev
```

`--max-old-space-size` is in MB. Pick a value comfortably under free RAM
(e.g. 1024–1536). Note the health monitor reports against V8's *configured*
ceiling, so a lower cap is honoured and reported correctly.

---

## 8. Tests

### 8.1 Reed–Solomon erasure test — PASSES (verified)

Located at
`artifacts/api-server/src/pocket-dimension/fabric/erasure/__rs_test.ts`. It
encodes random payloads across several `(k, m)` configs and lengths, drops up to
`m` shards in multiple patterns, and verifies reconstruction.

```sh
cd external/pdim/artifacts/api-server
NODE_OPTIONS=--max-old-space-size=1024 npx tsx src/pocket-dimension/fabric/erasure/__rs_test.ts
```

Verified output in this workspace:

```text
OK — Reed–Solomon verified across 60 loss scenarios
```

> This test does **not** require the workspace install or the database — it
> imports only `crypto` and the local `ReedSolomon.js`, so it runs even while
> the §3 blocker is unresolved.

### 8.2 Smoke / load test suite — needs a running instance

Located at `scripts/src/smoke-load-test.ts` (script name `smoke-test` in
`scripts/package.json`). It exercises the Redis HTTP API, PocketFabric storage,
pipeline, Lua scripting, auth, and concurrency/throughput.

It reads **`API_BASE`** (default `http://localhost:3000`) and hits
`${API_BASE}/api`. You must first have a **running api-server** (see §2–§3) and
point `API_BASE` at it:

```sh
cd external/pdim
API_BASE=http://localhost:3000 pnpm --filter @workspace/scripts run smoke-test
```

Because it drives the full HTTP surface (including auth), it requires the
workspace install (§3), a live server, and valid instance tokens (§4/§6). It
will not run until the §3 blocker is resolved.

---

## 9. Quick-start checklist

1. `cd external/pdim && pnpm install` (full workspace; resolves `@workspace/*`).
2. Provision `DATABASE_URL`; `pnpm --filter @workspace/db run push`.
3. Set instance tokens as needed: `AGENT_TOKEN`, `TRAINING_API_KEY`.
4. (Optional) `PDIM_APP_URL=https://maxbooster.replit.app`,
   `PDIM_PUBLIC_HOST`, `FABRIC_BACKEND`, `CLUSTER_WORKERS`,
   `LUA_WORKER_THREADS`.
5. Boot with a **capped heap** (this workspace has ~2.7 GB free):
   `PORT=3000 NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @workspace/api-server run dev`.
6. Verify erasure coding anytime (no DB/install needed):
   `npx tsx artifacts/api-server/src/pocket-dimension/fabric/erasure/__rs_test.ts`.
7. Run the smoke suite against the live server:
   `API_BASE=http://localhost:3000 pnpm --filter @workspace/scripts run smoke-test`.

> **Reminder:** In production, Max Booster does **not** run this standalone
> server — it embeds `server/lib/localPdimServer.ts` on port `5556`. This
> standalone tree is the reference implementation and test bed.
