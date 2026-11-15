# Platform Regression — Current Unit Test Report

## Verdict

**The widest safely isolated Vitest unit run is now green.** This is not a
claim that live providers or production infrastructure are fully verified.

- **Final test files:** 90 passed, 90 total
- **Final tests:** 780 passed, 780 total
- **Final duration:** 81.20 seconds
- **Vitest:** 4.1.11
- **Node:** 24.13.0
- **Timeout:** 280 seconds externally enforced; suite completed normally
- **Concurrency:** `maxWorkers=1`, file parallelism disabled

The final run followed the awareness-transport fixes and fixture reconciliation.
Server TypeScript also passes with `npx tsc --noEmit -p tsconfig.server.json`.

### Initial baseline retained

The initial canonical run remains the comparison baseline:

- **Test files:** 82 passed, 7 failed, 89 total
- **Tests:** 759 passed, 14 failed, 773 total
- **Duration:** 106.83 seconds

An intermediate post-fixture run reached 89 passed / 1 failed files and 778
passed / 2 failed tests. Its two failures were stale direct-posting tests that
called the intentionally removed app-side `applyPostingOptimization` helper.
Those fixtures now assert the actual authority contract: explicit caller
objective/content type is transported, while registry metadata does not mutate
the direct request.

## Isolation and safety

The run used a clean `env -i` environment with only a small whitelist:

- `PATH`, `HOME`, `XDG_CONFIG_HOME`, and `TMPDIR`
- test/CI mode flags
- synthetic session and Stripe test-format values
- PostgreSQL/Neon and Redis URLs pointed at closed loopback port `127.0.0.1:1`
- integration base URL pointed at closed loopback port `127.0.0.1:1`

No real provider credentials were supplied. The repository has no active root `.env` file (only `.env.example`), and the unit setup does not load dotenv. The only `dotenv/config` source import found was `server/nameserver.ts`; no selected unit imported it in a way that loaded credentials. No smoke, load, penetration/security, production simulation, integration, or full TypeScript build command was run.

Canonical command shape:

```text
timeout --signal=TERM --kill-after=20s 280s env -i [whitelist and loopback fakes] \
  node_modules/.bin/vitest run --config vitest.config.ts \
  --maxWorkers=1 --no-file-parallelism --reporter=verbose
```

An initial diagnostic run was discarded because setting extra global MaxCore URL variables overrode URLs intentionally set by contract tests. The canonical rerun removed those conflicting variables and restored 11 false failures. The results below are from the clean canonical rerun only.

## Final outcome

No Vitest failures remain in the canonical isolated unit suite. The final run
also emitted no duplicate-key warning after the studio pattern request was
corrected to use `params.intent ?? kind`.

The unused `applyPostingOptimization` helper was intentionally removed rather
than reactivated: automatic application-side format/awareness conditioning
would conflict with MaxCore authority. Direct-generation regressions now verify
caller-authored objective and content type survive even when conflicting
registry metadata is active.

## Initial baseline failure classification (retained for history)

### Likely actual product regression — 1 test

1. **`tests/unit/evolution-registry.test.ts`**
   - `contentFormatPriority` override expected `questions`, received `insights`.
   - Production `AutopilotEngine.selectContentType()` currently rotates through configured types and does not consult the platform argument or active posting optimization. This directly conflicts with the tested self-evolution contract and is the strongest product-code regression signal in this run.

### Outdated or drifted tests/mocks — 13 tests

1. **`tests/unit/catalog-import-dedup.test.ts` — 5 failures**
   - Every catalog import produced zero mocked rows.
   - Production import code now wraps each release in `tx.transaction(...)` savepoints, while the test transaction double does not implement `transaction`. The handler catches that mock-shape error and records failed items, so these failures do not demonstrate a real database-path defect.

2. **`tests/unit/posting-optimization-direct.test.ts` — 2 failures**
   - Tests dereference `mediaGuidance.styleNotes`, but the production result type explicitly permits `mediaGuidance: null`, and the MaxCore response path currently returns `null`.
   - The lower-level posting-optimization transformation tests in the same file pass. These two assertions target an older enriched-output shape.

3. **`tests/unit/stripe-webhook-honesty.test.ts` — 2 failures**
   - The checkout handler now requires an inserted order ID and invokes idempotent `marketplaceService.processPayment()` to book seller earnings.
   - The old mocks return no inserted row and do not model the earnings-booking path, so the handler correctly reports failure under the stale stub shape.

4. **`tests/unit/distributed-sched-lock.test.ts` — 2 failures**
   - Recurring scheduler count expects exactly 8, while production registers 10; named-job and scheduling-shape assertions otherwise pass.
   - The PDIM-error test expects fail-open execution, while production deliberately changed to fail closed to prevent duplicate cluster-wide task execution.

5. **`tests/unit/release-scheduler-honesty.test.ts` — 1 failure**
   - The test says `platform_publish` is not implemented. Production now wires it to `distributionService.submitToProvider()` and queries the release first. The legacy DB mock lacks that new query path.

6. **`tests/unit/cache-cross-pod.test.ts` — 1 failure**
   - The production bust-key write is now a monotonic Redis/PDIM `EVAL`; the test double models older KV behavior and does not apply the Lua write to its shared fake state. Poll-based invalidation tests still pass.

### Missing dependencies — 0

No test failed from a missing package or unresolved module in the canonical run.

### Environment/isolation failures — 0 in canonical run

The canonical run had no failures attributable to the clean environment. A capsule cross-process test that uses `npx` required `XDG_CONFIG_HOME`; adding that standard whitelisted path allowed it to pass without exposing credentials.

## Passing coverage highlights

The 780 passing tests covered, among other areas:

- MaxCore connector/proxy contracts, local supervisor, media transport, control transport, and generation adapters
- authentication/config validation, bcrypt cost, middleware, webhook signatures, payout safety, and logger redaction
- beat-sale money-loop behavior, marketplace cart reconciliation, royalty/project settings, and payout/webhook honesty cases
- release workflow, distribution transport, Too Lost transport, social OAuth/status/listening contracts, and storefront URL policy
- cache polling, rate limiter storage, startup probes, capsule build/restore, PDIM contracts, and scheduler execution paths
- frontend contract/static render regression checks included by the unit configuration

Passing unit tests are evidence for those isolated contracts, not proof that live providers, a real database, Redis/PDIM, or the running application work end to end.

## Deliberately excluded suites

The following were not run because they are not safely isolated unit tests or could write to a running/local-real resource:

- `vitest.integration.config.ts` and all integration files; its setup targets a running Express server and teardown performs database deletes.
- Smoke tests, paid-user E2E, critical paths, load tests, penetration/security scripts, prelaunch checks, and production simulations.
- Python/MaxCore external artifact test trees, including load and endpoint-load tests.
- Client and integration TypeScript builds were not rerun here. The full server
  TypeScript check was run separately and passed.
- Legacy Jest files explicitly excluded by `vitest.config.ts`:
  - `tests/unit/example.test.ts`
  - `server/simulations/__tests__/verifyKPIs.test.ts`
- Client test trees are excluded by the unit config.

## Recommended interpretation

The isolated suite is green at **780/780 passing (100% of the selected unit
tests)**, and the server TypeScript check passes. This is strong regression
evidence for the selected app contracts, not proof of live database, PDIM,
payment, distribution, publishing, or provider behavior; those paths remain
deliberately outside this sanitized run.