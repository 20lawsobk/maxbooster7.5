# Authenticated HTTP load simulation

Decision: **PASS_WITH_UNTESTED_CATEGORIES**

Artifact label: **source application authenticated HTTP simulation; not packed application acceptance**

## Replay

`env -i PATH="$PATH" HOME=/tmp node scripts/readiness-assembled-acceptance.mjs --http-load`

Run started: 2026-09-23T15:08:39.019Z

Report generated: 2026-09-23T15:09:38.710Z

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
    "hostMemAvailableBytes": 4746096640,
    "cgroup": {
      "currentBytes": 2129342464,
      "maximumBytes": 8589934592,
      "headroomBytes": 6460592128,
      "anonymousBytes": 1172770816,
      "filePageCacheBytes": 874819584,
      "inactiveFileBytes": 252100608,
      "activeFileBytes": 609972224,
      "kernelBytes": 80171008,
      "reclaimableKernelSlabBytes": 0
    },
    "effectiveAvailableBytes": 4746096640,
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
    "sha256": "ed615b681ce2448b892b13749f3b828d32eb802432420ffc63424f59652ab563"
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
      "hostMemAvailableBytes": 4746096640,
      "cgroup": {
        "currentBytes": 2129342464,
        "maximumBytes": 8589934592,
        "headroomBytes": 6460592128,
        "anonymousBytes": 1172770816,
        "filePageCacheBytes": 874819584,
        "inactiveFileBytes": 252100608,
        "activeFileBytes": 609972224,
        "kernelBytes": 80171008,
        "reclaimableKernelSlabBytes": 0
      },
      "effectiveAvailableBytes": 4746096640,
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
        "p95Ms": 273.864519,
        "p99Ms": 329.542474,
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
        "p95Ms": 396.740921,
        "p99Ms": 492.552765,
        "durationDefinition": "all completed request durations, including failed requests"
      }
    ],
    "failures": [],
    "thresholdFailures": []
  },
  "browser": "intentionally skipped only for explicit --http-load mode",
  "egressGuard": "pass (external net.connect, direct Socket.connect, UDP, and child processes denied in preflight)",
  "cleanup": "pass"
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

- authenticated browser journeys beyond the completed login/session/logout path
- provider sandbox delivery, OAuth, webhooks, messaging, push, email, social posting, and DSP contracts
- real-money payment, payout, refund, royalty, and financial reconciliation
- production-source restore/upgrade/rollback and durable backup recovery
- local MaxCore inference/model behavior (the only MaxCore implementation; intentionally not started in this bounded non-ML drill)
- Redis/PDIM loss recovery, soak, multi-process clustering, DNS/TLS, browser UI, and packed cold-image startup
