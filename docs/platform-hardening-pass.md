# Platform hardening: verified scope and remaining gates

## Architecture inspected

This is the existing checkout, not a GitHub replacement. Existing local changes
were retained. Local main was three commits ahead of its recorded origin/main;
no live remote-parity claim is made.

| Area | Observed structure | Evidence boundary |
| --- | --- | --- |
| Web client | React/Vite, `client/src/main.tsx`, `App`, query/offline providers, feature components | Client typecheck and production build passed; not a complete interactive UX audit |
| API | `server/index.ts`, cluster entry, route modules, shared schema | Compiled HTTP startup tested; not every endpoint exercised |
| Workers | `server/workers`, service-owned schedulers, readiness lifecycle | Targeted webhook/auth/legal tests; sustained-load and recovery coverage incomplete |
| Persistence | `shared/schema.ts`, Drizzle migrations, app-managed database and PDIM | DMCA schema/migration contracts tested; no production migration applied |
| AI/storage | `external/maxcore`, `external/pdim`, separate pnpm trees and Python service | Embedded Node production bundle built; complete Python/model serving not validated |
| Native service | `boosterstate/Cargo.toml`, Tokio/Axum service | Manifest and startup handoff inspected; no Rust build/test claim in this pass |
| Desktop | Electron main/preload and root electron-builder configuration | Readiness and popup policy corrected/tested; installer/OS smoke tests not run |
| Infrastructure | DNS Node/Go packages, TLS proxy, deployment scripts | Manifests inventoried; independent service builds/recovery not certified |
| CI | `.github/workflows`, npm test/check/security commands | Verification made non-mutating; new runtime regressions included in `test:ci` |

## Build/start chain

1. `npm run build` → local `tsx` build script → installed subsystem dependency
   verification → embedded MaxCore API build → Vite client → six root Node
   bundles → source/artifact hash contract.
2. `npm run start` → Node production launcher → contract and port validation →
   port contract → existing `start.sh --executive-application` → existing
   Python/native/gateway/cluster handoff.
3. Production MaxCore runs compiled JavaScript, not its development TSX
   bootstrap. Its interpreter is explicitly rooted in the parent application,
   with the existing explicit interpreter override honored.
4. Publishing remains the separate historical `bash build.sh` / `bash start.sh`
   compile/pack/restore flow. It was not executed destructively or published.
5. Electron packaging is separate from the web build. It must not be inferred
   successful from a passing npm web build.

## Corrections made

### Blocker remediation and acceptance, 2026-10-16

This is partial implementation, not a five-blocker completion or launch approval.

**Connectivity classification correction:** The intentionally no-egress fixture's
feed failures are test-environment limitations, not a confirmed production
networking defect. Subsequent awareness-only testing kept the preview running:
43 Python tests and 10 application-facade tests passed; the preview returned
HTTP 200 with awareness ready. Three public feeds passed and Apple Charts
timed out in that run. The refresh/storage warning remains an investigation
item, not a proven production launch blocker. These observations do not
establish that starting the preview itself enables workspace internet access.

- Complete native fixture selection now mirrors start.sh: executable
  bin/boosterstate first, then the development release path. Missing native
  binaries fail fixture preparation instead of silently disappearing.
- The isolated smoke checks IPv4/IPv6 listener release and rejects forced
  shutdown. A separate runner repeats the startup/shutdown cycle in the same
  network namespace.
- Actual production tests exposed model listeners stranded on 9878/9879.
  The embedded BullMQ module called process.exit while the application was
  still draining. Embedded shutdown now returns/throws to its application
  owner; standalone workers retain signal/exit handling. MaxCore also signals
  its owned detached process group immediately.
- The latest two production cycles each served HTML and health with HTTP 200,
  shut down without leaked checked ports, and permitted the second start.
  Both still exited 1 for readiness 503: no-egress awareness ingestion remains
  unavailable. This is not a production-ready result.
- Fixed the YouTube awareness adapter's undefined ET reference by using the
  existing bounded, DTD/entity-rejecting XML parser.
- Added a credential-free, fixed-source public read probe. All four real
  domains passed: Apple 50 rows, Mastodon 20, Marketing Dive 10, Guardian 26.
  The initial sanitized probe failed certificate verification; explicitly
  using the host CA bundle fixed it without disabling TLS verification.
  This separate read probe does not bypass or replace application readiness.
