# Account analytics contracts and verification

The main authenticated `/api/ai/analytics/predict` and `/api/ai/analytics/insights` routes now call dedicated MaxCore statistical contracts. The application selects only the session owner's recorded PostgreSQL observations. MaxCore computes the result; the application does not substitute a local model, caption generator, or fabricated forecast when MaxCore fails.

These contracts provide measured summaries and an explicitly identified ordinary least squares baseline. They do not provide causal business reasoning, calibrated predictive accuracy, or guaranteed performance. A trained checkpoint is not required for these computations. Their presence does not establish readiness of unrelated text, image, audio, video, churn, platform revenue, anomaly, or legacy insight capabilities.

## API behavior

| Main application route | Canonical MaxCore route | Behavior |
| --- | --- | --- |
| `GET /api/ai/analytics/insights/capability` | `GET /api/analytics/capability` | Requires a real dedicated version 1 capability marker, supported methods and periods, no trained-model requirement, and no private-data retention. An unavailable upstream returns 503 with `available:false`. |
| `POST /api/ai/analytics/predict` | `POST /api/analytics/predict` | Accepts `metric: streams | revenue | engagement`, `timeframe: 7d | 30d | 90d`. Returns the existing `{success:true,data:...}` envelope. |
| `POST /api/ai/analytics/insights` | `POST /api/analytics/insights` | Accepts an optional timeframe, defaulting to 30d, and returns a measured-summary contract directly for `/analytics/ai`. |

The application ignores caller-supplied account identity, history points, and date-window overrides. The server chooses a UTC window containing complete days, inclusive at its start and exclusive at its end. Missing days remain unobserved. Current incomplete days are excluded. Daily inputs are finite nonnegative recorded values, capped at 1e12 per day; unsupported or invalid recorded values fail explicitly. Revenue remains in recorded source units, not a settlement calculation or a verified currency conversion. Listener totals are sums of daily observations and may count the same person on several days or platforms.

The forecast uses elapsed calendar days, including gaps. It requires at least seven observed days spanning six days and covering at least half the requested window. Its horizon is seven days for 7d and thirty days for 30d/90d, beginning at the exclusive window end. Confidence and accuracy are `null`, not invented percentages. The response includes a residual Student-t 95% prediction interval and explicit linearity, independent residual and constant-variance assumptions. These conditional intervals are not guarantees or externally calibrated quality claims.

Empty or sparse histories return `status:insufficient_history`, empty predictions, and no fabricated zero performance. Empty summaries have null metric totals. The gateway checks the returned method, observation accounting, exact forecast dates and horizon, and summary totals against the requested owned inputs before accepting them.

Daily engagement acquisition remains **unavailable**. Existing `posts.engagement` values are current/lifetime post counters, not timestamped daily reaction reports. They are not regrouped by publication date and presented as daily acquisitions. That request returns `insufficient_history` and `sourceAvailability.code:DAILY_ENGAGEMENT_REPORTS_UNAVAILABLE`. Closing this gap requires authenticated provider reporting periods or an idempotent timestamped counter-delta ingestion pipeline, including resets/deletions and duplicate-observation handling. Configured API keys alone do not create that history.

## Private analytics and public awareness

Account aggregates are transient private request inputs. This path makes no storage, training, live-learner, or public-awareness ingestion call. It contains no response cache shared between accounts. The browser query key includes the authenticated account identity and waits for authentication to finish.

MaxCore reads its current public snapshot separately and returns validated, unexpired snapshot metadata if available. It never sends account observations into that public engine. The response states `usedForForecast:false`: public trends do not establish a causal adjustment to a private account's forecast. When the public snapshot is unavailable, the observed statistics still work and the UI identifies the missing public context. No public feed refresh is started by these requests.

## Tests and commands

Run from the repository root with Node 22.23.3 or another supported release, installed dependencies, PostgreSQL 17 tools on `PATH`, and the prepared portable Python runtime. The Python suite also needs FastAPI, Pydantic 2, pytest and coverage. Browser checks require a real Chromium executable; they fail rather than skip when it is missing.

