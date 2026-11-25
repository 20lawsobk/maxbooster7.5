# Assembled application acceptance drill

Decision: **PASS_WITH_UNTESTED_CATEGORIES**

Artifact label: **sealed non-ML source application acceptance; not full-stack or packed acceptance**

## Replay

`env -i PATH="$PATH" HOME=/tmp node scripts/readiness-assembled-acceptance.mjs`

Run started: 2026-10-20T07:14:33.987Z

Report generated: 2026-10-20T07:15:18.776Z

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
        "detail": "all route sections registered"
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
    "sha256": "d0d7e3e3d036b61e4aa609532fe3ed802d2b4ac4024016c96e0945260e9acef6"
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
    "formLogin": true,
    "sessionPersisted": true,
    "logout": true,
    "documentGeneration": 61,
    "contextTransitionsRecovered": 0,
    "screenshot": "reports/readiness-implementation/assembled-acceptance-login.png"
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
  "savedDataJourneys": {
    "preferences": {
      "browserSessionWrite": true,
      "independentReadPersisted": true
    },
    "workspace": {
      "browserSessionCreate": true,
      "independentReadPersisted": true,
      "ownerMembership": true,
      "nonmemberReadUpdateDelete403": true,
      "savedNameRendered": true
    },
    "pressKit": {
      "actualFormSubmit": true,
      "savedFieldsRehydrated": true,
      "publicProjection": true,
      "cacheInvalidatedAfterEdit": true,
      "unpublishRevokesAnonymousRead": true
    }
  },
  "pageRoutes": {
    "authenticated": [
      {
        "requestedPath": "/dashboard",
        "expectedPath": "/dashboard",
        "finalPath": "/dashboard",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/projects",
        "expectedPath": "/projects",
        "finalPath": "/projects",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/distribution",
        "expectedPath": "/distribution",
        "finalPath": "/distribution",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/social-media",
        "expectedPath": "/social-media",
        "finalPath": "/social-media",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/advertising",
        "expectedPath": "/advertising",
        "finalPath": "/advertising",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/analytics",
        "expectedPath": "/analytics",
        "finalPath": "/analytics",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/settings",
        "expectedPath": "/settings",
        "finalPath": "/settings",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/storefront",
        "expectedPath": "/storefront",
        "finalPath": "/storefront",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/royalties",
        "expectedPath": "/royalties",
        "finalPath": "/royalties",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/contracts",
        "expectedPath": "/contracts",
        "finalPath": "/contracts",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/notifications",
        "expectedPath": "/notifications",
        "finalPath": "/notifications",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/simplified-dashboard",
        "expectedPath": "/simplified-dashboard",
        "finalPath": "/simplified-dashboard",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/developer-api",
        "expectedPath": "/developer-api",
        "finalPath": "/developer-api",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/studio",
        "expectedPath": "/studio",
        "finalPath": "/studio",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/show",
        "expectedPath": "/show",
        "finalPath": "/show",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/verification",
        "expectedPath": "/verification",
        "finalPath": "/verification",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/workspaces",
        "expectedPath": "/workspaces",
        "finalPath": "/workspaces",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/collaborations",
        "expectedPath": "/collaborations",
        "finalPath": "/collaborations",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/career-coach",
        "expectedPath": "/career-coach",
        "finalPath": "/career-coach",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/assistant",
        "expectedPath": "/assistant",
        "finalPath": "/assistant",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/release-countdown",
        "expectedPath": "/release-countdown",
        "finalPath": "/release-countdown",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/invoices",
        "expectedPath": "/invoices",
        "finalPath": "/invoices",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/handle-link",
        "expectedPath": "/handle-link",
        "finalPath": "/handle-link",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/workflow-automations",
        "expectedPath": "/workflow-automations",
        "finalPath": "/workflow-automations",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/shows",
        "expectedPath": "/shows",
        "finalPath": "/shows",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/fan-hub",
        "expectedPath": "/fan-hub",
        "finalPath": "/fan-hub",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/fan-memberships",
        "expectedPath": "/fan-memberships",
        "finalPath": "/fan-memberships",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/ar-intelligence",
        "expectedPath": "/ar-intelligence",
        "finalPath": "/ar-intelligence",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/outreach",
        "expectedPath": "/outreach",
        "finalPath": "/outreach",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/merch",
        "expectedPath": "/merch",
        "finalPath": "/merch",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/press-kit",
        "expectedPath": "/press-kit",
        "finalPath": "/press-kit",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/playlist-pitching",
        "expectedPath": "/playlist-pitching",
        "finalPath": "/playlist-pitching",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/publishing",
        "expectedPath": "/publishing",
        "finalPath": "/publishing",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/sync-licensing",
        "expectedPath": "/sync-licensing",
        "finalPath": "/sync-licensing",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      }
    ],
    "public": [
      {
        "requestedPath": "/",
        "expectedPath": "/",
        "finalPath": "/",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/security",
        "expectedPath": "/security",
        "finalPath": "/security",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/dmca",
        "expectedPath": "/dmca",
        "finalPath": "/dmca",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/api-docs",
        "expectedPath": "/api-docs",
        "finalPath": "/api-docs/",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/solo-founder-story",
        "expectedPath": "/solo-founder-story",
        "finalPath": "/solo-founder-story",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/desktop-app",
        "expectedPath": "/login",
        "finalPath": "/login",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/blog",
        "expectedPath": "/blog",
        "finalPath": "/blog",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/forgot-password",
        "expectedPath": "/forgot-password",
        "finalPath": "/forgot-password",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/reset-password",
        "expectedPath": "/reset-password",
        "finalPath": "/reset-password",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/register",
        "expectedPath": "/register",
        "finalPath": "/register",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/about",
        "expectedPath": "/about",
        "finalPath": "/about",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/features",
        "expectedPath": "/features",
        "finalPath": "/features",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/pricing",
        "expectedPath": "/pricing",
        "finalPath": "/pricing",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/terms",
        "expectedPath": "/terms",
        "finalPath": "/terms",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/privacy",
        "expectedPath": "/privacy",
        "finalPath": "/privacy",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/help",
        "expectedPath": "/help",
        "finalPath": "/help",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/documentation",
        "expectedPath": "/documentation",
        "finalPath": "/documentation",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/epk/missing",
        "expectedPath": "/epk/missing",
        "finalPath": "/epk/missing",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/s/missing",
        "expectedPath": "/s/missing",
        "finalPath": "/s/missing",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/storefront/missing",
        "expectedPath": "/storefront/missing",
        "finalPath": "/storefront/missing",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": false,
        "pass": true
      },
      {
        "requestedPath": "/marketplace/beat/missing",
        "expectedPath": "/marketplace/beat/missing",
        "finalPath": "/marketplace/beat/missing",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      },
      {
        "requestedPath": "/marketplace/producer/missing",
        "expectedPath": "/marketplace/producer/missing",
        "finalPath": "/marketplace/producer/missing",
        "hydrated": true,
        "crashed": false,
        "permissionOrEmptyState": true,
        "pass": true
      }
    ]
  },
  "nativeSignedOutLogin": {
    "electronBridgePresent": true,
    "hydratedLoginRemainsAccessible": true
  }
}
```


## Interpretation

- Real application routes and production static frontend were served from the assembled server process.
- Normal registration/login used the real password hashing, CSRF, session store, and logout paths with a synthetic user; no auth bypass was used.
- A real headless Chromium page hydrated the login UI, submitted the login form, persisted its cookie session, logged out, and captured a pre-credential screenshot.
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
