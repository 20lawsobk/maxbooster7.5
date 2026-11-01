# Deployment/scanner closure execution

Decision: **NOT READY**. No application startup, installation, environment change,
database/provider call, destructive deploy build, or scanner-success claim.

## Concrete repairs

- Added `scripts/verify-runtime-artifacts.mjs`, a read-only fail-closed gate with
  three modes: `dependencies`, `capsules`, `restored` (optional release-root arg).
- Dependency mode examines physical installed copies (including pnpm virtual stores,
  nested and hoisted copies), not merely desired lock versions. Reports actual Node
  consumer search-path resolutions separately. Rejects missing trees, broken links,
  workspace escapes, prereleases, unknown major upgrades and versions below reviewed
  floors for fast-uri, js-yaml, qs, multer, tar and xmldom. This deliberately is a
  targeted remediation gate, **not a complete dependency scanner or SBOM**.
- `script/build.ts` now runs that gate before deploy build work/deletion. A corrected
  lock with stale installed copies can no longer be shipped silently by this path.
- CI runs all three gates after the shipped capsule restore. Capsule mode requires
  all five capsules/manifests, streams actual archive hashes (bounded memory), validates
  digest/codec and rejects missing/empty/escaping files. Restored mode requires launch
  bundles, web index, interpreter/native binaries and pinned Node provenance, checks
  executable permissions and JS/shell syntax **without executing application code**.
- Existing CI restores real archives before these checks. Checksums alone are not
  archive-format validation, a signature or trusted provenance; these gates make no
  such claim. The historical closure report's artifact-manifest-verifier assertion was
  not supported by current build source; the concrete verifier is now present.

## Local evidence and package reconciliation required

Read safety memory on destructive capsule packing and stale pnpm hoisted copies.
Only bounded temporary fixtures were modified/deleted.

`env -i PATH="$PATH" node --test tests/runtime-artifact-gates.test.mjs tests/deployment-contracts.cjs`
passed **12/12**: stale nested copy despite patched lock, missing/prerelease/escaping
dependency failures, missing/corrupt/unknown-codec capsule failures, nonexecuting bundle
syntax checks, real fixture capsule restore/replacement/corruption rejection, cgroup
CPU/RAM sizing/minima/overrides, readiness single-flight/expiry and Sentry outage timing.
These are isolated source/fixture tests, not packed production startup or measured load.

Actual `dependencies` CLI exits **1**, with **17 failures**, 18 audited physical
occurrences. API-server resolution confirms:

| Consumer | Installed | Required validated floor |
|---|---|---|
| MaxCore | fast-uri 3.1.3 | 3.1.6 |
| MaxCore | js-yaml 4.3.0 | 4.3.2 |
| MaxCore | qs 6.15.3 | 6.16.0 |
| PDIM | multer 2.2.0 | 2.4.0 |

PDIM's virtual store additionally contains fast-uri 3.1.0 and qs 6.15.3. MaxCore has
eight dangling virtual-store links: ansi-colors, bare-os, enquirer, globby, ignore,
is-path-inside, slash, socks. Reconcile **both independent nested workspaces** through
an authorized directory-aware frozen pnpm install, including stale generated hoisted
copies and unreachable virtual-store remnants that are still shipped. Do not manually
copy root packages into these trees or fabricate lock integrity. Root targeted installed
versions pass; no root manifest/lock change is requested by this evidence.

## Remaining release blockers

- Authorized nested dependency reconciliation and rerun of the gate. No installs
  were permitted in this assignment.
- Isolated clean deployment build and actual cold `start.sh` boot with shipped Node,
  Python, Boosterstate and both sidecars, dependency-ready routing, shutdown/failure
  paths, bounded startup time and no build-host/Nix dependency. Cargo is absent from
  current PATH; zstd and bsdtar are available. Never execute DEPLOY_PACK in this workspace.
- Node archive checksum is downloaded from the same origin, not independently pinned/
  signed provenance. Python interpreter archive provenance and shipped Python AnyIO
  TLS/cancellation runtime tests remain unverified.
