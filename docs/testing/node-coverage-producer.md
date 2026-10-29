# Collecting one existing Node suite without changing global coverage

The current C5 producer uses a shared Vite/Vitest conversion contract and strict
typed coordinate sidecars. The historical tsx attempts below remain immutable;
the final section records the new producer and its bounded acceptance results.
This continues the isolated coverage producer from the
[implementation plan](coverage-producer-implementation-plan.md). It preserves
the actual JavaScript, source maps and V8 counters from an existing `node:test`
suite. Its output is **unmerged evidence**, not the platform's coverage result
and not production approval. Keep the 100% global thresholds unchanged.

## Commands

Use the installed Node 22 runtime and the root lockfile's dependencies. Run
these commands from the repository root:

```sh
node --test --test-reporter=tap tests/testing/coverage-provenance.test.mjs \
  tests/testing/coverage-coordinate-contract.test.mjs
node scripts/testing/collect-node-coverage.mjs \
  tests/fabric-replica-generation.test.mjs \
  reports/coverage-producer/my-new-owned-run
```

The first command runs twenty-two original framework tests plus fifty shared
producer/typed-wire regressions. The original tests exercise actual inspector
coverage with a Unicode fixture and a deliberately unexecuted branch, then
verify rejection of stale originals, substituted code, changed counters,
malformed offsets/encoding, missing source-map content, escaped paths,
incomplete producers and incompatible complete maps. Actual child-process
fixtures also verify timeout escalation, output bounds, missing executables and
preservation of both successful and nonzero direct exits while lingering owned
descendants are terminated. A real PostgreSQL suite is rejected before execution
or output creation. Eight additional tests cover actual compiler-generated
keep-name helpers, authored lookalikes/collisions, mapped prefixes, reassigned
bindings, Unicode declarations and function-valued wrappers. An actual isolated
VM/inspector fixture verifies complete original maps against a compiler control,
with an uncalled original function and unexecuted branches/statements still
present at zero hits. The control supplies denominator identity only; its empty
counters are never represented as executed evidence.

The second command runs the existing two-assertion storage suite through an
internal inspector collector. Choose a **new** output directory beneath
`reports/`; the collector refuses to overwrite an existing attempt. Its first
argument must be exactly `tests/fabric-replica-generation.test.mjs`, the single
proven in-process `node:test` suite admitted by this P1 command. Other suites,
including PostgreSQL fixtures, are rejected before execution or output creation.
It executes through public Vite ModuleRunner APIs and an observed VM wrapper,
one test worker, a two-minute timeout and a
small explicitly constructed environment. It does not inherit application
credentials, `NODE_OPTIONS` or an ambient coverage selector. It opens no remote
debug port and creates a private temporary home beneath its owned output.
Collection requires POSIX process groups. Each invocation owns a detached group;
success, failure and timeout all trigger bounded TERM/KILL cleanup. Linux checks
remaining live members and records the result in the receipt. Defunct processes
are not reported as live. This does not account for a descendant deliberately
creating an independent session or group; wider process-tree accounting remains
unimplemented. `pg_ctl` daemonizes PostgreSQL into an independent session, so
database fixtures must not be added to this allowlist until their independent
sessions have verified ownership, tracking and cleanup. The command is not a
general replacement for the master Node runner.

Freeze source, tests, dependency locks and configuration during collection.
The collector inventories Git-visible code/configuration, including new
unignored files, before and after execution. Any change fails the attempt even
if the behavioral assertions pass. The current collector calls the authoritative `common.source_inputs` through a
credential-free, bounded Python 3 subprocess (`-I -B`), with a short private home
and temporary directory. Python 3 and Git are required. C/C++, SQL, lockfiles,
Docker files and new unignored source use exactly the same inventory as the
master; generated snapshots, reports and coverage outputs remain excluded.
The earlier collector's narrower digest is retained only in historical receipts.

## What the output means

`receipt.json` records the command, actual test exit, Node/V8 identity,
source-input stability and the resulting status. A successful collection says
`typed_collected_no_canonical_baseline_unmerged`, or
`typed_compatible_unmerged` after a fresh raw canonical baseline passes all
three complete map comparisons. Every result retains
`mergedIntoGlobalCoverage: false`.