- Full npm lint completed with 37 errors: 36 were installed Python-distribution
  JS/terminfo files, one was a redundant test catch/rethrow. Excluded only those
  third-party runtime trees and removed the redundant wrapper. Full lint then
  passed; the subsequent worker edits also passed targeted lint.

Observed commands:

| Command/check | Outcome |
| --- | --- |
| python3 -B -m unittest discover -s tests -p test_production_fixture_support.py -v | 3 passed |
| Portable Python unittest ai_model.awareness.test_sources | 12 passed |
| Vitest snapshot writer/JSON and Redis/capsule journals | 4 files, 22 passed |
| Vitest MaxCore supervisor/cluster ownership/distribution contract | 3 files, 17 passed |
| Vitest worker shutdown ownership/MaxCore supervisor, after final fix | 2 files, 11 passed |
| npm run test:runtime-contracts | 37 passed; before final worker ownership edit |
| npm run build, after final worker ownership edit | exit 0 |
| Resource-bounded tsgo server typecheck, after final edit | exit 0 |
| npm run lint | exit 0 before final worker edit; targeted lint passed afterward |
| production-restart-smoke.py under unshare -Urn | both cycles exit 1 on readiness; port-release checks passed |
| Credential-free awareness-public-read-smoke.py | exit 0; all four domains populated |
| verify-runtime-artifacts.mjs dependencies | 60-second shell timeout; no pass established |
| Retained snapshot SHA-256 inventory | interrupted without a complete report; no recovery/cleanup claim |

No retained PDIM files were removed. Fixture journal tests do not establish
recovery of the real retained account dataset. The actual historical shell
pack/restore rehearsal, production-only dependency closure, active legacy
provider retirement, full security triage and critical cross-platform journeys
remain open. No publishing, migrations, live messaging, payments or releases
were performed.

### Continued build-contract verification, 2026-10-16

- Fixed a late-failure acceptance hole: the build failure handler now removes
  the completion marker even when provisioning or packing fails after compilation.
  Added an executable regression using the actual handler with a disposable marker.
- Strengthened the isolated startup smoke test to require an `ok` readiness
  payload and `unifiedAwareness.ready === true`, not HTTP 200 alone.
- `npm run test:runtime-contracts`: 37 passed, no failures/skips.
- `npm run build`: passed.
- `eslint script/build.ts --quiet`: passed.
- Python AST parse of the modified smoke test: passed; this is not a rerun of
  its live startup journey.
- Seven targeted Vitest files (DMCA rules/schema, distribution provider contract,
  upload authorization, Stripe/instant-payout webhook honesty, prelaunch):
  87 tests passed.
- Client and server `tsgo --noEmit` checks passed with GOMAXPROCS=2 and
  GOMEMLIMIT=2GiB.
- `timeout 60s npm run lint`: timed out (124), not passed.
- Earlier complete-runtime isolated production rehearsal loaded 71/71 model
  tensors and the Digital GPU backend, serving HTML and health with HTTP 200.
  Readiness remained 503 because mandatory awareness feed ingestion could not
  reach public sources from the isolated network. Do not suppress that gate.
- No production migrations, deployment, or live business operations were
  initiated. Full-platform acceptance and production readiness remain open.

- Removed dependency auto-fixing and source formatting from `npm run verify`.
  `npm run audit` is now read-only; explicit developer fix commands remain.
- Desktop startup polls `/api/ready` and accepts only HTTP 200, not an arbitrary
  homepage response below 500.
- Renderer-created Electron popup windows are denied. Only parsed,
  credential-free HTTP(S) links are opened in the system browser.
- Upgraded the active root media parser from 11.15.0 to 11.16.0. Verified the
  public npm tarball integrity matches the lock, retaining its integrity hash
  rather than shipping the install tool's internal registry URL.
- Added actual WAV parsing and malformed ID3 allocation regressions plus
  desktop/runtime/verification contract tests, wired into CI.
- Retained the prior production build/start corrections and PR-derived
  legal/auth/payment regression coverage.

## Checks and limits

- Production npm build: passed after the runtime changes and media parser update.
- Final runtime/desktop/media contract command: `npm run test:runtime-contracts`,
  26 passed, zero failed or skipped.
