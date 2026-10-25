# Commerce and Beat Money Loop tests

Run the complete credential-free commerce scope from the repository root:

```sh
python3 scripts/testing/run-commerce.py
```

This runs every payment-processing file that imports `node:test`, including
legacy `inbound-known-failures.mjs` and `outbound-*.mjs` files that a
`*.test.mjs` glob would miss. It also runs the separately configured
`tests/unit/beat-sale-money-loop.test.ts` on owned temporary PostgreSQL and
Redis instances, and the provider report's offline aggregation/redaction
self-check. It does not start the application, use the application
database, or submit provider requests with inherited credentials.

Required tools are Node 22+, Python 3, installed root npm dependencies,
PostgreSQL 17 (`initdb`, `pg_ctl`), Redis (`redis-server`), and FFmpeg. They are
declared by `replit.nix`; outside Replit, put them on `PATH` first. PostgreSQL
must run as a non-root user. The runner preserves the tool `PATH` and optional
`LD_LIBRARY_PATH`, creates a temporary home, and drops inherited application
keys, database configuration and `NODE_OPTIONS` from test subprocesses.

Run one file, or send evidence to a different directory:

```sh
python3 scripts/testing/run-commerce.py --only database-commerce.test.mjs
python3 scripts/testing/run-commerce.py --only legacy-beat
python3 scripts/testing/run-commerce.py --only provider-report-summary
python3 scripts/testing/run-commerce.py --output /tmp/commerce-rerun
python3 scripts/testing/run-commerce.py --help
```

`--only` accepts the table's filename or its extensionless ID. A selected run
replaces the output directory's `results.json` with that selection's results;
use another `--output` directory to preserve a previous full run. Exit code 0
means every executed command passed, 1 means a failure/timeout occurred, and
2 means CLI usage was invalid. Four remote entry points remain explicitly
not run even when the local command exits 0.

## Latest complete rerun

The October 25, 2026 rerun used application/test baseline `f5716662` and the
new fixture scripts included in this change. All 18 commands exited 0
(17 framework suites and one bundled CLI self-check):
**78 JUnit leaf cases passed, 1 skipped, 0 failed, 0 errors**. The skip is the
real Stripe-backed case inside `database-commerce.test.mjs`, because the
credential-free subprocess has no dedicated Stripe test bindings. Node TAP
also counts parent tests; its count can exceed JUnit's leaf count. Do not add
the TAP and JUnit totals together.

The CLI self-check is counted separately from JUnit cases. It exercises
pass/fail/blocked/cleanup aggregation and diagnostic redaction through
`node tests/payment-processing/real-stripe-api.mjs --self-test-summary`.
That flag does not construct a Stripe client or make provider requests. The
same file's full remote execution mode remains not run. Selecting its basename
with this Python runner invokes only this offline flag.

The initial legacy fixture attempt passed 13/14 cases and failed the queue
import because no queue backend was configured. That evidence is retained
under `reports/test-verification/commerce/diagnostics/`. The fixture was then
completed with its own local Redis process and the unchanged 14-case suite
passed. Diagnostic XML is an earlier attempt, not another final test run.

Current evidence:

- [Machine-readable command results](../../reports/test-verification/commerce/results.json)
- Per-file `.txt` files contain TAP or verbose Vitest output.
- Per-file `.xml` files contain the individual case names, outcomes and timing.
- [Case index](commerce-cases.md) lists every executed JUnit leaf case.

These results verify local service/route contracts, durable SQL transitions,
codecs and owned test fixtures. They do not certify deployed Stripe webhooks,
real payouts, provider account eligibility, public social posting, native
plugin processing or overall production readiness.

## Every executable local payment file

For each row, use `python3 scripts/testing/run-commerce.py --only FILE`, where
`FILE` is the listed basename. The runner supplies the same isolation and
JUnit/TAP output as a full run. The underlying framework command is
`node --test tests/payment-processing/FILE`; prefer the scoped runner so
inherited dedicated Stripe bindings cannot accidentally enable a remote case.