Each process/thread profile contains `manifest.json`, `raw-v8.json`, actual
executed `.js` bytes and source maps. The manifest hashes every retained input.
Original source content must match the current repository bytes, and offsets
must fit the executed JavaScript's UTF-16 length. Invalid or missing TypeScript
maps fail collection. Package source is outside this isolated application-source
profile; that choice does not remove anything from the global denominator.

`node-native-corroboration/` contains Node's own coverage output. The Vite collector retains actual transform maps and source content separately. The
internal inspector's single final snapshot is the authoritative counter source;
the native output is **not added** to those same counters.

Each source has lossless `.raw.v8`, `.wire.json` and `.typed.json` artifacts.
The wire sidecar records every permitted positive-Infinity end column and
complete synthetic branch location before JSON loses its original type.
Decoding requires matching source, producer, body/map hashes and independent
pinned-provider replay. NaN, negative Infinity, partial undefined coordinates,
unsupported fields/prototypes, mismatched counters, stale wrappers and missing
raw records fail validation. The optional third command argument names a fresh
canonical `raw-p1` directory for strict complete-map comparison. Legacy untyped
JSON does not gain this contract through serialization.

An exit of zero establishes successful isolated collection. It does **not**
establish map compatibility, full feature coverage or launch readiness. Check
the receipt, the exact source revision/digests and every map comparison before
using the output as evidence. On failure, preserve the attempt and fix the
reported cause before collecting into a different directory.

## Recorded results and remaining producer work

[The retained attempt index](../../reports/coverage-producer/README.md) preserves
the initial missing-source-content failure, a source-drift rejection and the
stable successful run. The stable run retained nine executed production files;
all nine complete maps differed from the old global producer. They remain
separate, with no combined-coverage claim.

The [committed a160 producer recheck](../../reports/coverage-producer/2026-10-28-a1603b13-node/README.md)
again passed the existing two-assertion suite with unchanged selected inputs,
one retained profile, nine files and complete owned-group cleanup. Its digest
uses the collector's documented selection algorithm and is not the master's
full input identity. All nine profiles remain unmerged.