- Native TypeScript checks: client and server both passed (`tsgo --noEmit` with
  their respective configs). This is not a claim that the separate `npm run
  check` command was executed.
- Focused ESLint on the build/launcher/supervisor tests passed; the full repository
  `timeout 60s npm run lint` attempt expired (exit 124), not a lint pass.
- Seven critical-flow unit files: 81 tests passed, covering Python launcher,
  DMCA rules/schema, CSRF cache isolation, upload authorization ordering, Stripe
  webhook honesty, and instant-payout webhook honesty.
- The bounded full Vitest attempt ran in a copied source tree with credentials
  scrubbed and a separate network namespace. It timed out after 180 seconds
  (exit 124), with fixture/configuration omissions and database-dependent tests
  among its failures. It is **not** a full-suite pass.
- Real isolated `npm run start`: homepage 200, health 200, readiness 503.
  Readiness smoke exited 1. The fixture lacks packaged Python; the log identifies
  the missing interpreter under the fixture's root. Do not confuse HTTP
  liveness with model/ecosystem readiness.
- Baseline dependency scan: 76 moderate findings, zero high/critical, involving
  Go toolchains/x-net and music-metadata copies. The root parser was subsequently
  updated; nested/archive copies and Go findings require separate reconciliation.
- Static security scan returned `incomplete: true`; privacy scan disconnected.
  Neither result is a clean security assessment.

## Prioritized remaining work and acceptance

1. **Complete runtime readiness:** provision a complete isolated Python/native/
   model fixture, then require readiness 200 and real generation contracts.
2. **Reproducible full validation:** make the copied test fixture include required
   configuration and isolate database-dependent suites correctly; require a
   completed full run, not early green output.
3. **Dependency coverage:** reconcile all independently built Go and nested
   lockfiles, verify their consumers, and rerun complete scanners.
4. **Desktop and infrastructure:** build installers and native/DNS/TLS services
   in supported environments, then verify process ownership, readiness,
   shutdown, network exposure and recovery.
5. **Product-wide workflows:** authenticated tenant-boundary and browser tests
   across social, ads, beat commerce, distribution, studio and automation,
   followed by sustained-load, replay/idempotency and accessibility checks.

Rollback is by individually reverting the specific source/manifest patches,
keeping the matching package manifest and lockfile together; never reset
unrelated local work or change user data. No publication, payout, release,
live email, or production migration was initiated by this pass.

**Verdict:** concrete hardening and partial validation, not platform-wide
production readiness.

## Subsequent test-integrity correction

The beat-sale database suite previously swallowed setup/cleanup errors and
returned from tests when setup failed. It is now excluded from the DB-free unit
configuration and selected explicitly using:

`node_modules/.bin/vitest run --config vitest.beat-loop.config.ts`

It requires `BEAT_LOOP_TEST_DATABASE_URL`, distinct from the app's configured
database URL. Setup and cleanup errors fail the run. Missing-target behavior is
tested with a scrubbed child-process environment by
`node --test tests/beat-loop-test-safety.test.mjs`. This guard test does not prove
the financial integration assertions; those still need a provisioned disposable
schema and controlled provider fixtures.

## Configured Neon verification

The actual configured `NEON_DATABASE_URL` was queried inside a read-only
transaction; no separate managed Replit database was substituted. Comparing
304 Drizzle table contracts with Neon found no missing tables, but missing
columns in four tables: `dmca_notices`, `dmca_strikes`, `legal_holds`, and
`social_inbox_messages`.

The existing migrations `0006_dmca_workflow_contract.sql` and
`0026_social_inbox_provider_delivery.sql` address those columns. They were
initially withheld pending authorization; their authorized application and
post-commit verification are recorded below.

`node --import tsx scripts/check-neon-schema.mjs` is now a reproducible,
read-only, nonzero-on-drift gate. Prelaunch uses the same check against its
selected database instead of declaring database readiness after `SELECT 1`.
The check currently verifies table/column existence, not types, constraints,
indexes, migration provenance, or financial data correctness.

## Production runtime and storefront continuation — 2026-10-16

Implemented in the existing workspace:

- `script/lib/serverBundles.ts` now builds the DNS server as `dist/dns-node.mjs`.
  `server/services/dnsNodeLocalSupervisor.ts` runs that artifact with Node in
  production; development retains TSX. Both publishing and npm builds use the
  shared bundler.