| File | What it verifies | Fixture/dependency |
| --- | --- | --- |
| `beat-loop-lifecycle-postgres.test.mjs` | Singleton/lock ownership; decoded audio and shorter preview; awareness artwork; atomic beat/listing/royalty writes; completed-sale idempotency; pause/recovery; rollback; silence and renderer failures. | Full disposable PostgreSQL schema, actual FFmpeg/codec validation, isolated renderer/storage/social ports. |
| `business-integrity-postgres.test.mjs` | SQL ownership, concurrent royalty caps, shipping rejection, merchandise reservation rollback and expiry. | Disposable PostgreSQL and production services. |
| `business-integrity.test.mjs` | Settlement excludes pending attackers; royalty mutations enforce ownership and caps; mounted routes delegate to the ownership service. | Injected repositories/transports. |
| `database-commerce.test.mjs` | Durable checkout retries and rollback; migration constraints; balanced settlement/allocations; concurrent duplicate settlement; payout/refund/reversal SQL; webhook inbox deduplication. | Disposable PostgreSQL. One real-provider case skips without explicit dedicated test bindings. |
| `inbound-billing.test.mjs` | Cancellation, setup/portal/invoice/retry/refund/3DS/dispute route contracts. | Actual route handlers with isolated SDK/repository boundaries. |
| `inbound-commerce.test.mjs` | Marketplace, merchant and merchandise checkout/fulfillment contracts; ownership, immutable pricing and verified events; billing catalog rejects caller prices. | In-memory transactional repositories and provider fixtures. |
| `inbound-known-failures.mjs` | Regressions for durable billing/cart retry identity, order-persistence rollback and verified BeatService completion. | Isolated production handlers/services; previously failing assertions remain active. |
| `inbound-legacy-services.test.mjs` | Storefront membership subscription/cancellation ownership; legacy marketplace delegation and Connect onboarding; subscription amount semantics. | Isolated production services. |
| `inbound-registration.test.mjs` | Plan/payment verification gates execute before account writes. | Actual registration handler with isolated state. |
| `inbound-storefront.test.mjs` | Mounted storefront cart authentication, listing ownership, catalog pricing, exact amounts/metadata and order creation. | Actual route handlers and isolated repositories. |
| `outbound-commerce.mjs` | Immutable transfer/refund/reversal keys, Connect payout scoping, engine retry/claim/accounting and refund/reversal authorization. | Actual provider/engine code with fixture transport. |
| `outbound-membership-auth.mjs` | Tier mutations require ownership of the parent storefront. | Actual handler/service boundary with owned fixture records. |
| `outbound-services-webhooks.mjs` | Buyer-scoped refunds; stable operation retries; Express onboarding payloads; dispute/refund reconciliation; raw-byte webhook signatures; settlement receipt replay; immutable payout account. | Production services/middleware with injected SDK/SQL boundaries. |
| `outbound-stripe-resource-ownership.test.mjs` | Cleanup/catalog resources must belong to the current test run. | Pure ownership predicates. |
| `outbound-stripe-test-transport.test.mjs` | Dedicated transport rejects live or unsupported bindings and constrains key usage. | Local fake bindings and transport checks; no remote provider call. |
| `outbound-topup-journal.mjs` | Lost top-up creation responses remain unresolved; old journals cannot disguise missing cleanup; blocked preflight and verified cleanup remain distinct. | Pure persisted-journal fixtures. |

## Legacy beat-sale integration file

Use `python3 scripts/testing/run-commerce.py --only legacy-beat`. The runner
calls `scripts/testing/commerce-legacy-fixture.mjs`, which generates the current
full schema, applies additive migrations, starts its own queue backend,
loads a loopback-only TCP/TLS guard, runs `vitest.beat-loop.config.ts`, and
stops/removes its owned services and files in `finally`.

The 14 cases in `tests/unit/beat-sale-money-loop.test.ts` cover royalty-ledger
writes/replay, revenue-event uniqueness, completed-order notification delivery
and replay/concurrency, and overdue content selection/state transitions. The
no-account social test checks that calling `publishToPlatform` does not throw;
it does not assert that a provider post was sent. This fixture uses the
supported native Redis queue backend and does not prove PDIM-backed queue
interoperability.

For an already owned disposable target, the underlying command is:

```sh
node node_modules/vitest/vitest.mjs run --config vitest.beat-loop.config.ts
```

That direct command additionally requires `BEAT_LOOP_TEST_DATABASE_URL` distinct
from the application database, the full migrated schema, a working isolated
queue backend and the appropriate test adapter/egress guard. Do not point it at
the shared application database. The fixture runner supplies those prerequisites.