The [read-only compatibility trace](coverage-compatibility-trace.md) exactly
reproduced the nine retained Node JSON profiles and identified a concrete
converter defect. For `server/config/ports.ts`, compiler-generated keep-name
helpers add four statements and one anonymous function to the converted map
(25 statements/four functions versus the original producer's21/three), including
a phantom function credited to an original declaration. The helper prefix has
no mapped segments, while three helper calls explicitly map to original
identifier positions. Removing only unmapped generated text cannot establish
correct attribution. Raw Infinity coordinates serialize to null; explicit
undefined fields also explain some extra in-memory branch-map differences.
Three serialized branch maps match, but every complete statement/function map
still differs. No counters were combined or global percentage changed. Repair
and test original-source attribution before treating these converted maps as
compatible; the trace specifies the next C5 tasks and preserves the existing
P2–P7/C0–C7 dependencies.

The [committed keep-name repair and fresh collector](../../reports/coverage-producer/2026-10-28-keepnames-final/README.md)
ran from source `bca5f4e1f632db835dc90b1e57d85f919ed6e0aa`: 22 framework tests
passed with zero skips, and the actual existing two-assertion P1 suite again
passed. Both selected source inventories stayed unchanged, the one retained
profile covered nine files, and owned-group cleanup left zero live members.
Independent raw-manifest validation and exact reconversion reproduced all saved
profiles. The outer canonical input digest and the collector's different
selection digest are retained separately; canonical global coverage bytes did
not change.

The source now recognizes the exact unmapped esbuild keep-name binding pair,
absent from every original parsed identifier, and standalone helper calls
mapped exclusively to an actual original declaration name. Collisions and
ambiguous writers decline filtering. Original function-valued wrappers are
retained. Each ignored node records its exact code span/hash and proof reason;
original parser identity and source/map/runtime hashes are retained. For ports,
the phantom helper is gone: 21 original statements/three functions, with the
uncalled `loopbackUrl` still at zero hits.

All nine profiles **remain strictly incompatible and unmerged**. Disk-serialized
complete-map diagnostics match for ports and pdimCircuitBreaker; the other seven
still differ. Infinity/undefined coordinate differences remain explicit. That
diagnostic is not a normalization or merge policy. C5 complete-map compatibility,
P2–P7/C0–C7 producer/process integration and the full-platform 100% thresholds
remain open. The earlier trace's original failures remain historical evidence;
this repair does not retroactively change their outcomes.

The completed 10d master independently passes all 124canonical Node files
(690 TAPpasses,two skips including parents in692total), with common digest
`cbf794e080119fa4f64ec6ebce2b29b3d78641d606a3059c0c207b2420324418`
unchanged. Its actual instrumented global profile is13.11% lines,13.01% statements,
8.68% functions and 8.78% branches over 2,653 files; all 100%thresholds remain enforced
and failed. These Node assertions do not merge the separate bca profiles or
repair their seven remaining serialized-map mismatches.

The current 10d release also passes its four-command cold-startup rehearsal
and 37 independent checks from unchanged common/admitted inputs. That startup
scope retains productionReady:false; it does not merge coverage or certify
full generation, the actual Replit target or all-page acceptance.

This command is intentionally a standalone first producer. It has not yet been
wired into the master Node runner, SQL bundle retention, HTTP server processes
or browser CDP targets. It does not prove complete child-process accounting or
capture production subjects whose generated bundles have already been removed.
Those boundaries and consistent full-profile conversion remain explicit later
steps in the implementation plan; do not enable a platform-wide merge until
they are implemented and verified.

## C5 shared producer and current raw canonical capture

[The shared producer candidate](../../reports/coverage-producer/2026-10-28-shared-producer-candidate/README.md)
records the first strict same-contract result. The existing P1 suite passed both
assertions, all nine original scripts were observed with Debugger.getScriptSource,
and all 27 complete statement/function/branch maps matched a fresh canonical
pre-JSON sidecar. The actual executed prefix is 209 UTF-16 code units; its suffix,
body, maps, raw ranges, module identity and hashes reconstruct the observed code.
The uncalled original `loopbackUrl` and untouched branch arms remain present at
zero. Raw sentinels include 7,434 positive-Infinity end columns and 3,080 own
undefined coordinates forming 770 complete synthetic branch locations.

The new fifty portable cases cover finite/sentinel roundtrips, original TypeScript
AST provenance, authored helpers, public Vite SSR transformation, actual Unicode
VM/Debugger capture, raw-record/identity tampering, source-inventory conformance
and the public Istanbul reporter's inline/file contract lifecycle. Map-only
controls explicitly use zero counters and establish no application execution.

`vitest.platform.config.ts` now adds the public Istanbul reporter after the normal
reports. It writes nine selected lossless raw originals to `<reportsDirectory>/raw-p1`
using an inline versioned contract after Vitest cleans its report directory. The
full platform include/exclude lists and all four 100% thresholds remain enforced.
The focused candidate emitted 2,652 files; its one historical-only runtime-imported
JSON rules file must return under final full-master denominator verification. This reporter changes no maps or counters.

From the repository root, collect a new canonical profile and a separate P1 proof:

```sh
MAXBOOSTER_TEST_COVERAGE_DIR=reports/coverage-producer/canonical-new \
  npm run test:platform:coverage
node scripts/testing/collect-node-coverage.mjs \
  tests/fabric-replica-generation.test.mjs \
  reports/coverage-producer/p1-new \
  reports/coverage-producer/canonical-new/raw-p1
```

A failed coverage threshold remains a failure; inspect the retained assertion
results and exact failure reason. The focused canonical candidate passed its two
existing SQL files/43 assertions and retained 2,652 focused files, while its
focused counters failed all four 100% thresholds. Its output is not a replacement
for a full master run. Both producers completed owned cleanup with no surviving
owned processes or SQL daemons, and the historical global coverage bytes stayed
unchanged. The current collector's source digest matches the master's full
inventory; the earlier narrower selection is explicitly historical.

These profiles remain **UNMERGED**. A later admission gate must bind the final
same-source master, complete original maps, unique producer/snapshot identities,
reset/overlap semantics and every source/runtime artifact before combining hits.
The broader SQL, server/child, browser/worker, other-language and all-80-page
acceptance work remains required. The shared producer does not grant production
approval or increase the published global percentages by itself.