- `scripts/start-production.mjs` requires and hashes the DNS artifact, tracks its
  sources/configuration, and tracks `client/index.html`. Missing DNS output or a
  changed HTML entry invalidates startup.
- `StorefrontBuilder.tsx`, `StorefrontDnsZoneManager.tsx`, and
  `storefrontService.ts` generate canonical storefront links on
  `https://maxbooster.replit.app`. Custom-domain records/routing remain intact.
  Domain claims no longer claim that public DNS/TLS has been verified.
- `tests/npm-start-isolated-smoke.py` discards stale observations on errors,
  clears stale readiness output, and permits the registry's 3-second probe plus
  awareness's 5-second probe before declaring a request timeout.
- Runtime-contract CI now includes the canonical-link and Neon-schema tests.

Observed verification:

| Command/check | Result |
| --- | --- |
| `npm run build` | Passed; runtime bundles and completion contract written |
| `npm run test:runtime-contracts` | 34 passed, zero failed/skipped |
| `GOMAXPROCS=2 GOMEMLIMIT=2GiB node_modules/.bin/tsgo --noEmit -p tsconfig.server.json` | Passed |
| Same native checker with `tsconfig.client.json` | Passed |
| ESLint on changed production/client/build files, `--quiet` | Passed |
| `unshare -Urn python3 tests/dns-production-smoke.py "$(readlink /proc/self/ns/net)"` | Passed: compiled Node service, HTTP health, UDP DNS answer, TCP response |
| Isolated `npm run start`, through `tests/npm-start-isolated-smoke.py` | Started and served `/` and `/api/health` with 200; `/api/ready` returned 503; smoke test correctly exited 1 |
| `git diff --check` | Passed |

The startup rehearsal used a disposable PostgreSQL database/schema, sanitized
environment, copied source/artifacts, and a private network namespace. No shared
Neon migration, provider call, publication, or payout was authorized or performed
by the rehearsal. Python/model resources were absent from the fixture: MaxCore
reported Python unavailable and the awareness request timed out. This is **not**
a passing full-stack readiness test. Its first attempt also encountered a
fixture PostgreSQL process-lifetime error, corrected by using a tracked
background process. An unbounded typecheck attempt lost its container; the
resource-bounded commands above subsequently passed.

Operational blockers found while restoring preview:

- Read-only Neon inspection found 30 missing columns across four tables (above).
  This specific blocker was resolved by the authorized migrations below.
- PDIM logged filesystem write error -122. There are 25 snapshot staging files
  totaling 17,420,751,086 bytes. These are **retained**, not declared redundant or
  deleted: their recovery value must be established before cleanup.
- An orphaned DNS process group (parent PID 1, verified workspace DNS cwd) owned
  port 5353. That group was stopped; this is operational remediation, not proof
  that every abrupt-shutdown orphan scenario has been eliminated.

The DNS-management panel also guards its initially undefined link query result
and uses the canonical platform link for already-linked domain records. The final
post-edit checks again passed: 34 runtime contracts, client native typecheck,
targeted ESLint, and `npm run build` (Vite phase 67 seconds).

Full-suite, security, external-provider, desktop-package, authenticated
cross-system workflow, and sustained-load acceptance remain incomplete. Do not
infer platform-wide production readiness from this focused pass.

## Authorized shared Neon migrations — 2026-10-16 05:18 UTC

The user explicitly approved applying the two additive migrations. They were
applied directly to the configured `NEON_DATABASE_URL`, not the separate managed
Replit database. No other migrations were applied.

| Migration | SHA-256 of executed SQL |
| --- | --- |
| `migrations/0006_dmca_workflow_contract.sql` | `106dd3b294992f426949d65e5844e76d5357c27f16a34b00fe27eaef55342b8a` |
| `migrations/0026_social_inbox_provider_delivery.sql` | `24ff33afd7f979fecb1e941b8bf6474802572612bec1a539539eb5b5c9f22e0d` |

Execution used one transaction, an advisory migration lock, locks on the four
affected tables, a 3-second lock timeout, and a 15-second statement timeout.
Before commit, row counts and digests over **all original columns** matched
before/after for all four tables. The new fields receive their migration-defined
defaults; the comparison deliberately checks preservation of existing fields.
Both new indexes were valid. Replaying both migrations in the same transaction
also preserved the original data, confirming their idempotency. Commit completed
at `2026-10-16T05:18:04.470Z`.