- Actual supported-profile authenticated spike/soak workloads, native/Python RSS,
  process-tree limits, disk/extraction headroom, OOM behavior and latency remain absent.
  Allocation math passing is not resource-limit enforcement.
- Fresh artifact-bound full dependency/SBOM attribution (including Rust/Go/Python),
  completed revision/ruleset/coverage-bound SAST and review of all findings. Existing
  security readiness gate still intentionally rejects incomplete evidence; no scanner
  suppressions or manufactured scanner artifacts were added.
- Public DNS/TLS, Sentry delivery and branch-required CI enforcement remain external
  gates. Migration/storage safety prerequisites still prohibit assembled activation.

## Follow-up: directory-aware frozen reconciliation

Implemented `scripts/reconcile-nested-dependencies.mjs`. The main agent is the
designated installer; this worker has **not** run its live `--apply` mode.

Commands (repository root; workflows must stay removed):

```sh
# Read-only, offline frozen lock consistency diagnosis; completed successfully for both.
node scripts/reconcile-nested-dependencies.mjs
# Authorized installer: clean staged install, verify, exchange only generated modules.
node scripts/reconcile-nested-dependencies.mjs --apply --online
# Confirm actual physical copies and Node consumer resolutions after installation.
node scripts/verify-runtime-artifacts.mjs dependencies
```

Either command accepts `external/maxcore` or `external/pdim` to limit scope.
Default apply is offline; `--online` explicitly permits normal pnpm package-registry
fetches only. No service/application calls are made. Diagnosis is bounded to 60s per
workspace; install is bounded to 240s per workspace. No retry without understanding
a frozen-lock or package-fetch failure.

Mechanism:

- Copies only workspace package/config/lock files into isolated staging; validates
  those exact bytes before and after pnpm. Existing source, manifests and locks are
  never overwritten. Manager auto-download is disabled; available pnpm tooling is used.
- Uses `--frozen-lockfile --ignore-scripts`; preinstall cannot delete alternate locks,
  and package hooks cannot start apps, fetch browsers or alter source.
- Cleans stale trees by replacing generated node_modules, **not by overlaying**.
  All workspace package module directories are included. Both installed staged tree
  and promoted runtime must pass the dependency gate. On promotion failure restores
  prior generated directories; failed rollback retains explicit recovery backups.
- Apply staging uses the workspace's filesystem because `/tmp` is on a different
  device here; rename atomicity is checked before any install. Successful runs remove
  backups/staging so stale copies are not shipped.
- Missing package content/cache or policy-blocked downloads fail without weakening
  registry policy, lock integrity or introducing archive stubs.

**Evidence:** real offline frozen-lock diagnosis passes independently for MaxCore
and PDIM; neither installed tree was changed. Nine focused tests pass (five new
reconciliation fixture cases + four artifact/dependency gate cases), covering successful
replacement/source preservation, failed install preservation, unexpected lock mutation,
read-only diagnosis and rejection of a newly installed stale package. Fake pnpm in
these tests is explicitly an isolated process boundary, not package-install evidence.

Lifecycle scripts are deliberately disabled. After actual install, separately validate
needed native addons/binaries in a safe build environment; a resolved version pass does
not claim native runtime compatibility. An interrupted/killed promotion may need manual
recovery from the named staging backup; do not delete surviving backup directories blindly.

### Fresh dependency scan reconciliation

The supplied fresh scan contains 72 findings, including 10 high occurrences:
eight are four fast-uri advisories against versions 3.1.5 and 4.1.2; two concern
extract-zip 2.0.1 with **no fix version provided**. This is not 10 independent packages.

- Both nested locks already resolve fast-uri **3.1.6**, and both frozen diagnoses pass.
  Root override also requests 3.1.6. No additional root manifest change is needed for
  this package; reinstallation and artifact attribution are needed, not another override.
