# Authenticated HTTP load simulation

Decision: **PASS_WITH_UNTESTED_CATEGORIES**

Artifact label: **sealed non-ML authenticated HTTP load; not full-stack or packed acceptance**

## Replay

`env -i PATH="$PATH" HOME=/tmp node scripts/testing/page80-acceptance.mjs`

Run started: 2026-10-28T13:50:34.738Z

Report generated: 2026-10-28T13:51:22.584Z

## Safety boundary

- The runner refuses inherited database, provider, token, key, secret, Sentry, Redis, and Node preload variables.
- The child receives an allowlisted environment, a generated one-run session secret, an ephemeral local PostgreSQL URL, and no provider credentials.
- The real application runs from a disposable working directory. PostgreSQL contains only a generated empty schema; no shared/live database or production data is read.
- A pre-import guard rejects non-loopback TCP/TLS (including direct Socket.connect), all UDP, and child processes. MaxCore local startup, fan delivery, ACME, DNS local startup, and clustering are explicitly off; none is counted as accepted.
- Chromium is intentionally not launched in explicit load-only mode; the default browser flow is unchanged.
- Temporary database, logs, credentials, and working files are removed after the bounded run.

## Executed evidence

```json
{
  "capacityAdmission": {
    "source": "/proc/meminfo MemAvailable and cgroup v2 memory.current, memory.max, memory.stat",
    "hostMemAvailableBytes": 33317040128,
    "cgroup": {
      "currentBytes": 9883475968,
      "maximumBytes": 34359738368,
      "headroomBytes": 24476262400,
      "anonymousBytes": 562925568,
      "filePageCacheBytes": 8345903104,
      "inactiveFileBytes": 402894848,
      "activeFileBytes": 7414452224,
      "kernelBytes": 973524992,
      "reclaimableKernelSlabBytes": 928849768
    },
    "effectiveAvailableBytes": 24476262400,
    "admissionRule": "minimum of host MemAvailable and raw cgroup headroom",
    "reclaimableAccounting": "file/inactive_file page cache and slab_reclaimable are reported only; none is added to raw cgroup headroom",
    "minimumAvailableBytes": 1610612736
  },
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
    "sha256": "4d53766a59955ff8973471d72ac9f3d1e6c7efcc4d9af8c2b7d393977373d804"
  },
  "authHttp": {
    "csrfCookieHeaderBinding": "pass",
    "register": "pass",
    "login": "pass",
    "sessionPersistence": "pass",
    "csrfRejection": "pass",
    "logoutInvalidation": "pass",
    "syntheticUsersRemovedWithDatabase": true
  },
  "httpLoad": {
    "label": "source application HTTP simulation; not packed application acceptance",
    "admission": {
      "source": "/proc/meminfo MemAvailable and cgroup v2 memory.current, memory.max, memory.stat",
      "hostMemAvailableBytes": 33317040128,
      "cgroup": {
        "currentBytes": 9883475968,
        "maximumBytes": 34359738368,
        "headroomBytes": 24476262400,
        "anonymousBytes": 562925568,
        "filePageCacheBytes": 8345903104,
        "inactiveFileBytes": 402894848,
        "activeFileBytes": 7414452224,
        "kernelBytes": 973524992,
        "reclaimableKernelSlabBytes": 928849768
      },
      "effectiveAvailableBytes": 24476262400,
      "admissionRule": "minimum of host MemAvailable and raw cgroup headroom",
      "reclaimableAccounting": "file/inactive_file page cache and slab_reclaimable are reported only; none is added to raw cgroup headroom",
      "minimumAvailableBytes": 1610612736
    },
    "thresholds": {
      "minimumSuccessPercent": 99,
      "maximumP95Ms": 500,
      "maximumP99Ms": 1000
    },
    "settings": {
      "phases": [
        {
          "name": "steady",
          "workers": 10,
          "durationSeconds": 20
        },
        {
          "name": "spike",
          "workers": 20,
          "durationSeconds": 10
        }
      ],
      "accounts": 10,
      "clientAddressModel": "One stable TEST-NET address per simulated browser session through the local trusted proxy",
      "sessions": 20,
      "pacingMs": 3000,
      "requestTimeoutMs": 15000,
      "maximumRequestBodyBytes": 1024,
      "appMaxOldSpaceMiB": 768,
      "overlappingRequestsPerVirtualUser": false,
      "percentileMethod": "nearest-rank over all completed request durations, including failures"
    },
    "callbacks": [
      {
        "name": "session-read",
        "method": "GET",
        "path": "/api/auth/me"
      },
      {
        "name": "project-read",
        "method": "GET",
        "path": "/api/projects"
      },
      {
        "name": "session-write",
        "method": "POST",
        "path": "/api/auth/heartbeat"
      },
      {
        "name": "project-write",
        "method": "POST",
        "path": "/api/projects"
      }
    ],
    "coverage": {
      "actualRegistrationAndLogin": true,
      "sessionRead": true,
      "csrfProtectedSessionWrite": true,
      "projectRead": true,
      "projectWrite": true,
      "projectWriteProbeStatus": 200,
      "missingCsrfRejected": true,
      "logoutSessionRevoked": true,
      "durableLoadGeneratorWorker": false
    },
    "phases": [
      {
        "name": "steady",
        "workers": 10,
        "configuredDurationSeconds": 20,
        "count": 70,
        "successful": 70,
        "failed": 0,
        "successPercent": 100,
        "p95Ms": 308.680022,
        "p99Ms": 356.119224,
        "durationDefinition": "all completed request durations, including failed requests"
      },
      {
        "name": "spike",
        "workers": 20,
        "configuredDurationSeconds": 10,
        "count": 80,
        "successful": 80,
        "failed": 0,
        "successPercent": 100,
        "p95Ms": 375.381277,
        "p99Ms": 397.717012,
        "durationDefinition": "all completed request durations, including failed requests"
      }
    ],
    "failures": [],
    "thresholdFailures": []
  },
  "browser": "intentionally skipped only for explicit --http-load mode",
  "egressGuard": "pass (external net.connect, direct Socket.connect, UDP, and child processes denied in preflight)",
  "cleanup": "pass",
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


## Interpretation

- Real application routes and production static frontend were served from the assembled server process.
- Normal registration/login used the real password hashing, CSRF, session store, and logout paths with a synthetic user; no auth bypass was used.
- Explicit load-only mode did not launch Chromium; the default invocation retains its browser flow.
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
- Redis/PDIM loss recovery, soak, multi-process clustering, DNS/TLS, browser UI, and packed cold-image startup
