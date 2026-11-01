# Assembled application acceptance drill

Decision: **FAIL**

Artifact label: **sealed non-ML source application acceptance; not full-stack or packed acceptance**

## Replay

`env -i PATH="$PATH" HOME=/tmp node scripts/readiness-assembled-acceptance.mjs`

Run started: 2026-10-19T20:48:17.432Z

Report generated: 2026-10-19T20:48:34.729Z

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
    "sha256": "6ef1697f9e6d9c14a410d4c673f04751b40beb2915430c6e3a395becb674ba57"
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
    "documentGeneration": 4,
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
  "pageRoutes": {
    "authenticated": [
      {
        "requestedPath": "/analytics",
        "finalPath": "/analytics",
        "hydrated": true,
        "crashed": true,
        "permissionOrEmptyState": false,
        "pass": false,
        "visibleText": "Something went wrong\nunknown\nSomething unexpected happened. Our team has been notified.\nQuick fixes to try\n•\nTry refreshing the page\n•\nClear your browser cache\n•\nContact support if issue persists\nTechnical details\nTry Again\nGo Home\nReport Issue",
        "errors": [
          {
            "path": "/analytics",
            "message": "[useOfflineStatus] Failed to load stats: Error: Sign in before accessing private offline storage\n    at jh (http://localhost:43657/assets/studio-BnKY3-NI.js:17:9512)\n    at Ws.init (http://localhost:43657/assets/index-C-_jDVe_.js:2:6764)\n    at Ws.ensureDb (http://localhost:43657/assets/index-C-_jDVe_.js:2:7445)\n    at Ws.getStats (http://localhost:43657/assets/index-C-_jDVe_.js:2:12498)\n    at http://localhost:43657/assets/TopBar-DTt8seA4.js:6:13573\n    at http://localhost:43657/assets/TopBar-DTt8seA4.js:6:13765\n    at fs (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:92953)\n    at Zr (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:109169)\n    at Zr (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:109420)\n    at Zr (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:109420)"
          },
          {
            "path": "/analytics",
            "message": "Error: Minified React error #310; visit https://react.dev/errors/310 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.\n    at kt (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:49504)\n    at Object.y2 [as useCallback] (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:56941)\n    at je.useCallback (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:1:8275)\n    at Fr (http://localhost:43657/assets/Analytics-BeV-5CBT.js:1:152820)\n    at Mf (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:48226)\n    at qf (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:71041)\n    at K2 (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:81394)\n    at My (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:117186)\n    at Qx (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:116230)\n    at dd (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:116060)"
          },
          {
            "path": "/analytics",
            "message": "[ErrorService] Object"
          },
          {
            "path": "/analytics",
            "message": "TypeError: Cannot read properties of undefined (reading 'streams')\n    at Fr (http://localhost:43657/assets/Analytics-BeV-5CBT.js:1:160581)\n    at Mf (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:48226)\n    at qf (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:71041)\n    at K2 (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:81184)\n    at My (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:117186)\n    at Qx (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:116230)\n    at dd (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:116060)\n    at gy (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:112843)\n    at Iy (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:124787)\n    at gs (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:123335)"
          },
          {
            "path": "/analytics",
            "message": "[ErrorService] Object"
          }
        ]
      },
      {
        "requestedPath": "/studio",
        "finalPath": "/studio",
        "hydrated": true,
        "crashed": true,
        "permissionOrEmptyState": false,
        "pass": false,
        "visibleText": "Skip to main content\n(Alt+1)\nMax Booster\nBY B-LAWZ MUSIC\n◇ Free\nOVERVIEW\nDashboard\nCREATOR\nProjects\nStudio\nDesktop App\nGROWTH\nAnalytics\nAI Insights\nSocial Media\nAdvertising\nPlaylist Pitching\nFan Hub\nFan Memberships\nA&R Intelligence\nBUSINESS\nMarketplace\nRoyalties\nDistribution\nPublishing\nSync Licensing\nMerch Store\nInvoices\nMANAGE\nContracts\nShows & Tours\nPress Kit\nOutreach CRM\nCollaborations\nWorkspaces\nRelease Countdown\nCareer Coach\nnavigation.assistant\nWorkflow Automations\nVerification\n🇺🇸English\n\naccept_775aa81984d9454c\n\nacceptance-775aa81984d9454c@example.invalid\n\nStudio\nSettings\nSign Out\nSomething went wrong\nunknown\nSomething unexpected happened. Our team has been notified.\nQuick fixes to try\n•\nTry refreshing the page\n•\nClear your browser cache\n•\nContact support if issue persists\nTechnical details\nTry Again\nGo Home\nReport Issue",
        "errors": [
          {
            "path": "/studio",
            "message": "TypeError: Cannot read properties of undefined (reading 'recentProjects')\n    at om (http://localhost:43657/assets/studio-BnKY3-NI.js:22:262175)\n    at Mf (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:48226)\n    at qf (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:71041)\n    at K2 (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:81394)\n    at My (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:117186)\n    at Qx (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:116230)\n    at dd (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:116060)\n    at gy (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:112843)\n    at Iy (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:124787)\n    at gs (http://localhost:43657/assets/vendor-react-NgXmoGGy.js:8:123335)"
          },
          {
            "path": "/studio",
            "message": "[ErrorService] Object"
          }
        ]
      }
    ],
    "public": []
  },
  "nativeSignedOutLogin": {
    "electronBridgePresent": true,
    "hydratedLoginRemainsAccessible": true
  }
}
```

## Sanitized failures

- authenticated browser route acceptance failed; see pageRoutes evidence

## Interpretation

- Real application routes and production static frontend were served from the assembled server process.
- Normal registration/login used the real password hashing, CSRF, session store, and logout paths with a synthetic user; no auth bypass was used.
- A real headless Chromium page hydrated the login UI, submitted the login form, persisted its cookie session, logged out, and captured a pre-credential screenshot.
- A 200 liveness response alone is not treated as readiness. Frontend acceptance requires a real HTML response after the production static handler is active.
- `frontend` records the raw production HTML response; `browser` separately records JavaScript hydration and the real browser form/session journey.
- This result does not disable a failed critical readiness dependency or relabel degraded provider behavior as a pass.
- Passing load thresholds proves only this bounded source-app/ephemeral-PostgreSQL run. It does not prove PDIM, MaxCore, a packed artifact, production capacity, or provider acceptance.

## Still untested

- authenticated browser journeys beyond the completed login/session/logout path
- provider sandbox delivery, OAuth, webhooks, messaging, push, email, social posting, and DSP contracts
- real-money payment, payout, refund, royalty, and financial reconciliation
- production-source restore/upgrade/rollback and durable backup recovery
- local MaxCore inference/model behavior (the only MaxCore implementation; intentionally not started in this bounded non-ML drill)
- Redis/PDIM loss recovery, load/soak, multi-worker clustering, DNS/TLS, and packed cold-image startup