- MaxCore still locks `scripts -> puppeteer-core -> @puppeteer/browsers@2.13.2 ->
  extract-zip@2.0.1` (with yauzl 2.10.0). A clean frozen install does **not** remediate
  those two high findings. Need a verified upstream patched/replacement consumer
  contract or reviewed removal of this actual browser tool. Do not alias a stub or
  suppress the advisory. Root override `extract-zip >=2.0.0` alone cannot prove a fix;
  current root lock also contains separately named `@electron-internal/extract-zip@1.0.5`,
  which must not be conflated with the MaxCore package without advisory attribution.
- `boosterstate/Cargo.lock` still pins **anyhow 1.0.101**; scan recommends **1.0.103**.
  Existing `Cargo.toml` requirement `"1"` permits it. Exact package-tool action once
  cargo is available: `cargo update --manifest-path boosterstate/Cargo.toml -p anyhow
  --precise 1.0.103`, then locked Rust build/tests and rescan. Cargo is not on PATH;
  no manual lock checksum fabrication was attempted.
- No Python findings occur in this supplied fresh scan. Both MaxCore Python locks
  already resolve AnyIO **4.14.2** and both manifests require `>=4.14.2,<5`.
  This is lock evidence only; shipped-environment import/TLS/cancellation verification
  remains outstanding. No evidence justified another Python constraint change here.

SAST remains incomplete. Release decision stays blocked even after targeted nested
install reconciliation succeeds.

## Subsequent execution: extract-zip consumer and Rust repaired

This section supersedes the earlier nested-install and unavailable-Cargo obstacles.
The main agent first successfully ran the two-workspace frozen installer; current
`verify-runtime-artifacts.mjs dependencies` passes with **15 audited physical
occurrences and zero failures**.

### Genuine upstream extract-zip removal, without losing the consumer

- Proved Puppeteer is **used** by `external/maxcore/scripts/src/generate-patent.ts`.
  Did not remove the PDF generator, exclude its dependency from scans, or replace
  archive extraction with a stub.
- Registry metadata identifies `puppeteer-core@25.11.0` with
  `@puppeteer/browsers@3.2.2`; that upstream browser-manager release has no
  extract-zip dependency (uses modern-tar). Requires Node >=22.12.0, compatible
  with this project's pinned deployment Node 22.22.0.
- Updated **only** MaxCore scripts' Puppeteer requirement and its independent pnpm
  lock using pnpm package tooling, then ran the directory-aware staged
  `--apply --online external/maxcore` reconciliation successfully. Installed
  Puppeteer is 25.11.0 and browser manager is 3.2.2. The authoritative MaxCore
  lock no longer contains `extract-zip@`; old package trees were removed by clean
  promotion. This is an upstream dependency-graph change, not an advisory suppression.
- Refactored the existing patent CLI minimally to export its actual rendering
  function for isolated acceptance, retain its CLI/default paths, close Chromium
  even on failure, and correctly encode local file URLs.
- `node --import tsx --test tests/patent-pdf-runtime.test.mjs` passes **2/2**:
  checks installed upstream versions/absence of extract-zip dependency, then invokes
  the **actual consumer** using configured Chromium on a bounded local HTML fixture,
  produces a real ~17 KiB `%PDF-` document with Letter MediaBox, and rejects a missing
  local input. Fixture includes restrictive CSP; no application/server/provider or
  external document is used. Existing patent/customer assets are not overwritten.
- MaxCore scripts `tsc --noEmit` passes. Root manifest/lock were not edited.
  Full fresh scanner evidence is still required to attribute all remaining
  observations and evaluate the new upstream graph.

### On-demand Rust update and real isolated tests

Read `.agents/memory/replit-nix-feeds-deploy-closure.md`. No separate project wrapper
was found; its documented `nix-shell -p cargo rustc --run ...` wrapper works and
provides Cargo 1.86.0 **without** adding permanent Rust packages to replit.nix.

Executed successfully:

```sh
nix-shell -p cargo rustc --run \
  'cargo update --manifest-path boosterstate/Cargo.toml -p anyhow --precise 1.0.103'
nix-shell -p cargo rustc --run \
  'CARGO_TARGET_DIR=/tmp/closure-boosterstate-target cargo test --locked --manifest-path boosterstate/Cargo.toml'
```

Cargo generated the genuine anyhow **1.0.103** lock entry/checksum; only that
package's version/checksum changed in Cargo.lock. Added
`boosterstate/tests/runtime_dependency.rs`: actual FileWal I/O errors retain anyhow
context/source/downcast and actual append/fsync/reopen preserves the record.
**2/2 Rust integration tests pass**, with locked compilation of the library/binary
and doc-test targets. Existing unit/doc targets contain zero tests; not represented
as extra coverage. Only disposable local fixture WAL files were used. No service
was launched and no live state/storage was accessed.

The broader isolated deployment/reconciliation suite also passes **17/17** after
these changes. Native production release build, packed cold-image boot, real
resource/load acceptance, full artifact scan and completed SAST remain required.

## Final scan follow-up: independent DNS workspace and remaining moderates

The eight high findings in `closure-dependency-scan-final.json` were **not dismissed
as scanner staleness**. Filesystem/lock attribution identified the independent DNS
workspace, which was not previously covered by the installed-tree gate:

| Original occurrence | Authoritative path and parent |
|---|---|
| fast-uri 3.1.5 | `dns-os/package-lock.json`, `packages["node_modules/ajv/node_modules/fast-uri"]`; parent AJV 8.20.0 requires ^3.0.1 |
| fast-uri 4.1.2 | same lock, `packages["node_modules/fast-uri"]`; @fastify/ajv-compiler 4.0.6 and fast-json-stringify 7.0.1 require ^4.0.0 |

The consumer is `dns-os/services/dns-api` -> Fastify 5.12.1. DNS had no installed
node_modules initially. The root and current MaxCore/PDIM manifests, locks and
installed trees did not contain either vulnerable version. No root package/lock/
installed-tree changes were made, so the main agent's root typecheck/beta dependency
environment was not changed by this repair.

### Actual compatible package repair

Ran in the independent `dns-os` directory:

```sh
npm update fast-uri --package-lock-only --ignore-scripts --no-audit --no-fund
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci --ignore-scripts --no-audit --no-fund
npm ls fast-uri --all
npm --workspace=services/dns-api exec -- tsc --noEmit
```

Manager resolution selected **3.1.8** and **4.2.1**, respectively, rather than the
minimum patched 3.1.6/4.1.3. Both preserve the original parent major/range contracts
and exceed the requested fix floors. The lock was generated by npm with real
registry integrity data; no forced cross-major override or fabricated tarball.
Temporary attempted overrides were removed: the final DNS manifest is unchanged.
Both lock and actual installed consumer resolutions now agree.

Extended the runtime gate to cover `dns-os` and independently validate fast-uri
3.x >=3.1.6 and 4.x >=4.1.3. Added CI independent-workspace installation before the
packed build, rather than silently excluding DNS from release checks. Current
installed-tree gate passes **17 audited physical copies / zero failures**.

`tests/dns-dependency-consumers.test.mjs` verifies actual AJV, compiler and serializer
resolution plus URI parsing/resolution; real Fastify schema-reference compilation,
serialization and invalid-request rejection use in-process injection without listen,
application bootstrap, DB or network. DNS TypeScript check passes. Combined focused
deployment/dependency suite now passes **20/20**.

### Go and Rust moderate findings repaired through package tooling

All Go module findings attribute to `dns-os/services/dns-authoritative/go.mod`/
`go.sum`; the available compiler is already Go **1.26.5**, not a new permanent
toolchain installation. Ran:

```sh
# In dns-os/services/dns-authoritative
GOTOOLCHAIN=local go get github.com/jackc/pgx/v5@v5.9.2 golang.org/x/mod@v0.40.0
GOTOOLCHAIN=local go mod tidy
GOTOOLCHAIN=local go mod edit -go=1.25.13 -toolchain=go1.26.5
GOTOOLCHAIN=local go test -mod=readonly ./...
GOTOOLCHAIN=local go build -mod=readonly -o /tmp/closure-dns-authoritative .
go version -m /tmp/closure-dns-authoritative
```