```sh
node --import tsx --test tests/account-analytics-contract.test.mjs
node --test tests/account-analytics-browser.test.mjs
npx vitest run --config vitest.config.ts tests/unit/account-analytics-proxy.test.ts
python3 -m pytest tests/testing/test_maxcore_analytics.py -q
```

| Test | What it actually verifies |
| --- | --- |
| `tests/account-analytics-contract.test.mjs` | Starts a disposable socket-only PostgreSQL instance and the actual canonical Python router over owned loopback HTTP. Runs the real account aggregation and control transport. Checks exact forecasts/totals, foreign owner exclusion, UTC boundaries, sparse and empty histories, fractional revenue, invalid storage values, capability admission, malformed protocol/timeline/counter/summary rejection and explicit upstream failure. No configured database or provider is used. |
| `tests/account-analytics-browser.test.mjs` | Runs the real routed AIDashboard component with React DOM and the installed Query v5 in Chromium. Checks auth loading, pending requests, CSRF POST, button state, measured summary, UTC end exclusion, errors/retry, malformed 200 response, insufficient history, unavailable public context, account cache isolation, logout and unmount. Authentication/layout/data delivery are declared owned boundaries; this does not prove real provider delivery. |
| `tests/unit/account-analytics-proxy.test.ts` | Exercises real imported MaxCore Express proxy routes during model warmup, with transport mocked explicitly. Checks authentication, ten-second upstream deadlines, exact path/body/header forwarding, absence of injected identity fields in numeric bodies, and upstream503 propagation. It does not claim actual model inference. |
| `tests/testing/test_maxcore_analytics.py` | Exercises actual FastAPI ASGI routes and the real numerical implementation: auth, strict bounded requests, finite JSON, date validation, calendar gaps, known trends, residual uncertainty, null accuracy, empty/zero histories, factual totals/comparisons, public snapshot expiry/failure, and no private learning/retention. |
| `tests/ai-analytics-integration.test.ts` | Uses actual application registration, password/session/CSRF handling, owner SQL and canonical MaxCore HTTP analysis. Checks known owner forecasts and summaries, hostile body identity/history, auth/validation, source-insufficient engagement, a bounded upstream503 injection and recovery, plus existing fanbase/anomaly/dashboard contracts. |

For the real main-application HTTP suite, start the existing owned runner from a clean environment. Add only tool paths and required shared-library paths; never pass application credentials or a real database URL:

```sh
env -i PATH="$PATH" HOME=/tmp LANG=C.UTF-8 \
  MAXBOOSTER_PYTHON=/absolute/path/to/prepared/python \
  MAXBOOSTER_TEST_REPORT_DIR=/tmp/account-analytics-http \
  node scripts/testing/integration-browser.mjs tests/ai-analytics-integration.test.ts
```

The runner creates its own database, fixture proof, channel token, private Python child and application process. The Python fixture imports the **actual analytics router only** and has no general model, generation, `/ready` implementation, scheduler, feed fetcher, database connection or learning process. Nonanalytics capabilities remain absent. Its test-only outage control is authenticated, expires within five seconds and never appears in production code. Process ownership and database cleanup are included in the runner receipt.

To collect optional **module-only** Python coverage without implying platform coverage:

```sh
COVERAGE_FILE=/tmp/account-analytics.coverage python3 -m coverage run \
  --branch --include='*/ai_model/analytics.py' \
  -m pytest tests/testing/test_maxcore_analytics.py -q
COVERAGE_FILE=/tmp/account-analytics.coverage python3 -m coverage json \
  -o /tmp/account-analytics-coverage.json
```

Use the master runner for the full repository, its unchanged 100% platform coverage thresholds, other capabilities and source freshness gates. New Node/Python/unit files are discoverable through the existing catalogs; no evidence here lowers those gates.

The source-bound focused evidence, development failures and instructions are retained under `reports/analytics-acceptance/2026-10-27/`. This is isolated source acceptance, not a deployed Replit, production Neon migration, provider-history ingestion, global capacity or full-platform launch certificate.
