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
   verification → embedded MaxCore API build → Vite client → five root Node
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
