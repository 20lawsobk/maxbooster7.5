# Browser, page and HTTP integration tests

These suites exercise different boundaries. The five focused browser tests use
real Chromium and actual React/audio modules with controlled I/O fixtures. The
80-page acceptance runner starts the real application and a disposable
PostgreSQL database. The Vitest HTTP integration suites also use a disposable
application/database through the wrapper below. None of these runs certifies
live payments, public publishing, provider delivery, learned-model quality,
native Linux VST3 processing, or a published Replit deployment.

## Prerequisites

Use Node 22.12 or newer and install the root lockfile with `npm ci`. The browser
tests use the root `esbuild`, React, `ws` and application dependencies. Install
Chromium on Linux; the tests find `/usr/bin/chromium` or
`/usr/bin/chromium-browser`, or accept `CHROMIUM_PATH` for the focused tests.

Application integration additionally requires PostgreSQL tools (`initdb`,
`pg_ctl`), the installed Drizzle CLI, and a completed `npm run build` so that
`dist/public` contains the actual frontend. The real MaxCore supervisor test
also needs the installed imported workspace and its Python dependencies. Set
`MAXBOOSTER_PYTHON` to the configured Python executable when it is outside the
default runtime. This selects an interpreter; it does not supply a model or
make readiness succeed.

The cloud used for the recorded run activates its tools with:

```sh
export PATH=/workspace/.cloud-system/usr/lib/postgresql/17/bin:/workspace/.cloud-system/usr/bin:/workspace/.cloud-tools/node_modules/.bin:$PATH
export LD_LIBRARY_PATH=/workspace/.cloud-system/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
```

Those activation paths are specific to this cloud. On Replit or another Linux
host, use the tools installed by that environment and the repository's Nix
configuration. No cloud paths are embedded in the reusable runners.

## Focused browser tests

Run one file from the repository root:

```sh
env -i PATH="$PATH" LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}" HOME=/tmp LANG=C \
  CHROMIUM_PATH=/usr/bin/chromium \
  node --test tests/studio-plugin-audio-browser.test.mjs
```

Run all five serially:

```sh
env -i PATH="$PATH" LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}" HOME=/tmp LANG=C \
  CHROMIUM_PATH=/usr/bin/chromium node --test --test-concurrency=1 \
  tests/auth-session-transient-browser.test.mjs \
  tests/local-media-renderer-browser.test.mjs \
  tests/studio-load-save-guard.test.mjs \
  tests/studio-plugin-audio-browser.test.mjs \
  tests/storefront-hook-transition.test.mjs
```

| Test file | What it verifies |
| --- | --- |
| `tests/auth-session-transient-browser.test.mjs` | A verified account survives an HTTP 429 session probe; cold session retries do not falsely redirect to signed out UI. |
| `tests/local-media-renderer-browser.test.mjs` | Explicit image/audio/video renderer errors, retries, delivered previews and cancellation on unmount. Generation transport is controlled, so this is not media-model quality evidence. |
| `tests/studio-load-save-guard.test.mjs` | Saves are blocked before a successful project read; verified empty projects can save; track/master processor types, parameters and bypass survive save/reopen; changing projects resets the save guard. |
| `tests/studio-plugin-audio-browser.test.mjs` | Actual Chromium audio rendering through the Studio playback engine: all eight supported browser effects, parameter edits, bypass, instance independence, ordering, removal of the final insert and master processing. This does not load Windows or Linux VST3 binaries. |
| `tests/storefront-hook-transition.test.mjs` | Real React hook order remains valid across loading, loaded, missing and owner-preview storefront states. Checkout/provider transport is controlled. |

Each file owns its temporary HTTP server and Chromium profile. The shared
`tests/helpers-browser-processes.mjs` tracks process identities while Chromium
runs and stops owned descendants before profile deletion. It does not kill
processes by executable name or port.

## HTTP integration suites

Do not aim these mutation suites at the running developer server or a shared
database. The legacy direct command, `npm run test:integration`, expects an
already running application and its teardown can delete matching test users.
Use the isolated wrapper for a fresh, reproducible run:

```sh
env -i PATH="$PATH" LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}" HOME=/tmp LANG=C \
  MAXBOOSTER_PYTHON=/path/to/configured/python \
  node scripts/testing/integration-browser.mjs
```

To run one suite, append its repository-relative path:

```sh
env -i PATH="$PATH" LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}" HOME=/tmp LANG=C \
  MAXBOOSTER_PYTHON=/path/to/configured/python \
  node scripts/testing/integration-browser.mjs tests/auth-flows.test.ts
```

Omit the `MAXBOOSTER_PYTHON` assignment when the normal interpreter/runtime is
already configured. The wrapper rejects inherited database/provider credentials
and Node preloads, creates its own loopback database and schema, assigns
ephemeral application ports, and passes `TEST_BASE_URL` itself. It denies
external TCP/TLS and UDP for the app and test processes. Local supervisor child
processes are tracked and cleaned up. The PostgreSQL instance and temporary
working directory are destroyed even when assertions fail.

The optional `MAXBOOSTER_TEST_REPORT_DIR` selects an output directory. Its
default is `reports/test-verification/integration-browser/http`. The runner
writes one JUnit report, `summary.json`, and sanitized setup/application/test
logs. Exit zero means the selected assertions passed; exit one means an
assertion or fixture failed. Preserve failing artifacts when investigating.

For each row below, use the same wrapper command and append the listed file:

| Suite | Purpose and additional requirements |
| --- | --- |
| `tests/health.test.ts` | Application liveness/readiness response contracts and protected endpoint behavior. |
| `tests/api-guards.test.ts` | Authentication and validation boundaries across API routes. |
| `tests/auth-flows.test.ts` | Registration, login/session handling and provider OAuth initiation/callback error paths. Real provider completion is outside the isolated run. |
| `tests/security-hardening.test.ts` | HTTP security headers, request/body validation and authorization boundaries. |
| `tests/webhook-security.test.ts` | Stripe/provider webhook signature rejection and malformed event handling. |
| `tests/critical-paths.test.ts` | Registration, projects, marketplace and other critical HTTP journeys; now honors the fixture's `TEST_BASE_URL`. |
| `tests/audit-persistence.test.ts` | Real SQL persistence, canonical audit field mapping and confirmed/idempotent audit writes. Uses only the wrapper's temporary database. |
| `tests/paid-user-e2e.test.ts` | Broad paid-user application contracts, real authentication/billing limit assertions and persisted records; provider-positive cases explicitly skip in the sealed fixture while unavailable-provider responses remain asserted. |
| `tests/ai-analytics-integration.test.ts` | Fanbase, analytics and prediction route response/authorization contracts. Some assertions permit unauthenticated responses and therefore do not prove successful authenticated analytics. |
| `tests/cache-invalidation.test.ts` | HTTP cache behavior after mutations and account isolation. |
| `tests/unit/cache-cross-pod.test.ts` | Two-pod cache invalidation simulation using controlled PDIM state; no real multi-host delivery is claimed. |
| `tests/file-management.test.ts` | User-scoped file listing, upload, byte readback and deletion; both private hybrid download routes reject a second fixture owner. |
| `tests/direct-upload.test.ts` | Direct upload flow and ownership/error handling; remote storage configuration is not provided by the fixture. |
| `tests/billing-lifecycle.test.ts` | Real signed-webhook rejection/provider-authority checks, persisted tier transitions, event deduplication and subscription response shape. Fixture-owned customer writes require the isolated database guard. No live provider delivery is implied. |
| `tests/auth-2fa.test.ts` | Authenticator enrollment/challenge/verification and recovery/session boundaries. |
| `tests/feature-press-pitching-ar.test.ts` | Press kits, venues/booking, playlist/radio pitches, label submissions and shows. |
| `tests/feature-catalog-production.test.ts` | Catalog and production feature API operations. |
| `tests/feature-revenue-merch.test.ts` | Revenue, merchandise and related feature response contracts; no live sale or payout occurs. |
| `tests/feature-marketplace-distribution.test.ts` | Marketplace and distribution route contracts with fixture-owned records; no provider submission occurs. |
| `tests/feature-storefront-dns.test.ts` | Storefront CRUD, DNS-manager and domain registrar configuration/error contracts; no domain purchase or live DNS publication occurs. |
| `tests/integration/maxcore-local-supervisor.integration.test.ts` | Real local MaxCore/Python and owned PDIM launch, authenticated health and shutdown on ephemeral ports with temporary private state. The deliberately absent inference candidate must report `model_loaded=false` and generation readiness false; this is lifecycle proof rather than generation acceptance. |

