# Assembled application acceptance drill

Decision: **FAIL**

Artifact label: **sealed non-ML source application acceptance; not full-stack or packed acceptance**

## Replay

`env -i PATH="$PATH" HOME=/tmp node scripts/testing/page80-acceptance.mjs`

Run started: 2026-11-07T00:07:19.056Z

Report generated: 2026-11-07T00:07:39.682Z

## Safety boundary

- The runner refuses inherited database, provider, token, key, secret, Sentry, Redis, and Node preload variables.
- The child receives an allowlisted environment, a generated one-run session secret, an ephemeral local PostgreSQL URL, and no provider credentials.
- The real application runs from a disposable working directory. PostgreSQL contains only a generated empty schema; no shared/live database or production data is read.
- A pre-import guard rejects non-loopback TCP/TLS (including direct Socket.connect), all UDP, and child processes. MaxCore local startup, fan delivery, ACME, DNS local startup, and clustering are explicitly off; none is counted as accepted.
- Chromium is launched headless with external host resolution denied. Screenshot capture is attempted before credentials are entered; its exact result is recorded in the browser evidence.
- Temporary database, logs, credentials, and working files are removed after the bounded run.

## Executed evidence

```json
{
  "accessProfile": "public launch explicitly enabled for this disposable registration/browser fixture; admin-only policy is covered by separate contract tests",
  "capacityAdmission": "not_run",
  "schemaGeneration": "pass",
  "postgres": "pass",
  "appProcess": "started",
  "cpuProfile": "not_requested",
  "health": "not_run",
  "readiness": "not_run",
  "frontend": "not_run",
  "authHttp": "not_run",
  "httpLoad": "not_requested",
  "browser": "not_run",
  "egressGuard": "pass (external net.connect, direct Socket.connect, UDP, and child processes denied in preflight)",
  "cleanup": "pass"
}
```

## Sanitized failures

- application exited 1; sanitized tail:
e-postgres/session.ts:149:14)
      at async NodePgPreparedQuery.queryWithCache (/home/runner/workspace/node_modules/src/pg-core/session.ts:71:12)
      at async createSessionStore (/home/runner/workspace/server/middleware/sessionConfig.ts:38:3)
      at async <anonymous> (/home/runner/workspace/server/index.ts:757:24) {
    [cause]: Error: Connection terminated unexpectedly
        at Connection.<anonymous> (/home/runner/workspace/node_modules/pg/lib/client.js:204:73)
        at Object.onceWrapper (node:events:633:28)
        at Connection.emit (node:events:519:28)
        at Socket.<anonymous> (/home/runner/workspace/node_modules/pg/lib/connection.js:64:12)
        at Socket.emit (node:events:519:28)
        at TCP.<anonymous> (node:net:347:12)
  }
}
{"level":30,"time":1794010058708,"pid":171085,"hostname":"repl","msg":"✅ [PDIM] Connected via HTTP exec endpoint"}
{"level":30,"time":1794010058708,"pid":171085,"hostname":"repl","msg":"✅ [PDIM] Connected via HTTP exec endpoint"}
{"level":40,"time":1794010058714,"pid":171085,"hostname":"repl","err":{"type":"Error","message":"Failed query: SELECT sid FROM pg_sessions LIMIT 0\nparams: : Connection terminated due to connection timeout: Connection terminated unexpectedly","stack":"[ACCESSOR]\ncaused by: [ACCESSOR]\ncaused by: [ACCESSOR]","query":"SELECT sid FROM pg_sessions LIMIT 0","params":[]},"msg":"FATAL: Server startup failed"}


## Interpretation

- The assembled startup did not reach sufficient evidence for an acceptance observation.
- A 200 liveness response alone is not treated as readiness. Frontend acceptance requires a real HTML response after the production static handler is active.
- `frontend` records the raw production HTML response; `browser` separately records JavaScript hydration and the real browser form/session journey.
- This result does not disable a failed critical readiness dependency or relabel degraded provider behavior as a pass.
- Passing load thresholds proves only this bounded source-app/ephemeral-PostgreSQL run. It does not prove PDIM, MaxCore, a packed artifact, production capacity, or provider acceptance.

## Still untested

- authenticated business journeys beyond login/session/logout, project CRUD, preferences persistence, workspace ownership/list rendering, and press-kit form/publish/cache/unpublish checks
- provider sandbox delivery, OAuth, webhooks, messaging, push, email, social posting, and DSP contracts
- real-money payment, payout, refund, royalty, and financial reconciliation
- production-source restore/upgrade/rollback and durable backup recovery
- local MaxCore inference/model behavior (the only MaxCore implementation; intentionally not started in this bounded non-ML drill)
- Redis/PDIM loss recovery, load/soak, multi-worker clustering, DNS/TLS, and packed cold-image startup
