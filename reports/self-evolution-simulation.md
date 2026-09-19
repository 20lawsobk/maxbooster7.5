# Self-Evolution Isolated Simulation

## Result

PASS. The final focused run completed **3 test files / 25 tests**, all passing.

The simulation used the real `SelfEvolutionEngine` proposal, categorization,
payload generation, validation, deployment, and registry code. A deterministic
social timing signal was injected at the industry-input boundary; the resulting
proposal became a bounded `posting_optimization`, was applied, and changed the
real `AutopilotEngine` posting-hours result from its static TikTok default to the
generated hours. The autonomous autopilot consumer was also checked before
apply, after apply, and after rollback.

## Safety and isolation

- Environment was cleared with `env -i`; only `PATH`, `HOME`, and
  `NODE_ENV=test` were supplied.
- Persistence used an in-memory adapter implementing the real registry storage
  contract.
- Post-deployment failure validation used a temporary loopback-only HTTP server
  returning HTTP 503.
- Industry/provider, database optimization-task, learning-store, publishing,
  MaxCore, and PDIM calls were mocked at their boundaries.
- No production state, real database, provider, PDIM, or publishing writes were
  performed.
- No workflow/server restart, browser run, full TypeScript check, or full test
  suite was run.

## Scenarios verified

1. Full cycle orchestration: detected timing change -> generated proposal ->
   sanitizer validation -> registry apply -> real autopilot consumer effect.
2. Fresh-instance restart restores an active enhancement from fake durable
   storage.
3. Real autonomous-autopilot posting-window decision changes on apply and
   returns to baseline on deactivation.
4. Invalid proposal is rejected during validation.
5. Valid but unsupported `feature_flag` is recorded as advisory and never
   counted as applied.
6. Storage upload failure fails closed: no active in-memory residue and no
   applied/deployed success claim.
7. HTTP 503 post-deployment validation rolls back the failing canary only,
   preserves a prior healthy enhancement, and updates upgrade status to
   `rolled_back`.
8. Existing effective-field, consumer, rollback, and admin-status honesty tests
   remain passing.

## Defects fixed

- Registry persistence failures were swallowed while `apply()` still reported a
  live applied change. Registry mutations are now atomic: failed persistence
  restores prior in-memory state and returns an explicit failure.
- Unsupported-category deployment previously checked `consumed=false` before
  checking whether registry persistence succeeded, allowing a failed write to
  be reported as a recorded advisory. A missing persisted enhancement now fails
  deployment explicitly.
- Registry rollback mutations now restore prior in-memory state when their
  persistence write fails.
- The registry class/storage contract is injectable and exported, enabling a
  real fresh-instance persistence test without network access.
- Post-deployment health validation treated HTTP 503 as healthy because it only
  measured request completion. It now requires a 2xx response.
- A failed canary health check rolled back every historical enhancement. It now
  rolls back only upgrade IDs from the current deployment.
- Rolled-back upgrades remained marked `applied/deployed`. They now become
  `rolled_back`, `applied=false`, with an explicit rollback reason.
- Advisory/no-op cycles no longer run a health probe capable of reverting
  unrelated prior state.
- Cycle exceptions were swallowed inside the orchestrator. They are now
  rethrown after status/event recording so manual callers and tests can observe
  real dependency failures.
- Rollback persistence failures are rethrown rather than being logged and then
  reported as a completed rollback.

## Exact commands

Initial focused run (before adding the autonomous-autopilot consumer case):

```sh
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test ./node_modules/.bin/vitest run --config vitest.config.ts tests/unit/self-evolution-simulation.test.ts tests/unit/evolution-registry.test.ts tests/unit/auto-updates-status.test.ts --reporter=verbose
```

Result: **3 files passed, 24 tests passed**.

Consumer-expanded focused run:

```sh
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test ./node_modules/.bin/vitest run --config vitest.config.ts tests/unit/self-evolution-simulation.test.ts tests/unit/evolution-registry.test.ts tests/unit/auto-updates-status.test.ts --reporter=verbose
```

Result: **3 files passed, 25 tests passed, 0 failed**.

Final focused run plus changed-file whitespace validation:

```sh
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test ./node_modules/.bin/vitest run --config vitest.config.ts tests/unit/self-evolution-simulation.test.ts tests/unit/evolution-registry.test.ts tests/unit/auto-updates-status.test.ts --reporter=verbose && git diff --check -- server/self-evolution-engine.ts server/services/evolutionRegistry.ts tests/unit/self-evolution-simulation.test.ts reports/self-evolution-simulation.md
```

Result: **3 files passed, 25 tests passed, 0 failed; `git diff
--check` passed**.

Vitest printed the existing configuration deprecation warning that
`test.poolOptions` was removed in Vitest 4; it did not affect the run.

## Limitations

- The simulation injects one deterministic industry change rather than calling
  live RSS/search providers. This deliberately tests engine orchestration while
  preventing external reads and nondeterministic proposals.
- The successful-cycle health phase is controlled to healthy in the full-cycle
  test. The real health-check and rollback path is exercised separately against
  a loopback HTTP 503 server.
- Fake storage validates serialization, fresh-instance reload, atomic failure,
  and the storage adapter contract; it does not validate PDIM availability,
  authentication, latency, or multi-process convergence.
- No real content generation or publishing was attempted. Consumer verification
  is limited to the live posting-window and generator-input behavior covered by
  the focused tests.