## Eighty-page acceptance

```sh
env -i PATH="$PATH" LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}" HOME=/tmp LANG=C \
  node scripts/testing/page80-acceptance.mjs
```

This promotes the previously cloud-local acceptance runner into a portable,
versioned test. It checks 42 authenticated, 11 administrator and 27 public page
scenarios in actual Chromium, including fixture-owned detail records. It also
exercises ordinary password/CSRF/session login, logout, TOTP, saved preferences,
workspace permissions, press kit persistence and project CRUD/versioning.

The runner creates its own database and fixture users, uses the production
frontend, denies application external network access and child processes, and
removes its database and app at the end. MaxCore is intentionally absent from
this sealed fixture. Its readiness contract accepts only the specifically
expected ML-unavailable `503` while requiring the fixture's database, Redis and
routes to be healthy. A generic `503` does not pass. The current integrated
run passed this scoped predicate. Its decision remains
`PASS_WITH_UNTESTED_CATEGORIES`; full aggregate readiness is not established.

Outputs go to `reports/test-verification/integration-browser/page80` by default;
set `MAXBOOSTER_TEST_REPORT_DIR` before the Node command to retain another run.
The JSON includes every page scenario and observed API response. The screenshot
is taken before credential entry. `--http-load` selects the existing bounded
authenticated HTTP-load mode and deliberately skips Chromium; it does not run
the 80-page sweep, so do not report it as page coverage.

## Recorded results

The completed October 26 integrated master run at checkout baseline `4c72114a`
plus its recorded source digest passed all five focused browser tests. Its
receipt is `integration-browser/browser-run.json`;
the actual command output is `orchestration/browser.txt` under
`reports/test-verification/`.

All 80 page-render observations passed (42 authenticated, 11 administrator and
27 public), and cleanup passed. The page acceptance result is
**PASS_WITH_UNTESTED_CATEGORIES**: the final readiness predicate accepted only
the specifically expected non-ML `503` with healthy fixture dependencies.
Saved-data journeys and page observations are retained individually in
`integration-browser/page80/page80.json`.
They do not prove every interaction or successful semantic generation.

The same HTTP run recorded **478 passed, 5 failed and 9 skipped cases** across
21 files. Its failures concern the analytics authorization contract and
critical-path checks affected by intentional hostile-client probes. Repairs and
the final rerun remain distinct from these preserved outcomes. Inspect
`integration-browser/http/summary.json`, its JUnit XML, the consolidated
[results](results.md) and [fix checklist](remediation.md).

The separate bounded HTTP profile also passed: 70 requests with 10 workers over
20 seconds, then 80 requests with 20 workers over 10 seconds, each with 100%
success. The measured p95 latencies were 159.00 ms and 331.20 ms; p99 latencies
were 174.11 ms and 357.58 ms. Sessions were paced by 3 seconds between requests.
This source-application measurement is not a global concurrency or soak test.
See `integration-browser/http-load/page80.json` for actual callbacks and limits.

Earlier attempts are preserved under `http-before-registration-update/`,
`http-initial/` and the existing historical browser artifacts. The old
`browser-page80-summary.json` describes the earlier `f5716662` baseline and is
not the current acceptance verdict. The invalid initial mixed JSON/JUnit output
must not be parsed as a valid run. The consolidated reporter uses fresh artifacts
from the current master invocation.

The [completed pre-recheck master](../../reports/test-verification/history/2026-10-26-integrated-before-rechecks/README.md)
preserves its original reports and source inventory before the final rerun.
