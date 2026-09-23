# Authenticated HTTP load simulation

Decision: **FAIL**

Artifact label: **source application authenticated HTTP simulation; not packed application acceptance**

## Replay

`env -i PATH="$PATH" HOME=/tmp node scripts/readiness-assembled-acceptance.mjs --http-load`

Run started: 2026-09-23T13:51:37.405Z  
Report generated: 2026-09-23T13:51:37.456Z

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
  "schemaGeneration": "not_run",
  "postgres": "not_run",
  "appProcess": "not_run",
  "health": "not_run",
  "readiness": "not_run",
  "frontend": "not_run",
  "authHttp": "not_run",
  "httpLoad": "not_run",
  "browser": "not_run",
  "egressGuard": "not_run",
  "cleanup": "pass"
}
```

## Sanitized failures

- HTTP load capacity admission denied before PostgreSQL/application startup: less than 1536 MiB available

## Interpretation

- The assembled startup did not reach sufficient evidence for an acceptance observation.
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
