# Assembled application acceptance drill

Decision: **FAIL**

Artifact label: **sealed non-ML source application acceptance; not full-stack or packed acceptance**

## Replay

`env -i PATH="$PATH" HOME=/tmp node scripts/testing/page80-acceptance.mjs`

Run started: 2026-11-05T14:41:35.106Z

Report generated: 2026-11-05T14:43:00.841Z

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
  "capacityAdmission": "not_run",
  "schemaGeneration": "pass",
  "postgres": "pass",
  "appProcess": "pass",
  "health": {
    "status": 200,
    "contentType": "application/json; charset=utf-8"
  },
  "readiness": {
    "scope": "sealed non-ML authentication, projects, and frontend acceptance",
    "fullStackReadiness": "NOT_PROVEN: separate real imported MaxCore/model acceptance required",
    "expectedDegradedReadinessAsserted": true,
    "unifiedAwarenessReady": false,
    "status": 503,
    "aggregate": "degraded",
    "subsystems": {
      "database": {
        "status": "ok"
      },
      "redis": {
        "status": "ok"
      },
      "routes": {
        "status": "ok",
        "detail": "critical routes registered; route loading complete"
      },
      "audit": {
        "status": "unknown",
        "detail": "initializing"
      },
      "automation": {
        "status": "ok",
        "detail": "workflows=0"
      },
      "maxcore": {
        "status": "unknown",
        "detail": "MaxCore not configured (no URL/key)"
      }
    }
  },
  "frontend": {
    "status": 200,
    "contentType": "text/html; charset=utf-8",
    "bytes": 16213,
    "sha256": "e11a78d002aa95c3612334aa495806bf15110a7c96acbc0e94680d7321fa3ac0"
  },
  "authHttp": {
    "csrfCookieHeaderBinding": "pass",
    "register": "pass",
    "registrationSession": "pass",
    "login": "pass",
    "sessionPersistence": "pass",
    "logoutInvalidation": "pass",
    "syntheticUserRemovedWithDatabase": true
  },
  "httpLoad": "not_requested",
  "browser": {
    "engine": "Chromium CDP",
    "hydrated": true,
    "screenshot": "reports/readiness-implementation/assembled-acceptance-login.png",
    "formLogin": "fail",
    "failure": "Chromium page CDP endpoint did not become ready",
    "prerequisite": "Investigate the recorded browser login failure against the current built asset."
  },
  "egressGuard": "pass (external net.connect, direct Socket.connect, UDP, and child processes denied in preflight)",
  "cleanup": "pass",
  "syntheticEntitlement": "paid entitlement provisioned only in disposable local database; no provider or payment bypass in application",
  "projectCrud": {
    "create": true,
    "read": true,
    "update": true,
    "delete": true,
    "missingVersion428": true,
    "staleVersion409": true,
    "crossOwnerReadUpdateDelete404": true,
    "deletedRead404": true
  },
  "lastReadinessObservation": {
    "status": 503,
    "aggregate": "degraded",
    "unifiedAwarenessReady": false,
    "subsystems": [
      {
        "name": "database",
        "status": "ok"
      },
      {
        "name": "redis",
        "status": "ok"
      },
      {
        "name": "routes",
        "status": "ok"
      },
      {
        "name": "audit",
        "status": "unknown"
      },
      {
        "name": "automation",
        "status": "ok"
      },
      {
        "name": "maxcore",
        "status": "unknown"
      }
    ],
    "routeRegistrationDetail": "critical routes registered; route loading complete"
  }
}
```

## Sanitized failures

- browser login acceptance failed: Investigate the recorded browser login failure against the current built asset.

## Interpretation

- Real application routes and production static frontend were served from the assembled server process.
- Normal registration/login used the real password hashing, CSRF, session store, and logout paths with a synthetic user; no auth bypass was used.
- A real headless Chromium page hydrated the login UI and captured a pre-credential screenshot, but the assembled browser login failed; HTTP auth evidence remains distinct and the artifact prerequisite is recorded.
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
