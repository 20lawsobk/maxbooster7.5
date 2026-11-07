# Authenticated HTTP load simulation

Decision: **PASS_WITH_UNTESTED_CATEGORIES**

Artifact label: **sealed non-ML authenticated HTTP load; not full-stack or packed acceptance**

## Replay

`env -i PATH="$PATH" HOME=/tmp node scripts/testing/page80-acceptance.mjs`

Run started: 2026-11-07T00:08:50.642Z

Report generated: 2026-11-07T00:09:44.391Z

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
  "accessProfile": "public launch explicitly enabled for this disposable registration/browser fixture; admin-only policy is covered by separate contract tests",
  "capacityAdmission": {
    "source": "/proc/meminfo MemAvailable and cgroup v2 memory.current, memory.max, memory.stat",
    "hostMemAvailableBytes": 9335582720,
    "cgroup": {
      "currentBytes": 5181894656,
      "maximumBytes": 17179869184,
      "headroomBytes": 11997974528,
      "anonymousBytes": 2219634688,
      "filePageCacheBytes": 2813411328,
      "inactiveFileBytes": 538189824,
      "activeFileBytes": 588902400,
      "kernelBytes": 146481152,
      "reclaimableKernelSlabBytes": 0
    },
    "effectiveAvailableBytes": 9335582720,
    "admissionRule": "minimum of host MemAvailable and raw cgroup headroom",
    "reclaimableAccounting": "file/inactive_file page cache and slab_reclaimable are reported only; none is added to raw cgroup headroom",
    "minimumAvailableBytes": 1610612736
  },
  "schemaGeneration": "pass",
  "postgres": "pass",
  "appProcess": "pass",
  "cpuProfile": "not_requested",
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
    "sha256": "ef3641c2a61ce3a60f628b6ae1e17adc4a73e39f9a161de7d5a92d23d9792f31"
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
      "hostMemAvailableBytes": 9335582720,
      "cgroup": {
        "currentBytes": 5181894656,
        "maximumBytes": 17179869184,
        "headroomBytes": 11997974528,
        "anonymousBytes": 2219634688,
        "filePageCacheBytes": 2813411328,
        "inactiveFileBytes": 538189824,
        "activeFileBytes": 588902400,
        "kernelBytes": 146481152,
        "reclaimableKernelSlabBytes": 0
      },
      "effectiveAvailableBytes": 9335582720,
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
      "databasePoolSize": 15,
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
        "p95Ms": 226.662248,
        "p99Ms": 241.957499,
        "durationDefinition": "all completed request durations, including failed requests",
        "operationLatencyMs": {
          "session-read": {
            "count": 17,
            "p50": 184.657485,
            "p95": 241.957499,
            "p99": 241.957499,
            "serverTimedCount": 17,
            "serverP95Ms": 225.1
          },
          "project-read": {
            "count": 18,
            "p50": 151.587413,
            "p95": 190.881306,
            "p99": 190.881306,
            "serverTimedCount": 18,
            "serverP95Ms": 174.65
          },
          "session-write": {
            "count": 18,
            "p50": 183.315076,
            "p95": 230.475526,
            "p99": 230.475526,
            "serverTimedCount": 18,
            "serverP95Ms": 220.62
          },
          "project-write": {
            "count": 17,
            "p50": 148.943693,
            "p95": 184.025871,
            "p99": 184.025871,
            "serverTimedCount": 17,
            "serverP95Ms": 168.74
          }
        }
      },
      {
        "name": "spike",
        "workers": 20,
        "configuredDurationSeconds": 10,
        "count": 80,
        "successful": 80,
        "failed": 0,
        "successPercent": 100,
        "p95Ms": 362.574475,
        "p99Ms": 394.793265,
        "durationDefinition": "all completed request durations, including failed requests",
        "operationLatencyMs": {
          "session-read": {
            "count": 20,
            "p50": 332.370361,
            "p95": 362.574475,
            "p99": 394.793265,
            "serverTimedCount": 20,
            "serverP95Ms": 351.79
          },
          "project-read": {
            "count": 20,
            "p50": 243.436792,
            "p95": 284.287691,
            "p99": 296.490884,
            "serverTimedCount": 20,
            "serverP95Ms": 275.82
          },
          "session-write": {
            "count": 20,
            "p50": 318.760351,
            "p95": 370.57765,
            "p99": 385.150303,
            "serverTimedCount": 20,
            "serverP95Ms": 357.36
          },
          "project-write": {
            "count": 20,
            "p50": 244.890448,
            "p95": 279.228927,
            "p99": 283.631043,
            "serverTimedCount": 20,
            "serverP95Ms": 267.16
          }
        }
      }
    ],
    "systemHealthDiagnostics": {
      "status": 200,
      "databaseQueries": {
        "total": 1000,
        "slow": 0,
        "p95Ms": 5,
        "avgMs": 1.64
      },
      "scalableRateLimiting": {
        "global": {
          "requests": 205,
          "inProcessFallbackRequests": 0,
          "pdimSyncAttempts": 205,
          "pdimSyncFailures": 0,
          "pdimEvalErrors": 0,
          "recentMiddlewareSamples": 205,
          "recentMiddlewareP95Ms": 93.379042,
          "recentPdimSyncSamples": 205,
          "recentPdimSyncP95Ms": 91.496216
        },
        "api": {
          "requests": 0,
          "inProcessFallbackRequests": 0,
          "pdimSyncAttempts": 0,
          "pdimSyncFailures": 0,
          "pdimEvalErrors": 0,
          "recentMiddlewareSamples": 0,
          "recentMiddlewareP95Ms": null,
          "recentPdimSyncSamples": 0,
          "recentPdimSyncP95Ms": null
        },
        "ai": {
          "requests": 0,
          "inProcessFallbackRequests": 0,
          "pdimSyncAttempts": 0,
          "pdimSyncFailures": 0,
          "pdimEvalErrors": 0,
          "recentMiddlewareSamples": 0,
          "recentMiddlewareP95Ms": null,
          "recentPdimSyncSamples": 0,
          "recentPdimSyncP95Ms": null
        },
        "auth": {
          "requests": 0,
          "inProcessFallbackRequests": 0,
          "pdimSyncAttempts": 0,
          "pdimSyncFailures": 0,
          "pdimEvalErrors": 0,
          "recentMiddlewareSamples": 0,
          "recentMiddlewareP95Ms": null,
          "recentPdimSyncSamples": 0,
          "recentPdimSyncP95Ms": null
        }
      },
      "components": {
        "process": "reported",
        "database": "reported",
        "memory": "reported",
        "server": "reported",
        "offlineCache": "unavailable"
      }
    },
    "failures": [],
    "thresholdFailures": []
  },
  "browser": "intentionally skipped only for explicit --http-load mode",
  "egressGuard": "pass (external net.connect, direct Socket.connect, UDP, and child processes denied in preflight)",
  "cleanup": "pass",
  "registrationPolicyFixture": "public registration explicitly enabled in disposable PostgreSQL after default seeding",
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
