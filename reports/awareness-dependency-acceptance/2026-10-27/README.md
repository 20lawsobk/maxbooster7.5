# Required awareness dependency classification

The fixed internal public-awareness snapshot request now reports dependency unavailability as503 when MaxCore returns an error, times out, or returns an unreadable response. Its received error is retained in `MaxCoreControlError.details` for diagnosis. Successful missing/empty/unready/expired receipts remain fail-closed. No caller input, local template or stale snapshot replaces required awareness.

Only `server/services/generationAwareness.ts` changed in production. Shared transport status policy and route authorization remain unchanged. This addresses the real Career Coach500 exposed when the genuine analytics-only MaxCore test fixture correctly returned404 for its absent awareness endpoint. It does not implement a new career-coaching reasoning capability or turn the analytics-only fixture into a general model server.

| Check | Before | After |
| --- | --- | --- |
| New required-awareness unit matrix | 55 cases: 23 passed, 32 failed | All55 passed |
| Unit matrix plus existing thin-transport and optional-awareness regressions | Not used as a before claim | All70 passed |
| Real main HTTP revenue/merch/Career Coach suite | 37 cases: 36 passed, one failed because authenticated Career Coach returned500 | All37 passed; unavailable Career Coach returns503 |
| Real main HTTP suite plus analytics owner/auth/validation/outage regressions | Not used as a before claim | All56 passed, zero skipped/errors |
| Server TypeScript and focused ESLint | Not used as a before claim | Both exit0 |

Before/after XML, application logs, runner receipts, types/lint logs and source hashes are preserved here. The before generation-helper hash matches both its tracked HEAD blob and the preceding read-only RAM probe. The new55-case test file stayed unchanged across the failing and passing executions. No assertion was relaxed to accept500.

`tests/unit/required-awareness-dependency.test.ts` executes the actual MaxCore client, control transport and required-generation helper. Its HTTP/config/logger boundaries are explicitly owned fixtures. Both generation and inference paths cover internal snapshot400/401/403/404/405/408/422/429/500/502/503/504, network/timeout errors, invalid JSON/HTML, expired/unready/empty receipts, fresh text/image/audio receipts, no content POST on dependency failure, preserved caller input, and release of the real bulkhead/half-open probe. It separately proves that the shared transport still preserves legitimate400/401/403/404 statuses and that private analytics endpoints do not acquire public awareness. The real HTTP suites additionally prove public session401 and analytics input400 behavior.

Run the unit matrix and adjacent regressions from the repository root:

```sh
npx vitest run --config vitest.config.ts \
  tests/unit/required-awareness-dependency.test.ts \
  tests/unit/maxcore-client-thin-transport.test.ts \
  server/services/__tests__/unifiedAwarenessContext.test.ts
```

Run the actual main-application journey using the owned runner, with PostgreSQL tools and prepared Python available. Start with a clean environment; never pass configured application credentials or a shared/production database:

```sh
env -i PATH="$PATH" HOME=/tmp LANG=C.UTF-8 \
  MAXBOOSTER_PYTHON=/absolute/path/to/prepared/python \
  MAXBOOSTER_TEST_REPORT_DIR=/tmp/required-awareness-http \
  node scripts/testing/integration-browser.mjs \
    tests/feature-revenue-merch.test.ts tests/ai-analytics-integration.test.ts
```

The runner creates its own database and process tree. Both retained runs report zero remaining owned application/test/analytics processes and successful PostgreSQL cleanup. The MaxCore child hosts the actual canonical analytics router only; unrelated awareness, model and general generation endpoints remain absent. That absence remains an honest503 through the application, not fabricated output.

The unchanged full-platform100% coverage, exhaustive feature acceptance, deployed Replit/provider journeys, migration/recovery, native build and global-capacity gates remain separate. `productionReady:false` is retained. `manifest.json` hashes all artifacts, and `source-hashes.json` identifies the exact focused final inputs.
