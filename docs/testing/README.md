# Running and understanding Max Booster tests

The complete source index is [catalog.md](catalog.md). It documents every
canonical test file, its purpose, case labels, command, working directory and
prerequisites. [results.md](results.md) records the actual rerun, including
failures, skipped cases and work that could not run. A source index is not a
coverage percentage or evidence of a passing test.

## Prepare the tools and dependencies

Use Node 22.12 or newer (recorded run: 22.23.3), npm 10, pnpm 10,
Python 3.12+, PostgreSQL server tools (`initdb`, `pg_ctl`, `postgres`, `psql`),
native Redis, Chromium, FFmpeg, espeak-ng with its data files, OpenSSL,
tar/xz/zstd, Git, Go 1.26.6 and Rust 1.93.1 with Cargo. Run disposable PostgreSQL
fixtures as a non-root OS user. Put these executables on `PATH`.
`replit.nix` declares the main system tools; the cloud environment may use
extracted binaries and require their `LD_LIBRARY_PATH` as well.

Install JavaScript dependencies from the three independent locks:

```sh
npm ci
pnpm --dir external/maxcore install --frozen-lockfile
pnpm --dir external/pdim install --frozen-lockfile
```

Prepare a separate Python test environment. CPU PyTorch suffices for the
bounded kernel/training fixtures; downloading production model weights is not
part of this setup.

```sh
python3 -m venv .local/test-venv
.local/test-venv/bin/python -m pip install torch==2.13.0 --index-url https://download.pytorch.org/whl/cpu
.local/test-venv/bin/python -m pip install -r scripts/testing/requirements.txt
```

The portable-runtime isolation suite additionally requires the actual
`python_runtime/bin/python3` from the project's verified runtime preparation or
prepared Python capsule. A virtualenv/host Python is not a replacement for that
test. Its absence is reported as a missing prerequisite. See
`script/prepare-runtime.ts`, `script/lib/portablePython.mjs` and
`tests/portable-python-isolation.test.mjs`.

Select Chromium if it is not found automatically:

```sh
export CHROMIUM_PATH=/usr/bin/chromium
export REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium
```

The patent PDF check needs browser access to its local HTML fixture. A managed
browser policy that blocks `file:` URLs prevents that check; the recorded run
preserves `ERR_BLOCKED_BY_ADMINISTRATOR`. Do not disable the browser policy.
For espeak-ng installed outside system directories, set `ESPEAK_DATA_PATH` to
its actual data directory. Standard system package installations do not need
this override.

## Run the complete isolated sweep

```sh
npm run test:all -- --python "$PWD/.local/test-venv/bin/python"
```

The runner executes groups serially, continues after failures, preserves every
exit code, and writes evidence under `reports/test-verification/`. It does not
reuse the application's database, credentials or private serving state.
PostgreSQL, Redis and HTTP fixtures are disposable. Child processes have
bounded lifetimes and owned-process cleanup. Approved proxy/CA settings are
retained only where dependency downloads need them.

Useful selectors:

```sh
npm run test:all -- --plan
npm run test:all -- --group root --group node
npm run test:all -- --group python --python "$PWD/.local/test-venv/bin/python"
npm run test:all -- --group http --python "$PWD/.local/test-venv/bin/python"
npm run test:all -- --output "$PWD/.local/test-results"
```

Optional `--rust-toolchain /path/to/rust`, `--go-path /path/to/gopath` and
`--go-cache /path/to/cache` select prepared native toolchains/caches. Refer to
[subsystems.md](subsystems.md) for pinned toolchain verification. Existing CI's
`npm run test:ci` remains a smaller unit/runtime/security gate; it does not run
the entire catalog.

