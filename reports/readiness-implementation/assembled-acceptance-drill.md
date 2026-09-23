# Assembled application acceptance drill

Decision: **PASS_WITH_UNTESTED_CATEGORIES**

## Replay

`env -i PATH="$PATH" HOME=/tmp node scripts/readiness-assembled-acceptance.mjs`

Run started: 2026-09-23T09:24:37.616Z  
Report generated: 2026-09-23T09:25:07.752Z

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
  "schemaGeneration": "pass",
  "postgres": "pass",
  "appProcess": "pass",
  "health": {
    "status": 200,
    "contentType": "application/json; charset=utf-8"
  },
  "readiness": {
    "status": 200,
    "aggregate": "ok",
    "subsystems": {
      "database": {
        "status": "ok"
      },
      "redis": {
        "status": "ok"
      },
      "routes": {
        "status": "ok"
      },
      "audit": {
        "status": "unknown"
      },
      "automation": {
        "status": "ok"
      },
      "maxcore": {
        "status": "unknown"
      }
    }
  },
  "frontend": {
    "status": 200,
    "contentType": "text/html; charset=utf-8",
    "bytes": 16213,
    "sha256": "35e7db675e9d9026c8409b3f284b6b19a164b47c333c92ba8bf412372561f49b"
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
  "browser": {
    "engine": "Chromium CDP",
    "hydrated": true,
    "formLogin": true,
    "sessionPersisted": true,
    "logout": true,
    "screenshot": "reports/readiness-implementation/assembled-acceptance-login.png"
  },
  "egressGuard": "pass (external net.connect, direct Socket.connect, UDP, and child processes denied in preflight)",
  "cleanup": "pass"
}
```


## Interpretation

- Real application routes and production static frontend were served from the assembled server process.
- Normal registration/login used the real password hashing, CSRF, session store, and logout paths with a synthetic user; no auth bypass was used.
- A real headless Chromium page hydrated the login UI, submitted the login form, persisted its cookie session, logged out, and captured a pre-credential screenshot.
- A 200 liveness response alone is not treated as readiness. Frontend acceptance requires a real HTML response after the production static handler is active.
- `frontend` records the raw production HTML response; `browser` separately records JavaScript hydration and the real browser form/session journey.
- This result does not disable a failed critical readiness dependency or relabel degraded provider behavior as a pass.

## Still untested

- authenticated browser journeys beyond the completed login/session/logout path
- provider sandbox delivery, OAuth, webhooks, messaging, push, email, social posting, and DSP contracts
- real-money payment, payout, refund, royalty, and financial reconciliation
- production-source restore/upgrade/rollback and durable backup recovery
- local MaxCore inference/model behavior (the only MaxCore implementation; intentionally not started in this bounded non-ML drill)
- Redis/PDIM loss recovery, load/soak, multi-worker clustering, DNS/TLS, and packed cold-image startup