## Remote entry points and browser fixture

These were not run in the credential-free verification. Their existing
commands remain available for an explicitly selected isolated Stripe TEST
account, after its test-only credentials and webhook isolation are checked.
Do not interpret these instructions as evidence of provider acceptance.

| File | What it does | Command/prerequisites |
| --- | --- | --- |
| `real-stripe-api.mjs --self-test-summary` | Offline result aggregation, unresolved cleanup verdicts, root-reason reporting and diagnostic key/client-secret/URL redaction. | `python3 scripts/testing/run-commerce.py --only provider-report-summary`; executed successfully in this rerun without provider credentials or requests. |
| `real-stripe-api.mjs` | Creates/confirms/cancels/refunds owned Stripe test objects, exercises checkout/subscription/invoice/Connect paths and records owned cleanup. | `node tests/payment-processing/real-stripe-api.mjs`; dedicated `STRIPE_TEST_SECRET` and `STRIPE_TEST_CLIENT`, no enabled shared test webhook endpoints, applicable account capabilities. |
| `inbound-real-stripe.mjs` | Executes real production checkout payload builders/handlers against isolated Stripe test mode and journals owned resources/cleanup. | `node tests/payment-processing/inbound-real-stripe.mjs`; same dedicated test binding/isolation prerequisites. |
| `real-stripe-topup.mjs` | Creates/retrieves/cancels a test platform top-up and retains unresolved funding/cleanup evidence. | `node tests/payment-processing/real-stripe-topup.mjs`; dedicated test bindings plus supported test-account funding capabilities. |
| `browser-fixture.mjs` | Serves the real SubscribeForm with Stripe.js/Elements for synthetic success/decline confirmation journeys. | `node tests/payment-processing/browser-fixture.mjs`, then `http://127.0.0.1:5101/?scenario=success` or `?scenario=decline`; dedicated test bindings, browser, Stripe.js access and isolated test webhooks. |
| `run.mjs` | Existing payment verification entry point; selected production contracts and disposable SQL by default; adds the remote suites with `--stripe`. | `node tests/payment-processing/run.mjs` or explicit `node tests/payment-processing/run.mjs --stripe`. Its default selection omits business-integrity and beat-lifecycle files; use the exhaustive Python runner for this documented local scope. |

Remote suites create provider-side historical records even when owned cleanup
succeeds. The browser fixture is an auxiliary server, not an automated browser
test. Read [the existing payment guide](../../tests/payment-processing/README.md)
for test credential, cleanup and evidence boundaries.

## Helpers and support files

These are imported by the executable tests; they are not additional test suites.

| File | Purpose | How it is used |
| --- | --- | --- |
| `helpers-inbound.mjs` | esbuild boundary injection, route/response harnesses, transactional in-memory checkout state and schema/log stubs. | Imported by inbound and checkout tests. |
| `helpers-outbound-isolated.mjs` | Loads production outbound subjects and supplies operation/engine repository fixtures. | Imported by outbound commerce/service tests. |
| `helpers-database-postgres.mjs` | Starts/stops owned Unix-only PostgreSQL, installs commerce schemas/migrations, bundles production subjects with explicit dependencies. | Imported by SQL/lifecycle tests and the legacy fixture. |
| `helpers-browser-fixture.mjs` | Builds the actual subscription form bundle and reserves bootstrap browser scenarios. | Imported by the browser fixture. |
| `helpers-stripe-test-transport.mjs` | Validates dedicated test bindings, provides the configured proxy-aware Stripe test transport, constrains publishable-key reads. | Imported by explicit remote suites and offline transport regressions. |
| `helpers-stripe-resource-ownership.mjs` | Checks current-run catalog ownership before cleanup. | Imported by remote handler and ownership regression tests. |
| `helpers-topup-cleanup.mjs` | Decides unresolved top-up reconciliation and final exit status from durable journals. | Imported by top-up runner and journal regressions. |
| `README.md` | Existing payment usage and provider-isolation explanation. | Read before selecting a remote entry point. |

All filenames in this helper table are relative to `tests/payment-processing/`.
The three additional subscription/commerce Node suites selected by the existing
`run.mjs` live outside this directory and belong to the root Node test catalog.