| Group | Purpose | Direct entry point | Detailed instructions |
| --- | --- | --- | --- |
| `root` | Runtime/start/dependency contracts, Sharp security, default Vitest unit tests, converted example and deterministic simulation checks | `npm run test:ci`; `node node_modules/vitest/vitest.mjs run --config vitest.additional.config.ts` | [Catalog](catalog.md) |
| `node` | All canonical isolated Node contracts and assertion scripts, including TypeScript Node tests outside the Vitest glob | `npm run test:node:all` | [Catalog](catalog.md) |
| `python` | Root security/runtime tests, canonical MaxCore numeric/awareness/generation/fixture tests, evaluation protocol and Sophia runner tests | `npm run test:python:all -- --python /path/to/prepared/python` | [Python](python.md) |
| `commerce` | Payment handlers, ownership, concurrent settlements, refunds and beat sale/lifecycle logic with real disposable SQL/Redis | `npm run test:commerce:all` | [Commerce](commerce.md), [every case](commerce-cases.md) |
| `subsystems` | Rust error handling, Go DNS, Reed–Solomon recovery, dependency gate, real compilation cleanup and original PDIM HTTP/load tests | `npm run test:subsystems` | [Subsystems](subsystems.md) |
| `browser` | Real Chromium auth, media errors/retry, storefront hooks, Studio save/load and audible processor behavior | `npm run test:browser` | [Browser/integration](integration-browser.md) |
| `http` | All 21 legacy HTTP integration files against a real disposable application and database | `npm run test:integration:isolated` | [Browser/integration](integration-browser.md) |
| `pages` | 42 authenticated, 11 administrator and 27 public page journeys plus persisted-data/authentication assertions | `npm run test:pages:isolated` | [Browser/integration](integration-browser.md) |
| `checks` | Server/client types, lint, production build and production dependency audit | `npm run test:all -- --group checks` | [Recorded results](results.md) |

## Run a particular file or case

Use the exact per-file command in [catalog.md](catalog.md). Common examples:

```sh
node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/unit/password-policy.test.ts
node node_modules/vitest/vitest.mjs run --config vitest.config.ts -t 'password'
python3 scripts/testing/run-node-suites.py --file tests/vst3-binary-inspection.test.mjs
.local/test-venv/bin/python scripts/testing/run-python-suites.py --file tests/test_secure_http.py
python3 scripts/testing/run-commerce.py --only inbound-billing.test.mjs
node scripts/testing/integration-browser.mjs tests/health.test.ts
```

Raw `npm run test:integration` and `test:integration:ci` expect an existing
application and can write data during setup/teardown. Use the isolated entry
point above for repeatable verification. Raw load/chaos/burn-in/provider scripts
also require their documented topology and opt-ins; the aggregate runner does
not point them at an arbitrary running application.

## Interpret and preserve evidence

- `summary.json` and `results.md` distinguish passes, actual failures, skipped
  cases and blocked operational checks. Each group retains JSON, logs and,
  where available, JUnit XML. Initial failures and subsequent rechecks remain
  separate; a repair does not erase its history.
- Node TAP totals can include parent tests; JUnit lists leaf cases. Python
  unittest subtests can appear in suite counters beyond XML testcase elements.
  Different count scopes are labeled and must not be added indiscriminately.
- The same source can belong to multiple configurations (for example
  cache-cross-pod); CI also repeats a subset of Node contracts. Those repeated
  executions are not additional unique coverage.
- Exit zero means selected executed commands passed. Any failing/timed-out
  command makes the aggregate exit nonzero. Blocked and skipped work remains
  unverified even when the executed subset exits zero. No test runner certifies
  production model quality, provider delivery or Replit deployment by itself.
- `sourceRevision` records the checkout baseline; source SHA-256 values bind
  reviewed working-tree test changes. The catalog generator detects omitted
  files and changed inputs. Run `npm run test:catalog`, then
  `npm run test:catalog:check` after test changes.

Remote Stripe mutations, private-bucket writes, full fault-injection/load
topologies, specialized hardware and unavailable production model capability
are explicitly catalogued. The rerun did not substitute mocks for those live
journeys or count them as passing.
