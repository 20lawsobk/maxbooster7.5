# Collecting one existing Node suite without changing global coverage

This is the first isolated coverage producer from the
[implementation plan](coverage-producer-implementation-plan.md). It preserves
the actual JavaScript, source maps and V8 counters from an existing `node:test`
suite. Its output is **unmerged evidence**, not the platform's coverage result
and not production approval. Keep the 100% global thresholds unchanged.

## Commands

Use the installed Node 22 runtime and the root lockfile's dependencies. Run
these commands from the repository root:

```sh
node --test --test-reporter=tap tests/testing/coverage-provenance.test.mjs
node scripts/testing/collect-node-coverage.mjs \
  tests/fabric-replica-generation.test.mjs \
  reports/coverage-producer/my-new-owned-run
```

The first command runs fourteen framework tests. They exercise actual inspector
coverage with a Unicode fixture and a deliberately unexecuted branch, then
verify rejection of stale originals, substituted code, changed counters,
malformed offsets/encoding, missing source-map content, escaped paths,
incomplete producers and incompatible complete maps. Actual child-process
fixtures also verify timeout escalation, output bounds, missing executables and
preservation of both successful and nonzero direct exits while lingering owned
descendants are terminated. A real PostgreSQL suite is rejected before execution
or output creation.

The second command runs the existing two-assertion storage suite through an
internal inspector collector. Choose a **new** output directory beneath
`reports/`; the collector refuses to overwrite an existing attempt. Its first
argument must be exactly `tests/fabric-replica-generation.test.mjs`, the single
proven in-process `node:test` suite admitted by this P1 command. Other suites,
including PostgreSQL fixtures, are rejected before execution or output creation.
It executes with `tsx`, one test worker, a two-minute timeout and a
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
if the behavioral assertions pass. This inventory currently has its own
documented selection algorithm; its digest is not interchangeable with the
master runner's differently selected source-input digest. The selection covers
the listed code/configuration extensions; it omits C/C++ files, `Cargo.lock`,
`go.sum` and Dockerfiles, and can include tracked historical PDIM JSON. It must
not be described as complete platform provenance or a canonical master identity.

## What the output means

`receipt.json` records the command, actual test exit, Node/V8 identity,
source-input stability and the resulting status. A successful collection says
`collected_unmerged` and `mergedIntoGlobalCoverage: false`.

Each process/thread profile contains `manifest.json`, `raw-v8.json`, actual
executed `.js` bytes and source maps. The manifest hashes every retained input.
Original source content must match the current repository bytes, and offsets
must fit the executed JavaScript's UTF-16 length. Invalid or missing TypeScript
maps fail collection. Package source is outside this isolated application-source
profile; that choice does not remove anything from the global denominator.

`node-native-corroboration/` contains Node's own coverage output. The installed
`tsx` loader uses that setting to retain source-map `sourcesContent`. The
internal inspector's single final snapshot is the authoritative counter source;
the native output is **not added** to those same counters.

`coverage-final.json` and `coverage-summary.json` describe only the retained
executed files. The receipt compares all three complete Istanbul maps against
the saved global profile. A mismatch rejects combination for that file. Equal
function maps do not permit copying hits when statement or branch maps differ.
The command never writes the global profile or raises its measured percentages.

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

This command is intentionally a standalone first producer. It has not yet been
wired into the master Node runner, SQL bundle retention, HTTP server processes
or browser CDP targets. It does not prove complete child-process accounting or
capture production subjects whose generated bundles have already been removed.
Those boundaries and consistent full-profile conversion remain explicit later
steps in the implementation plan; do not enable a platform-wide merge until
they are implemented and verified.