Resolved pgx **5.9.2**, x/mod **0.40.0**, x/net **0.58.0**, x/text **0.41.0**.
The x/mod dependency graph requires x/net 0.58.0, so forcing the older advisory
minimum 0.56.0 was correctly rejected; Go selected compatible transitive x/sync
0.22.0, x/sys 0.47.0 and x/tools 0.49.0. Raised the module's minimum patch directive
from vulnerable 1.25.0 to 1.25.13 and pinned preferred toolchain 1.26.5. Updated the
DNS Docker builder from obsolete 1.22-alpine to **1.26.5-alpine**; actual Docker image
pull/build/digest remains unverified, not claimed by the local Go build.

An initial attempt to fetch Go 1.25.13 was rejected because this environment has
GOSUMDB=off. No security setting was weakened or firewall bypassed; the existing
newer local compiler was used instead. Actual built executable metadata confirms
Go 1.26.5 and updated runtime module versions. Added two tests for pgx configuration
parsing/errors (no connect) and actual DNS record construction/wire roundtrip.
**2/2 Go tests pass**; no DNS listener or database was started.

The remaining Rust moderate fxhash 0.2.1 was an **unused direct manifest dependency**:
all Boosterstate source uses standard collections, with no fxhash/FxHash references.
Removed it with:

```sh
nix-shell -p cargo rustc --run \
  'cargo remove --manifest-path boosterstate/Cargo.toml fxhash'
```

Cargo removed fxhash and its now-unreferenced byteorder lock entry. The locked
Boosterstate build and both integration tests pass after removal. This does not
remove application functionality or suppress an advisory.

### Historical copies and limits of this evidence

Found genuine older simulation artifacts under
`.local/production-simulation/runs/2026-09-17T08-43-27-758Z/app/`, including:

- `package-lock.json`, `pnpm-lock.yaml` and installed `node_modules/fast-uri`
  contain 3.1.5.
- `dns-os/package-lock.json` contains both 3.1.5 and 4.1.2.
- Its nested MaxCore/PDIM locks and installed trees contain still older 3.1.3/3.1.0.

These are dated retained simulation inputs, **not silently certified clean**. Existing
`.dockerignore` lines 23–25 and `.gitignore` already exclude `.local`; no exclusion was
added by this work. `scripts/simulate-production.mjs` documents retention for resume.
Did not rewrite historical evidence to look patched or destroy the retained run.
Never promote/resume that old snapshot as acceptance for this release: create a fresh
simulation and scan the exact shipped artifact. If scanner scope intentionally includes
historical simulation storage, these occurrences remain attributable findings there.

Current DNS lock SHA256:
`ef93173d07a237289d82759e1c05468b706ecaadffaa49c74f9dbf0dd32ba875`.
Historical snapshot DNS lock SHA256:
`cff66fa0b519fd6be5a69394bafcb3280783b65d2818ace8af651215d77df820`.
Their differing contents and actual filesystem paths establish provenance, not a
guess that the scanner was stale. Fresh full scanner/SAST evidence is still needed;
no zero-finding outcome is fabricated here.

## Patch-level follow-up: Go 1.26.6 and esbuild

The next supplied audit reached zero critical/high but identified eight Go stdlib
1.26.5 moderates fixed in 1.26.6 and one esbuild 0.27.7 low fixed in 0.28.1.

### Go patch update executed and verified

Downloaded the on-demand Go **1.26.6** toolchain using normal Go tooling with
`GOSUMDB=sum.golang.org` enabled **for these commands only**. This strengthens,
rather than disables, toolchain verification; no persistent environment/Nix change.
Updated the DNS module minimum to **go 1.26.6** through `go mod edit`; tidy removed
the now-redundant separate toolchain line. Docker builder now `golang:1.26.6-alpine`.