Post-commit verification:

- `node --import tsx scripts/check-neon-schema.mjs`: exit 0, 304 table contracts
  checked in a read-only transaction, `drift: []`.
- `node --test tests/neon-schema-contract.test.mjs`: 5 passed.
- `env -i PATH="$PATH" HOME=/tmp NODE_ENV=test DATABASE_URL=postgresql://test:test@127.0.0.1:1/test NEON_DATABASE_URL=postgresql://test:test@127.0.0.1:1/test node_modules/.bin/vitest run tests/unit/pre-launch-check.test.ts tests/unit/dmca-schema-contract.test.ts tests/unit/dmca-rules.test.ts --maxWorkers=1`:
  23 passed across three files. These tests did not use the shared database.

Existing fields were preserved; no DELETE or UPDATE statements were executed.
No emails, payouts, releases, or publication were triggered by this operation. This resolves the observed
table/column drift only; it does not certify end-to-end legal workflows, provider
delivery, every schema constraint, or overall production readiness.

## Focused build/restart continuation — 2026-10-16

Preserved the existing dirty workspace rather than resetting it to GitHub.
The local history inspected started at `4a3659b93`, with `5af4ca5e3` and
`d76d19e40` immediately preceding it.

### Changes

- `server/services/dnsNodeLocalSupervisor.ts`: send SIGTERM immediately to
  the owned detached process group, not only its launcher. Retain the bounded
  SIGKILL escalation and report unexpected signaling errors.
- `script/build.ts`: adopted the fail-fast curl/pipefail download correction
  from PR #84. Required Python provisioning now throws on failure and preserves
  the existing runtime directory instead of deleting it and continuing degraded.
- `tests/npm-build-start-contract.test.mjs`: added executable tests for process
  group shutdown, repeat-stop safety, and the provisioning failure handler.
  The failure-handler test does not run pip or download Python.

### PR comparison

Read PR #84 through the configured GitHub connection: still open, head
`364ef8e6b857e23bd4b8159f49b7659fe214e8af`, 40 changed files. Examined its
build/start, dependency synchronization, prelaunch, and test-runner patches.
The fail-closed test-runner and prelaunch helpers are already present locally.
Retained the newer source/artifact hash checks and compiled subsystem entries.
Did not import its default-to-development launcher, network-bootstrapped pnpm
installs, optional-Python packaging, or detached background restoration:
those conflict with this workspace's stricter runtime contract.
This was a focused comparison, not validation of all 40 changed files or
a re-run of GitHub checks. No merge or GitHub modification was performed.

### New execution evidence

- `npm run build`: passed after the final edits.
- `npm run test:runtime-contracts`: 36 passed, zero failed/skipped.
- `GOMAXPROCS=2 GOMEMLIMIT=2GiB node_modules/.bin/tsgo --noEmit -p tsconfig.server.json`:
  passed after the supervisor change.
- `node_modules/.bin/eslint script/build.ts server/services/dnsNodeLocalSupervisor.ts --quiet`:
  passed after final edits.
- Managed `Start application` (`npm run dev`) was stopped before the first build
  and restarted once afterward. The actual homepage rendered in the preview.
- Preview `/api/ready`: 200 before restart; 503 during Python warm-up; then 200
  with `maxcore: ok` and `unifiedAwareness.ready: true`. Runtime logs showed the
  Digital GPU backend and 71/71 model tensors loaded.
- The inspected restart log contained zero `EADDRINUSE` occurrences. Socket
  inspection found one owner each for app/PDIM, MaxCore, Python, and DNS listeners.
  This proves the observed restart, not every abrupt-kill scenario.
- Final production artifact contract validation passed.

### Remaining acceptance boundary

No new full `npm run start` rehearsal was performed in this continuation.
The earlier isolated run served production HTML and liveness but failed
readiness without the fixture's Python/model resources. Workspace development
readiness is now proven, but must not be substituted for production-mode
acceptance. Next: provision a complete isolated runtime fixture (including the
supported Digital GPU model and PDIM dependencies), then run the actual npm start
command through warm-up and shutdown without live provider or account effects.
No deployment, migrations, paid actions, or external messages were initiated
as part of this focused continuation.