```sh
GOTOOLCHAIN=go1.26.6 GOSUMDB=sum.golang.org go version
# In dns-os/services/dns-authoritative:
GOTOOLCHAIN=go1.26.6 GOSUMDB=sum.golang.org go mod edit -go=1.26.6 -toolchain=go1.26.6
GOTOOLCHAIN=go1.26.6 GOSUMDB=sum.golang.org go mod tidy
GOTOOLCHAIN=go1.26.6 GOSUMDB=sum.golang.org go test -mod=readonly ./...
GOTOOLCHAIN=go1.26.6 GOSUMDB=sum.golang.org CGO_ENABLED=0 GOOS=linux \
  go build -mod=readonly -ldflags='-s -w' -o /tmp/closure-dns-authoritative-go1266 .
GOTOOLCHAIN=go1.26.6 GOSUMDB=sum.golang.org \
  go version -m /tmp/closure-dns-authoritative-go1266
```

Two actual Go consumer tests pass; built executable metadata confirms **go1.26.6**,
CGO_ENABLED=0 and the previously repaired runtime modules. No executable was started.
Default shell commands inside the module still require checksum verification enabled
if auto-selecting/downloading this toolchain; an invocation inheriting GOSUMDB=off
correctly refuses toolchain verification. The Docker builder already has the requested
compiler and does not depend on this development download path. Image pull/build
remains unexecuted.

### Independent TLS proxy fixed; root binary action handed to main

Found a second real esbuild chain in `tls-proxy/package-lock.json`:
`node_modules/esbuild` and `node_modules/@esbuild/linux-x64` both **0.27.7**, from
the proxy's `tsx` development consumer. Ran independently in `tls-proxy`:

```sh
npm update tsx --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci --ignore-scripts --no-audit --no-fund
npm ls tsx esbuild @esbuild/linux-x64
npm exec -- tsc --noEmit
```

Actual installed and lock resolution: **tsx 4.23.15 -> esbuild 0.28.2 ->
@esbuild/linux-x64 0.28.2**. Existing manifest range accepts the maintained consumer
update; no manifest override is needed. TLS TypeScript check passes. New isolated
tests invoke actual TLS tsx CLI on a TypeScript fixture and actual matching native
esbuild transformation; **2/2 pass**, with no proxy/app start or external calls.
Combined focused runtime suite passes **22/22**.

Extended fail-closed gate to TLS and esbuild/native-binary floor **0.28.1**; CI now
installs this independent workspace before packed verification. It intentionally
detects the remaining root occurrence instead of treating the patched JS wrapper
as proof of every shipped binary:

- `package.json`: `optionalDependencies["@esbuild/linux-x64"] = "^0.27.3"`.
- `package-lock.json`: `packages["node_modules/@esbuild/linux-x64"] = 0.27.7`.
- `pnpm-lock.yaml`: root optional importer and package snapshot resolve 0.27.7.
- Actual `node_modules/@esbuild/linux-x64/package.json` is **0.27.7**.
- Root esbuild itself and its own nested platform binary are already **0.28.2**;
  this extra root optional binary is the stale occurrence.

**Main-agent action:** after the active root typecheck completes, pause/remove
workflow before the authorized package callback. Align root optional
`@esbuild/linux-x64` to **0.28.2**, regenerate **both root locks** through the approved
package tooling and verify actual installed resolution. Do not manually edit integrity
fields or remove history. Existing broad `dependencies.esbuild`/`overrides.esbuild`
`>=0.25.12` can also be raised to `>=0.28.1` to prevent a later vulnerable resolution;
the current installed JS library itself does not require replacement.

No root manifest/lock/node_modules edits were made by this worker while the main
typecheck runs. Current expanded runtime gate exits **1**, solely for the root
0.27.7 native binary (28 audited physical occurrences). This is an intentional
pending installation block, not a claimed all-green result. Fresh full scan and
remaining original release/SAST/cold-image/load evidence are still required.